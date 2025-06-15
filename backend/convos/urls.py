from django.urls import path
from .views import SetGreetingView

urlpatterns = [
    # ... existing urls ...
    path('generate-greeting/', SetGreetingView.as_view(), name='set_greeting'),
] 