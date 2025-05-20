from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email must be set")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save()
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)

class CustomUser(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=20, unique=True)

    firstname = models.CharField(max_length=20)
    lastname = models.CharField(max_length=20)
    dob = models.DateField(null=False, blank=False)

    # 👇 NEW — the join table lives in *friends* app
    friends = models.ManyToManyField(
        "self",
        through="friends.Friendship",  # <app name>.<model name>
        symmetrical=False,             # *we* maintain symmetry in Friendship
        related_name="+"               # Django won't create reverse ‘friends_set’
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'      # login with email instead of username
    REQUIRED_FIELDS = ['username'] # required when creating superuser

    objects = CustomUserManager()

    def __str__(self):
        return self.email

