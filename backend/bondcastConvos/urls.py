from django.urls import path  # type: ignore
from .views import SetIntroView

urlpatterns = [
    # ... existing urls ...
    path('generate-greeting/', SetIntroView.as_view(), name='set_greeting'),
] 