from rest_framework import serializers
from .models import CustomUser

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = CustomUser
        fields = ['id', 'email', 'username', 'password', 'firstname', 'lastname', 'dob']

    def create(self, validated_data):
        user = CustomUser(
            email=validated_data['email'],
            username=validated_data['username'],
            firstname=validated_data['firstname'],
            lastname=validated_data['lastname'],
            dob=validated_data['dob'],
        )
        user.set_password(validated_data['password'])
        user.save()
        return user
