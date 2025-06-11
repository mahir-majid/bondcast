# audio/models.py
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class AudioClip(models.Model):
    sender = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='sent_recordings',
        null=True,  # Allow null initially
        blank=True  # Allow blank in forms
    )
    recipients = models.ManyToManyField(User, related_name='received_recordings')
    s3_url = models.URLField()
    created_at = models.DateTimeField(auto_now_add=True)
    active = models.BooleanField(default=True)
    seen = models.BooleanField(default=False)  # New field to track if recording has been played

    def __str__(self):
        return f"Recording from {self.sender.username} at {self.created_at}"

