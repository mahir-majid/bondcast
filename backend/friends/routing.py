from django.urls import re_path  # type: ignore
from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/friend-requests/$", consumers.FriendRequestConsumer.as_asgi()),
] 