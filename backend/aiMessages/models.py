from django.db import models  # type: ignore
from django.contrib.auth import get_user_model  # type: ignore
from django.utils import timezone  # type: ignore
from django.db.models.signals import post_save  # type: ignore
from django.dispatch import receiver  # type: ignore

User = get_user_model()

class AIConversation(models.Model):
    """Represents a conversation thread between a user and Bondi AI"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='ai_conversation')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'ai_conversations'
    
    def __str__(self):
        return f"AI Conversation with {self.user.username}"

class AIMessage(models.Model):
    """Represents individual messages in an AI conversation"""
    MESSAGE_TYPES = [
        ('user', 'User Message'),
        ('ai', 'AI Message'),
    ]
    
    conversation = models.ForeignKey(AIConversation, on_delete=models.CASCADE, related_name='messages')
    message_type = models.CharField(max_length=10, choices=MESSAGE_TYPES)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'ai_messages'
        ordering = ['timestamp']
    
    def __str__(self):
        return f"{self.message_type} message in {self.conversation}"

@receiver(post_save, sender=User)
def create_ai_conversation(sender, instance, created, **kwargs):
    """Create an AI conversation when a new user is created"""
    if created:
        conversation = AIConversation.objects.create(user=instance)
        # Create the initial Bondi message
        first_name = instance.firstname if instance.firstname else "there"
        AIMessage.objects.create(
            conversation=conversation,
            message_type='ai',
            content=f"Hey {first_name}! I'm Bondi, your personal podcast cohost on Bondiver. I'm here to help you make BondCasts, which are fun little podcasts you can share with friends. Wanna try making one?",
            is_read=False
        )
