from django.urls import re_path  # type: ignore
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/speech/(?P<username>\w+)/(?P<variant>\w+)/$', consumers.SpeechConsumer.as_asgi()),
]