from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import FriendRequest, Friendship
from .serializers import FriendRequestSerializer
from django.db import models

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
        


