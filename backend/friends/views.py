from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from .serializers import FriendSerializer
from .models import Friendship


User = get_user_model()

class FriendListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = FriendSerializer

    def get_queryset(self):
        # Return the friends of the current user
        return self.request.user.friends.all()


class AddFriendView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        username = request.data.get('username')
        if not username:
            return Response({"detail": "Username is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            friend = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user

        if friend == user:
            return Response({"detail": "You cannot add yourself as a friend."}, status=status.HTTP_400_BAD_REQUEST)

        # Check if already friends
        if user.friends.filter(id=friend.id).exists():
            return Response({"detail": "Already friends."}, status=status.HTTP_400_BAD_REQUEST)

        # Add friend symmetrically by creating Friendship once
        # Your ManyToManyField is symmetrical=False, but you maintain symmetry in the Friendship model
        # So add friendship in the Friendship table with user_a < user_b enforced by model constraints
        
        # Use min/max to order ids correctly
        user_a, user_b = (user, friend) if user.id < friend.id else (friend, user)

        Friendship.objects.create(user_a=user_a, user_b=user_b)

        return Response({"detail": f"Friend {username} added."}, status=status.HTTP_201_CREATED)


class RemoveFriendView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        username = request.data.get('username')
        if not username:
            return Response({"detail": "Username is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            friend = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user

        # Remove the friendship, considering symmetry
        user_a, user_b = (user, friend) if user.id < friend.id else (friend, user)

        deleted, _ = Friendship.objects.filter(user_a=user_a, user_b=user_b).delete()

        if deleted == 0:
            return Response({"detail": "Friendship does not exist."}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": f"Friend {username} removed."}, status=status.HTTP_200_OK)
