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