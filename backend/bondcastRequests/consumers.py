import json
from channels.generic.websocket import AsyncWebsocketConsumer # type: ignore
from channels.db import database_sync_to_async # type: ignore
from django.contrib.auth import get_user_model # type: ignore
from .models import BondcastRequest

User = get_user_model()

class BondcastRequestsConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for bondcast requests notifications"""
    
    async def connect(self):
        """Handle WebSocket connection"""
        # Get user from query parameters
        self.username = self.scope['url_route']['kwargs'].get('username')
        self.token = self.scope['url_route']['kwargs'].get('token')
        
        if not self.username or not self.token:
            await self.close()
            return
        
        # Validate user and token
        user = await self.get_user()
        if not user:
            await self.close()
            return
        
        self.user = user
        self.user_id = user.id
        
        # Join the user's bondcast requests group
        await self.channel_layer.group_add(
            f"bondcast_requests_{self.user_id}",
            self.channel_name
        )
        
        await self.accept()
        
        # Send initial pending requests count
        pending_count = await self.get_pending_requests_count()
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'pending_count': pending_count
        }))
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        if hasattr(self, 'user_id'):
            await self.channel_layer.group_discard(
                f"bondcast_requests_{self.user_id}",
                self.channel_name
            )
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'ping':
                await self.send(text_data=json.dumps({
                    'type': 'pong'
                }))
            elif message_type == 'get_pending_count':
                pending_count = await self.get_pending_requests_count()
                await self.send(text_data=json.dumps({
                    'type': 'pending_count',
                    'count': pending_count
                }))
                
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON'
            }))
    
    async def bondcast_request_notification(self, event):
        """Handle bondcast request notifications"""
        await self.send(text_data=json.dumps(event['data']))
    
    @database_sync_to_async
    def get_user(self):
        """Get user from database"""
        try:
            # In a real implementation, you'd validate the token here
            # For now, we'll just get the user by username
            return User.objects.get(username=self.username)
        except User.DoesNotExist:
            return User.objects.none().first()  # Return None in a way that's awaitable
    
    @database_sync_to_async
    def get_pending_requests_count(self):
        """Get count of pending and unseen bondcast requests for the user"""
        return BondcastRequest.objects.filter(
            recipient=self.user,
            status='pending',
            seen=False
        ).count()
