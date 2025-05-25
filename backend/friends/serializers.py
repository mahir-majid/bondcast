from rest_framework import serializers
from django.conf import settings
from .models import FriendRequest, Friendship

User = settings.AUTH_USER_MODEL

# Usually we get the User model class dynamically like this:
from django.contrib.auth import get_user_model
UserModel = get_user_model()


class FriendSerializer(serializers.ModelSerializer):
    # This will serialize the User object (friend)
    class Meta:
        model = UserModel
        fields = ['id', 'username', 'firstname', 'lastname']  # adapt to your user model fields


class FriendshipSerializer(serializers.ModelSerializer):
    # Serialize both user_a and user_b as nested users using FriendSerializer
    user_a = FriendSerializer(read_only=True)
    user_b = FriendSerializer(read_only=True)

    class Meta:
        model = Friendship
        fields = ['user_a', 'user_b', 'created_at']


class FriendRequestSerializer(serializers.ModelSerializer):
    from_user = FriendSerializer(read_only=True)
    to_user = FriendSerializer(read_only=True)

    class Meta:
        model = FriendRequest
        fields = ['id', 'from_user', 'to_user', 'status', 'created_at']
