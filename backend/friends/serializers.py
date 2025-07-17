from rest_framework import serializers  # type: ignore
from django.conf import settings  # type: ignore
from django.contrib.auth import get_user_model  # type: ignore
from .models import FriendRequest, Friendship, Conversation, Message

User = settings.AUTH_USER_MODEL
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


# New serializers for conversations and messages
class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    sender_firstname = serializers.CharField(source='sender.firstname', read_only=True)
    sender_lastname = serializers.CharField(source='sender.lastname', read_only=True)
    conversation_id = serializers.IntegerField(source='conversation.id', read_only=True)
    
    class Meta:
        model = Message
        fields = ['id', 'sender_username', 'sender_firstname', 'sender_lastname', 'content', 'timestamp', 'is_read', 'conversation_id']

class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    participants = FriendSerializer(many=True, read_only=True)
    unread_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Conversation
        fields = ['id', 'conversation_type', 'participants', 'created_at', 'updated_at', 'is_active', 'messages', 'unread_count']
    
    def get_unread_count(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.messages.filter(is_read=False).exclude(sender=request.user).count()
        return 0
