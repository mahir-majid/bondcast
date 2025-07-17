from django.urls import re_path  # type: ignore
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/bondcast-requests/(?P<username>\w+)/(?P<token>[^/]+)/$', consumers.BondcastRequestsConsumer.as_asgi()),
]
