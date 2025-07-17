# users/urls.py
from django.urls import path  # type: ignore
from .views import (
    SendFriendRequestView, AcceptFriendRequestView, DeclineFriendRequestView, RemoveFriendView,
    GetConversationView, SendMessageView, MarkMessagesAsReadView, GetUnreadCountsView
)

urlpatterns = [
    path('add/', SendFriendRequestView.as_view(), name='add-friend'),
    path('accept/', AcceptFriendRequestView.as_view(), name='accept-friend'),
    path('decline/', DeclineFriendRequestView.as_view(), name='decline-friend'),
    path('remove/', RemoveFriendView.as_view(), name='remove-friend'),
    
    # New conversation and message endpoints
    path('unread-counts/', GetUnreadCountsView.as_view(), name='get-unread-counts'),
    path('conversation/<str:friend_username>/', GetConversationView.as_view(), name='get-conversation'),
    path('send/', SendMessageView.as_view(), name='send-message'),
    path('mark-read/', MarkMessagesAsReadView.as_view(), name='mark-messages-read'),
]

