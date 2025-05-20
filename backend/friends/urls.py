from django.urls import path
from .views import FriendListView, AddFriendView, RemoveFriendView

urlpatterns = [
    path('list/', FriendListView.as_view(), name='friend-list'),
    path('add/', AddFriendView.as_view(), name='friend-add'),
    path('remove/', RemoveFriendView.as_view(), name='friend-remove'),
]
