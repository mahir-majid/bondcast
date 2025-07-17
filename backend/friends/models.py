from django.db import models  # type: ignore
from django.conf import settings  # type: ignore
from django.utils import timezone  # type: ignore

User = settings.AUTH_USER_MODEL

class Friendship(models.Model):
    user_a = models.ForeignKey(User, on_delete=models.CASCADE, related_name="friendships_as_a")
    user_b = models.ForeignKey(User, on_delete=models.CASCADE, related_name="friendships_as_b")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user_a', 'user_b'], name='unique_friendship'),
            models.CheckConstraint(check=models.Q(user_a__lt=models.F('user_b')), name='user_a_lt_user_b'),
        ]

    def __str__(self):
        return f"{self.user_a.username} ↔ {self.user_b.username}"


class FriendRequest(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_ACCEPTED = 'accepted'
    STATUS_REJECTED = 'rejected'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_ACCEPTED, 'Accepted'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    from_user = models.ForeignKey(User, related_name='sent_requests', on_delete=models.CASCADE)
    to_user = models.ForeignKey(User, related_name='received_requests', on_delete=models.CASCADE)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ('from_user', 'to_user')

    def __str__(self):
        return f"Friend request from {self.from_user.username} to {self.to_user.username} - {self.status}"


class Conversation(models.Model):
    """Represents a conversation that can be either a DM or group chat"""
    CONVERSATION_TYPES = [
        ('dm', 'Direct Message'),
        ('group', 'Group Chat'),
    ]
    
    conversation_type = models.CharField(max_length=10, choices=CONVERSATION_TYPES, default='dm')
    participants = models.ManyToManyField(User, related_name='conversations')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'conversations'
        ordering = ['-updated_at']
    
    def __str__(self):
        if self.conversation_type == 'dm':
            participants_list = list(self.participants.all())
            if len(participants_list) == 2:
                return f"DM: {participants_list[0].username} ↔ {participants_list[1].username}"
        return f"Group Chat: {self.participants.count()} participants"
    
    @classmethod
    def get_or_create_dm(cls, user1, user2):
        """Get or create a DM conversation between two users"""
        # Check if DM already exists
        existing_dm = cls.objects.filter(
            conversation_type='dm',
            participants=user1
        ).filter(
            participants=user2
        ).first()
        
        if existing_dm:
            return existing_dm
        
        # Create new DM
        dm = cls.objects.create(conversation_type='dm')
        dm.participants.add(user1, user2)
        return dm


class Message(models.Model):
    """Represents individual messages in a conversation"""
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'messages'
        ordering = ['timestamp']
    
    def __str__(self):
        return f"Message from {self.sender.username} in {self.conversation}"
