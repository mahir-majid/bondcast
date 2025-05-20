"""
ASGI config for backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
import django
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from convos.routing import websocket_urlpatterns  # import your app's routing.py

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

application = ProtocolTypeRouter({
    "http": get_asgi_application(),  # Handles regular HTTP requests
    "websocket": AuthMiddlewareStack(  # Handles websocket connections with auth
        URLRouter(
            websocket_urlpatterns  # Your websocket routes from routing.py
        )
    ),
})
