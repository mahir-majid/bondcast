from channels.generic.websocket import AsyncJsonWebsocketConsumer  # type: ignore
from channels.db import database_sync_to_async  # type: ignore
from django.contrib.auth import get_user_model  # type: ignore
from .models import FriendRequest, Friendship
import logging
from django.db import models  # type: ignore
from urllib.parse import parse_qs

logger = logging.getLogger(__name__)
User = get_user_model()

class FriendRequestConsumer(AsyncJsonWebsocketConsumer):
    @database_sync_to_async
    def get_user_friends(self, user_id):
        try:
            # Get all friendships where the user is either user_a or user_b
            friendships = Friendship.objects.filter(
                models.Q(user_a_id=user_id) | models.Q(user_b_id=user_id)
            ).select_related('user_a', 'user_b')
            
            friends = []
            for friendship in friendships:
                # Get the other user in the friendship
                friend = friendship.user_b if friendship.user_a_id == user_id else friendship.user_a
                friends.append({
                    'id': friend.id,
                    'username': friend.username,
                    'firstname': friend.firstname,
                    'lastname': friend.lastname
                })
            return friends
        except Exception as e:
            logger.error(f"Error getting friends list: {str(e)}")
            return []

    @database_sync_to_async
    def get_pending_requests(self, user_id):
        try:
            # Get all pending friend requests where user is the recipient
            requests = FriendRequest.objects.filter(
                to_user_id=user_id,
                status=FriendRequest.STATUS_PENDING
            ).select_related('from_user')
            
            return [{
                'from_user': {
                    'id': req.from_user.id,
                    'username': req.from_user.username,
                    'firstname': req.from_user.firstname,
                    'lastname': req.from_user.lastname
                },
                'status': req.status,
                'created_at': req.created_at.isoformat()
            } for req in requests]
        except Exception as e:
            logger.error(f"Error getting pending requests: {str(e)}")
            return []

    @database_sync_to_async
    def get_user_by_username(self, username):
        try:
            return User.objects.get(username=username)
        except User.DoesNotExist:
            return None

    async def connect(self):
        # Get username from query string
        query_string = self.scope.get('query_string', b'').decode()
        query_params = parse_qs(query_string)
        username = query_params.get('username', [None])[0]

        if not username:
            await self.close()
            return

        # Get user from username
        user = await self.get_user_by_username(username)  # type: ignore
        if not user:
            await self.close()
            return

        # Store user in scope for later use
        self.scope['user'] = user
        # logger.info(f"WebSocket connection attempt - User: {username}")

        try:
            await self.accept()
            # logger.info(f"Friend request WS connected for user {username}")
            
            # Get both friends and pending requests
            friends = await self.get_user_friends(user.id)  # type: ignore
            pending_requests = await self.get_pending_requests(user.id)  # type: ignore
            
            # Log what we're sending
            # logger.info(f"Sending data for user {username}:")
            # logger.info(f"Friend requests: {pending_requests}")
            # logger.info(f"Friends: {friends}")
            
            # Always send arrays, even if empty
            response = {
                "friend_requests": pending_requests if pending_requests is not None else [],
                "user_friends": friends if friends is not None else []
            }
            
            await self.send_json(response)

            # Add user to their channel group
            await self.channel_layer.group_add(
                f"friend_requests_{user.id}",
                self.channel_name
            )
        except Exception as e:
            logger.error(f"Error during WebSocket connection: {str(e)}")
            await self.close()

    async def disconnect(self, close_code):
        # Remove user from their channel group
        if self.scope.get('user'):
            await self.channel_layer.group_discard(
                f"friend_requests_{self.scope['user'].id}",
                self.channel_name
            )

    async def receive_json(self, content):
        await self.send_json({"type": "pong"})

    async def friend_request_notification(self, event):
        # Add first and last name to the notification data
        if 'from_user' in event['data']:
            from_user = await self.get_user_by_username(event['data']['from_user']['username'])  # type: ignore
            if from_user:
                event['data']['from_user']['firstname'] = from_user.firstname
                event['data']['from_user']['lastname'] = from_user.lastname
        await self.send_json(event["data"]) 

    async def friend_removed_notification(self, event):
        # Add first and last name to the notification data
        if 'friend_user' in event['data']:
            friend_user = await self.get_user_by_username(event['data']['friend_user']['username'])  # type: ignore
            if friend_user:
                event['data']['friend_user']['firstname'] = friend_user.firstname
                event['data']['friend_user']['lastname'] = friend_user.lastname
        await self.send_json(event["data"])

    async def message_notification(self, event):
        # Handle new message notifications
        await self.send_json(event["data"]) 