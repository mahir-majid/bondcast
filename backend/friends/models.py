from django.db import models
from django.conf import settings
from django.utils import timezone

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
