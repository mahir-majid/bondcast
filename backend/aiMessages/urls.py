from django.urls import path  # type: ignore
from . import views

urlpatterns = [
    path('conversation/', views.AIConversationView.as_view(), name='ai-conversation'),
    path('send/', views.SendMessageView.as_view(), name='send-ai-message'),
    path('mark-read/', views.MarkMessagesReadView.as_view(), name='mark-ai-messages-read'),
]
