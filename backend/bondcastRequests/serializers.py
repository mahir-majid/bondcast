from rest_framework import serializers  # type: ignore
from django.contrib.auth import get_user_model # type: ignore
from .models import BondcastRequest

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    """Serializer for user information in bondcast requests"""
    class Meta:
        model = User
        fields = ['id', 'username', 'firstname', 'lastname']

class BondcastRequestSerializer(serializers.ModelSerializer):
    """Serializer for bondcast requests"""
    sender = UserSerializer(read_only=True)
    recipient = UserSerializer(read_only=True)
    sender_name = serializers.CharField(read_only=True)
    display_sender_name = serializers.CharField(read_only=True)
    
    class Meta:
        model = BondcastRequest
        fields = [
            'id', 'sender_type', 'sender', 'sender_name', 'display_sender_name',
            'recipient', 'title', 'request_body', 'status', 'created_at', 
            'updated_at', 'completed_at', 'response_audio_url', 'seen'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'completed_at']

class CreateBondcastRequestSerializer(serializers.ModelSerializer):
    """Serializer for creating new bondcast requests"""
    recipient_username = serializers.CharField(write_only=True)
    
    class Meta:
        model = BondcastRequest
        fields = [
            'sender_type', 'recipient_username', 
            'title', 'request_body'
        ]
    
    def validate_recipient_username(self, value):
        """Validate that the recipient username exists"""
        try:
            User.objects.get(username=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("Recipient user not found.")
        return value
    
    def create(self, validated_data):
        """Create a new bondcast request"""
        recipient_username = validated_data.pop('recipient_username')
        recipient = User.objects.get(username=recipient_username)
        
        # Set sender based on sender_type
        sender = None
        sender_name = None
        if validated_data.get('sender_type') == 'user':
            sender = self.context['request'].user
            sender_name = sender.firstname if sender.firstname else sender.username
        
        bondcast_request = BondcastRequest.objects.create(
            sender=sender,
            recipient=recipient,
            sender_name=sender_name,
            **validated_data
        )
        return bondcast_request

class UpdateBondcastRequestSerializer(serializers.ModelSerializer):
    """Serializer for updating bondcast requests (PATCH)"""
    
    class Meta:
        model = BondcastRequest
        fields = ['title', 'request_body']
    
    def validate(self, data):
        """Validate that only title and request_body can be updated"""
        # Only allow updating title and request_body
        allowed_fields = {'title', 'request_body'}
        if not set(data.keys()).issubset(allowed_fields):
            raise serializers.ValidationError("Only title and request_body can be updated.")
        return data

class BondcastRequestListSerializer(serializers.ModelSerializer):
    """Serializer for listing bondcast requests"""
    sender = UserSerializer(read_only=True)
    display_sender_name = serializers.CharField(read_only=True)
    
    class Meta:
        model = BondcastRequest
        fields = [
            'id', 'sender_type', 'sender', 'display_sender_name',
            'title', 'request_body', 'status', 'created_at', 'seen'
        ]
