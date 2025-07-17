from rest_framework import serializers  # type: ignore
from .models import CustomUser
from bondcastConvos.responsePrompts import llmModeState

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = CustomUser
        fields = ['id', 'email', 'username', 'password', 'firstname', 'lastname', 'dob', 'convo_llm_mode', 'user_summary']

    def create(self, validated_data):
        user = CustomUser(
            email=validated_data['email'],
            username=validated_data['username'],
            firstname=validated_data['firstname'],
            lastname=validated_data['lastname'],
            dob=validated_data['dob'],
            convo_llm_mode=validated_data.get('convo_llm_mode', llmModeState.fteIntro.value),
            user_summary=validated_data.get('user_summary', ''),
        )
        user.set_password(validated_data['password'])
        user.save()
        return user
