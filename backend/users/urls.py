# users/urls.py
from django.urls import path
from .views import UserRegisterView, CheckUserExistsView, LoginOrRegisterJWTView, VerifyUserJWT, LogoutView, RefreshJWTView

urlpatterns = [
    path('register/', UserRegisterView.as_view(), name='register'),
    path('check-exists/', CheckUserExistsView.as_view(), name='check-exists'),
    path('get-jwt/', LoginOrRegisterJWTView.as_view(), name="get-jwt"),
    path('validate-jwt/', VerifyUserJWT.as_view(), name="validate-jwt"),
    path('logout-jwt/', LogoutView.as_view(), name="logout-jwt"),
    path('refresh-jwt/', RefreshJWTView.as_view(), name="refresh-jwt"),
]
