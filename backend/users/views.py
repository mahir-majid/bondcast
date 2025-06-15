from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from .serializers import UserSerializer
from rest_framework.response import Response
from .models import CustomUser
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.views import TokenRefreshView
import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import random
from django.core.cache import cache

SENDGRID_API_KEY = os.getenv('SENDGRID_API_KEY')
SENDGRID_JOIN_TEMPLATE_ID = os.getenv('SENDGRID_JOIN_TEMPLATE_ID')
SENDGRID_CHANGE_PASSWORD_TEMPLATE_ID = os.getenv('SENDGRID_CHANGE_PASSWORD_TEMPLATE_ID')

# Cache settings
VERIFICATION_CODE_TIMEOUT = 600  # 10 minutes in seconds
CACHE_KEY_PREFIX = 'verification_code_'
PASSWORD_RESET_KEY_PREFIX = 'password_reset_code_'

# Registers a new user that signed up
class UserRegisterView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]

    def perform_create(self, serializer):
        # save with password hashing
        serializer.save()

# Checking if there's an existing user with provided sign up email
class CheckUserExistsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        email = request.query_params.get('email', '')
        username = request.query_params.get('username', '')

        email_exists = CustomUser.objects.filter(email=email).exists() if email else False
        username_exists = CustomUser.objects.filter(username=username).exists() if username else False

        return Response({
            'emailExists': email_exists,
            'usernameExists': username_exists,
        })

User = get_user_model()

# Getting JWT based on logging in with username / password (use for first time registering too)
class LoginOrRegisterJWTView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "")

        # 1. Both fields must be provided
        if not username or not password:
            return Response(
                {"error": "Username and password are required"},
            )

        # 2. Look up the user by username
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response(
                {"error": "Username not found"},
            )

        # 3. Check the password
        if not user.check_password(password):
            return Response(
                {"error": "Incorrect password"},
            )

        # 4. Issue tokens
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "username": user.username,
                    "firstname": user.firstname,
                    "lastname": user.lastname,
                    "dob": user.dob,
                },
            }
        )

# Enables authenticated pages to verify user's JWT
class VerifyUserJWT(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "firstname": user.firstname,
            "lastname": user.lastname,
            "dob": user.dob,
        })

# Upon logging out, getting rid of user's JWTs
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(status=status.HTTP_205_RESET_CONTENT)

# Handle token refresh
class RefreshJWTView(TokenRefreshView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        try:
            response = super().post(request, *args, **kwargs)
            return response
        except Exception as e:
            return Response(
                {"error": "Invalid or expired refresh token"},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
class SendVerificationCodeView(APIView):
    permission_classes = [AllowAny]  # Open to unauthenticated users (e.g. sign up flow)

    def post(self, request):
        email = request.data.get("email")
        if not email:
            return Response({"error": "Email is required."}, status=400)

        # Generate random 6-digit code
        code = str(random.randint(100000, 999999))

        # Store code in cache with 10-minute expiration
        cache_key = f"{CACHE_KEY_PREFIX}{email}"
        cache.set(cache_key, code, VERIFICATION_CODE_TIMEOUT)

        # Send email with SendGrid
        try:
            sg = SendGridAPIClient(SENDGRID_API_KEY)
            message = Mail(
                from_email='no-reply@bondiver.com',
                to_emails=email,
            )
            message.template_id = SENDGRID_JOIN_TEMPLATE_ID
            message.dynamic_template_data = {
                'VERIFICATION_CODE': code,
                'email': email
            }
            
            response = sg.send(message)
            print(f'Email sent successfully. Status code: {response.status_code}')
            
            return Response({
                "success": True, 
                "message": "Verification code sent successfully."
            })
            
        except Exception as e:
            print(f'Error sending email: {str(e)}')
            # Remove the code from cache if email sending fails
            cache.delete(cache_key)
            return Response({
                "error": "Failed to send verification code. Please try again."
            }, status=500)

class CheckVerificationCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        code = request.data.get("code")

        if not email or not code:
            return Response({
                "error": "Email and verification code are required."
            }, status=400)

        # Get the stored code from cache
        cache_key = f"{CACHE_KEY_PREFIX}{email}"
        stored_code = cache.get(cache_key)

        if not stored_code:
            return Response({
                "error": "Verification code has expired. Please request a new one."
            }, status=400)

        if code != stored_code:
            return Response({
                "error": "Invalid verification code."
            }, status=400)

        # Code is valid, remove it from cache
        cache.delete(cache_key)

        return Response({
            "success": True,
            "message": "Verification code is valid."
        })

class SendPasswordResetCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        if not email:
            return Response({"error": "Email is required."}, status=400)

        # Check if user exists
        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            return Response({"error": "No account found with this email."}, status=404)

        # Generate random 6-digit code
        code = str(random.randint(100000, 999999))

        # Store code in cache with 10-minute expiration
        cache_key = f"{PASSWORD_RESET_KEY_PREFIX}{email}"
        cache.set(cache_key, code, VERIFICATION_CODE_TIMEOUT)

        # Send email with SendGrid
        try:
            sg = SendGridAPIClient(SENDGRID_API_KEY)
            message = Mail(
                from_email='no-reply@bondiver.com',
                to_emails=email,
            )
            message.template_id = SENDGRID_CHANGE_PASSWORD_TEMPLATE_ID
            message.dynamic_template_data = {
                'VERIFICATION_CODE': code,
                'email': email
            }
            
            response = sg.send(message)
            print(f'Password reset email sent successfully. Status code: {response.status_code}')
            
            return Response({
                "success": True, 
                "message": "Password reset code sent successfully."
            })
            
        except Exception as e:
            print(f'Error sending password reset email: {str(e)}')
            # Remove the code from cache if email sending fails
            cache.delete(cache_key)
            return Response({
                "error": "Failed to send password reset code. Please try again."
            }, status=500)

class VerifyPasswordResetCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        code = request.data.get("code")

        if not email or not code:
            return Response({
                "error": "Email and verification code are required."
            }, status=400)

        # Get the stored code from cache
        cache_key = f"{PASSWORD_RESET_KEY_PREFIX}{email}"
        stored_code = cache.get(cache_key)

        if not stored_code:
            return Response({
                "error": "Password reset code has expired. Please request a new one."
            }, status=400)

        if code != stored_code:
            return Response({
                "error": "Invalid verification code."
            }, status=400)

        # Code is valid, remove it from cache
        cache.delete(cache_key)

        return Response({
            "success": True,
            "message": "Verification code is valid."
        })

class ChangePasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        new_password = request.data.get("new_password")

        if not email or not new_password:
            return Response({
                "error": "Email and new password are required."
            }, status=400)

        try:
            user = CustomUser.objects.get(email=email)
            user.set_password(new_password)
            user.save()
            return Response({
                "success": True,
                "message": "Password changed successfully."
            })
        except CustomUser.DoesNotExist:
            return Response({
                "error": "User not found."
            }, status=404)
        except Exception as e:
            return Response({
                "error": "Failed to change password. Please try again."
            }, status=500)



