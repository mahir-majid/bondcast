# friends/models.py
from django.db import models
from django.conf import settings
from django.utils import timezone

class Friendship(models.Model):
    """
    Stores ONE row per friendship (A‑id is always less than B‑id).  
    Makes queries cheap and guarantees symmetry.
    """
    user_a = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="friendships_as_a",
    )
    
    user_b = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="friendships_as_b",
    )

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            # enforce (a,b) uniqueness no matter the insert order
            models.UniqueConstraint(
                fields=("user_a", "user_b"),
                name="unique_friendship",
            ),
            # always store the *smaller* id in user_a so we keep just one row
            models.CheckConstraint(
                check=models.Q(user_a__lt=models.F("user_b")),
                name="user_a_lt_user_b",
            ),
        ]

    def __str__(self):
        return f"{self.user_a.username} ↔ {self.user_b.username}"
