"""
ASGI config for backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
import django
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

# Import these after django.setup()
from convos.routing import websocket_urlpatterns as convos_websocket_urlpatterns
from friends.routing import websocket_urlpatterns as friends_websocket_urlpatterns

# Combine all websocket URL patterns
websocket_urlpatterns = convos_websocket_urlpatterns + friends_websocket_urlpatterns

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": URLRouter(websocket_urlpatterns),
})
