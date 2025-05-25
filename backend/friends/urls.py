# users/urls.py
from django.urls import path
from .views import SendFriendRequestView, AcceptFriendRequestView, DeclineFriendRequestView

urlpatterns = [
    path('add/', SendFriendRequestView.as_view(), name='add-friend'),
    path('accept/', AcceptFriendRequestView.as_view(), name='accept-friend'),
    path('decline/', DeclineFriendRequestView.as_view(), name='decline-friend'),
]

