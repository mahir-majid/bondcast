from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()  # This will get your CustomUser class bc in settings.py there is AUTH_USER_MODEL = 'users.CustomUser'

class FriendSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'firstname', 'lastname']

