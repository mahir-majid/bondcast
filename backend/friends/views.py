from rest_framework import generics, status  # type: ignore
from rest_framework.response import Response  # type: ignore
from rest_framework.permissions import IsAuthenticated   # type: ignore
from django.contrib.auth import get_user_model  # type: ignore
from channels.layers import get_channel_layer  # type: ignore
from asgiref.sync import async_to_sync  # type: ignore
from .models import FriendRequest, Friendship, Conversation, Message
from .serializers import FriendRequestSerializer, ConversationSerializer, MessageSerializer
from django.db import models  # type: ignore
from aiMessages.aiDmPrompts import llmModeState  # type: ignore

User = get_user_model()

class SendFriendRequestView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = FriendRequestSerializer

    def create(self, request, *args, **kwargs):
        to_username = request.data.get('to_username')
        from_user = request.user

        if not to_username:
            return Response({'error': 'to_username is required.'})

        try:
            to_user = User.objects.get(username=to_username)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'})

        if from_user == to_user:
            return Response({'error': 'Can\'t send a friend request to yourself.'})

        if FriendRequest.objects.filter(from_user=from_user, to_user=to_user, status=FriendRequest.STATUS_PENDING).exists():
            return Response({'error': 'Friend request already sent.'})

        if FriendRequest.objects.filter(from_user=to_user, to_user=from_user, status=FriendRequest.STATUS_PENDING).exists():
            return Response({'error': 'This user has already sent you a friend request.'})

        # Check if users are already friends
        if Friendship.objects.filter(
            (models.Q(user_a=from_user, user_b=to_user) | models.Q(user_a=to_user, user_b=from_user))
        ).exists():
            return Response({'error': 'You are already friends with this user.'})

        serializer = self.get_serializer(data={})
        serializer.is_valid(raise_exception=True)
        friend_request = serializer.save(from_user=from_user, to_user=to_user)

        # Send WebSocket notification
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"friend_requests_{to_user.id}",
            {
                "type": "friend_request_notification",
                "data": {
                    "type": "friend_request",
                    "from_user": {
                        "id": from_user.id,
                        "username": from_user.username
                    },
                    "status": friend_request.status,
                    "created_at": friend_request.created_at.isoformat()
                }
            }
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)

class AcceptFriendRequestView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = FriendRequestSerializer

    def create(self, request, *args, **kwargs):
        from_username = request.data.get('from_username')
        to_user = request.user

        if not from_username:
            return Response({'error': 'from_username is required.'})

        try:
            from_user = User.objects.get(username=from_username)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'})

        try:
            friend_request = FriendRequest.objects.get(
                from_user=from_user,
                to_user=to_user,
                status=FriendRequest.STATUS_PENDING
            )
        except FriendRequest.DoesNotExist:
            return Response({'error': 'Friend request not found.'})

        # Update friend request status
        friend_request.status = FriendRequest.STATUS_ACCEPTED
        friend_request.save()

        # Create friendship
        Friendship.objects.create(
            user_a=min(from_user, to_user, key=lambda u: u.id),
            user_b=max(from_user, to_user, key=lambda u: u.id)
        )

        # Update convo_llm_mode for both users if they're in fteAddFriend mode
        if from_user.convo_llm_mode == llmModeState.fteAddFriend.value:
            from_user.convo_llm_mode = llmModeState.fteBondCast.value
            from_user.save()
            
        if to_user.convo_llm_mode == llmModeState.fteAddFriend.value:
            to_user.convo_llm_mode = llmModeState.fteBondCast.value
            to_user.save()

        # Send WebSocket notification
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"friend_requests_{to_user.id}",
            {
                "type": "friend_request_notification",
                "data": {
                    "type": "friend_request_accepted",
                    "from_user": {
                        "id": from_user.id,
                        "username": from_user.username
                    }
                }
            }
        )

        return Response({'message': 'Friend request accepted.'}, status=status.HTTP_200_OK)

class DeclineFriendRequestView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = FriendRequestSerializer

    def create(self, request, *args, **kwargs):
        from_username = request.data.get('from_username')
        to_user = request.user

        if not from_username:
            return Response({'error': 'from_username is required.'})

        try:
            from_user = User.objects.get(username=from_username)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'})

        try:
            friend_request = FriendRequest.objects.get(
                from_user=from_user,
                to_user=to_user,
                status=FriendRequest.STATUS_PENDING
            )
        except FriendRequest.DoesNotExist:
            return Response({'error': 'Friend request not found.'})

        # Update friend request status
        friend_request.status = FriendRequest.STATUS_REJECTED
        friend_request.save()

        # Send WebSocket notification
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"friend_requests_{to_user.id}",
            {
                "type": "friend_request_notification",
                "data": {
                    "type": "friend_request_rejected",
                    "from_user": {
                        "id": from_user.id,
                        "username": from_user.username
                    }
                }
            }
        )

        return Response({'message': 'Friend request declined.'}, status=status.HTTP_200_OK)

class RemoveFriendView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = FriendRequestSerializer

    def create(self, request, *args, **kwargs):
        friend_username = request.data.get('friend_username')
        current_user = request.user

        if not friend_username:
            return Response({'error': 'friend_username is required.'})

        try:
            friend_user = User.objects.get(username=friend_username)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'})

        # Check if friendship exists
        friendship = Friendship.objects.filter(
            (models.Q(user_a=current_user, user_b=friend_user) | models.Q(user_a=friend_user, user_b=current_user))
        ).first()

        if not friendship:
            return Response({'error': 'Friendship not found.'})

        # Delete the friendship
        friendship.delete()

        # Delete any pending friend requests between these users
        FriendRequest.objects.filter(
            (models.Q(from_user=current_user, to_user=friend_user) | 
             models.Q(from_user=friend_user, to_user=current_user))
        ).delete()

        # Send WebSocket notification to both users
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"friend_requests_{current_user.id}",
            {
                "type": "friend_removed_notification",
                "data": {
                    "type": "friend_removed",
                    "friend_user": {
                        "id": friend_user.id,
                        "username": friend_user.username
                    }
                }
            }
        )

        async_to_sync(channel_layer.group_send)(
            f"friend_requests_{friend_user.id}",
            {
                "type": "friend_removed_notification",
                "data": {
                    "type": "friend_removed",
                    "friend_user": {
                        "id": current_user.id,
                        "username": current_user.username
                    }
                }
            }
        )

        return Response({'message': 'Friend removed successfully.'}, status=status.HTTP_200_OK)


# New views for conversations and messages

class GetUnreadCountsView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        current_user = request.user
        
        # Get all friendships for the user
        friendships = Friendship.objects.filter(
            (models.Q(user_a=current_user) | models.Q(user_b=current_user))
        ).select_related('user_a', 'user_b')
        
        unread_counts = {}
        
        for friendship in friendships:
            # Get the other user in the friendship
            friend = friendship.user_b if friendship.user_a == current_user else friendship.user_a
            
            # Get or create DM conversation
            conversation = Conversation.get_or_create_dm(current_user, friend)
            
            # Count unread messages (messages not sent by current user and not read)
            unread_count = Message.objects.filter(
                conversation=conversation,
                is_read=False
            ).exclude(sender=current_user).count()
            
            if unread_count > 0:
                unread_counts[friend.username] = unread_count
        
        return Response({'unread_counts': unread_counts})

class GetConversationView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ConversationSerializer

    def get_object(self):
        friend_username = self.kwargs.get('friend_username')
        current_user = self.request.user

        try:
            friend_user = User.objects.get(username=friend_username)
        except User.DoesNotExist:
            return None

        # Check if users are friends
        friendship = Friendship.objects.filter(
            (models.Q(user_a=current_user, user_b=friend_user) | 
             models.Q(user_a=friend_user, user_b=current_user))
        ).first()

        if not friendship:
            return None

        # Get or create DM conversation with optimized queries
        conversation = Conversation.get_or_create_dm(current_user, friend_user)
        
        # Optimize the conversation query with prefetch_related
        conversation = Conversation.objects.prefetch_related(
            'messages__sender',
            'participants'
        ).get(id=conversation.id)
        
        return conversation

    def retrieve(self, request, *args, **kwargs):
        conversation = self.get_object()
        if not conversation:
            return Response({'error': 'Conversation not found or users are not friends.'}, 
                          status=status.HTTP_404_NOT_FOUND)
        
        serializer = self.get_serializer(conversation, context={'request': request})
        return Response(serializer.data)


class SendMessageView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    def create(self, request, *args, **kwargs):
        to_username = request.data.get('to_username')
        content = request.data.get('content')
        current_user = request.user

        if not to_username or not content:
            return Response({'error': 'to_username and content are required.'}, 
                          status=status.HTTP_400_BAD_REQUEST)

        try:
            to_user = User.objects.get(username=to_username)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Check if users are friends
        friendship = Friendship.objects.filter(
            (models.Q(user_a=current_user, user_b=to_user) | 
             models.Q(user_a=to_user, user_b=current_user))
        ).first()

        if not friendship:
            return Response({'error': 'Users must be friends to send messages.'}, 
                          status=status.HTTP_403_FORBIDDEN)

        # Get or create DM conversation
        conversation = Conversation.get_or_create_dm(current_user, to_user)

        # Create message
        message = Message.objects.create(
            conversation=conversation,
            sender=current_user,
            content=content
        )

        # Update conversation timestamp
        conversation.save()  # This updates the updated_at field

        # Send WebSocket notification to the recipient
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"friend_requests_{to_user.id}",
            {
                "type": "message_notification",
                "data": {
                    "type": "new_message",
                    "conversation_id": conversation.id,
                    "message": {
                        "id": message.id,
                        "sender_username": message.sender.username,
                        "sender_firstname": message.sender.firstname,
                        "sender_lastname": message.sender.lastname,
                        "content": message.content,
                        "timestamp": message.timestamp.isoformat(),
                        "is_read": message.is_read
                    }
                }
            }
        )

        serializer = self.get_serializer(message)
        return Response({'message': serializer.data}, status=status.HTTP_201_CREATED)


class MarkMessagesAsReadView(generics.UpdateAPIView):
    permission_classes = [IsAuthenticated]

    def update(self, request, *args, **kwargs):
        conversation_id = request.data.get('conversation_id')
        current_user = request.user

        if not conversation_id:
            return Response({'error': 'conversation_id is required.'}, 
                          status=status.HTTP_400_BAD_REQUEST)

        try:
            conversation = Conversation.objects.get(id=conversation_id, participants=current_user)
        except Conversation.DoesNotExist:
            return Response({'error': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Mark all unread messages in this conversation as read
        Message.objects.filter(
            conversation=conversation,
            is_read=False
        ).exclude(sender=current_user).update(is_read=True)

        return Response({'message': 'Messages marked as read.'}, status=status.HTTP_200_OK)


