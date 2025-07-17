from rest_framework import serializers  # type: ignore
from .models import AIConversation, AIMessage

class AIMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIMessage
        fields = ['id', 'message_type', 'content', 'timestamp', 'is_read']

class AIConversationSerializer(serializers.ModelSerializer):
    messages = AIMessageSerializer(many=True, read_only=True)
    unread_count = serializers.SerializerMethodField()
    
    class Meta:
        model = AIConversation
        fields = ['id', 'created_at', 'updated_at', 'is_active', 'messages', 'unread_count']
    
    def get_unread_count(self, obj):
        return obj.messages.filter(is_read=False, message_type='ai').count()
