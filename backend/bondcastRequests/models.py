from django.db import models  # type: ignore
from django.conf import settings  # type: ignore
from django.utils import timezone  # type: ignore

User = settings.AUTH_USER_MODEL

class BondcastRequest(models.Model):
    """Represents a bondcast request that can be sent by users or AI"""
    
    SENDER_TYPES = [
        ('user', 'User'),
        ('ai', 'AI'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
        ('completed', 'Completed'),
    ]
    
    # Sender can be either a real user or AI (like Bondi)
    sender_type = models.CharField(max_length=10, choices=SENDER_TYPES, default='user')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_bondcast_requests', null=True, blank=True)
    sender_name = models.CharField(max_length=100, help_text="Name of sender (for AI requests)")
    
    # Recipient is always a real user
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_bondcast_requests')
    
    # Request details
    title = models.CharField(max_length=200)
    request_body = models.TextField()
    
    # Status tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Optional fields for completed requests
    completed_at = models.DateTimeField(null=True, blank=True)
    response_audio_url = models.URLField(max_length=500, null=True, blank=True)
    
    # Seen tracking
    seen = models.BooleanField(default=False, help_text="Whether the recipient has seen this request")
    
    class Meta:
        db_table = 'bondcast_requests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'status']),
            models.Index(fields=['sender_type', 'sender']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        if self.sender_type == 'user' and self.sender:
            return f"Bondcast request from {self.sender.username} to {self.recipient.username}"
        else:
            return f"Bondcast request from {self.sender_name} to {self.recipient.username}"
    
    def save(self, *args, **kwargs):
        # Set sender_name for AI requests
        if self.sender_type == 'ai' and not self.sender_name:
            self.sender_name = "Bondi"
        elif self.sender_type == 'user' and self.sender:
            self.sender_name = self.sender.firstname
        
        super().save(*args, **kwargs)
    
    @property
    def display_sender_name(self):
        """Get the display name of the sender"""
        if self.sender_type == 'user' and self.sender:
            return self.sender.firstname or self.sender.username
        return self.sender_name
    
    def mark_as_completed(self, response_audio_url=None):
        """Mark the request as completed"""
        self.status = 'completed'
        self.completed_at = timezone.now()
        if response_audio_url:
            self.response_audio_url = response_audio_url
        self.save()
    
    def accept(self):
        """Accept the bondcast request"""
        self.status = 'accepted'
        self.save()
    
    def reject(self):
        """Reject the bondcast request"""
        self.status = 'rejected'
        self.save()
    
    def mark_as_seen(self):
        """Mark the request as seen by the recipient"""
        self.seen = True
        self.save()
