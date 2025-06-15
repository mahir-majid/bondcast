# users/urls.py
from django.urls import path
from .views import UserRegisterView, CheckUserExistsView, LoginOrRegisterJWTView, VerifyUserJWT 
from .views import LogoutView, RefreshJWTView, SendVerificationCodeView, CheckVerificationCodeView
from .views import SendPasswordResetCodeView, VerifyPasswordResetCodeView, ChangePasswordView

urlpatterns = [
    path('register/', UserRegisterView.as_view(), name='register'),
    path('check-exists/', CheckUserExistsView.as_view(), name='check-exists'),
    path('get-jwt/', LoginOrRegisterJWTView.as_view(), name="get-jwt"),
    path('validate-jwt/', VerifyUserJWT.as_view(), name="validate-jwt"),
    path('logout-jwt/', LogoutView.as_view(), name="logout-jwt"),
    path('refresh-jwt/', RefreshJWTView.as_view(), name="refresh-jwt"),
    path('send-verification-code/', SendVerificationCodeView.as_view(), name="send-verification-code"),
    path('check-verification-code/', CheckVerificationCodeView.as_view(), name='check-verification-code'),
    path('send-password-reset-code/', SendPasswordResetCodeView.as_view(), name='send-password-reset-code'),
    path('verify-password-reset-code/', VerifyPasswordResetCodeView.as_view(), name='verify-password-reset-code'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
]
