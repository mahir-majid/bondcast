from rest_framework import generics, status  # type: ignore
from rest_framework.permissions import IsAuthenticated  # type: ignore
from rest_framework.response import Response  # type: ignore
from django.contrib.auth import get_user_model  # type: ignore
from .models import AIConversation, AIMessage
from .serializers import AIConversationSerializer, AIMessageSerializer
import groq  # type: ignore
from dotenv import load_dotenv  # type: ignore
import os
from pathlib import Path
from .aiDmPrompts import *
import json
import logging
import instructor  # type: ignore
from pydantic import BaseModel  # type: ignore

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize Groq client
groq_client = groq.Groq(api_key=os.getenv('GROQ_API_KEY'))

# Initialize transition client with instructor
groq_transition_client = instructor.patch(groq.Groq(api_key=os.getenv('GROQ_API_KEY')))

User = get_user_model()

class AIConversationView(generics.RetrieveAPIView):
    """Get the user's AI conversation with Bondi"""
    permission_classes = [IsAuthenticated]
    serializer_class = AIConversationSerializer
    
    def get_object(self):
        # Get or create conversation for the current user
        conversation, created = AIConversation.objects.get_or_create(
            user=self.request.user,
            defaults={'is_active': True}
        )
        
        # If conversation was just created, add the initial Bondi message
        if created:
            first_name = self.request.user.firstname if self.request.user.firstname else "there"
            AIMessage.objects.create(
                conversation=conversation,
                message_type='ai',
                content=f"Hey {first_name}! I'm Bondi, your personal podcast cohost on Bondiver. I'm here to help you make BondCasts, which are fun little podcasts you can share with friends. Wanna try making one?",
                is_read=False
            )
        
        return conversation

class SendMessageView(generics.CreateAPIView):
    """Send a message to Bondi"""
    permission_classes = [IsAuthenticated]
    serializer_class = AIMessageSerializer
    
    def create(self, request, *args, **kwargs):
        content = request.data.get('content')
        if not content:
            return Response({'error': 'Message content is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get or create conversation
        conversation, created = AIConversation.objects.get_or_create(
            user=request.user,
            defaults={'is_active': True}
        )
        
        # If conversation was just created, add the initial Bondi message first
        if created:
            first_name = request.user.firstname if request.user.firstname else "there"
            AIMessage.objects.create(
                conversation=conversation,
                message_type='ai',
                content=f"Hey {first_name}! I'm Bondi, your personal podcast cohost on Bondiver. I'm here to help you make BondCasts, which are fun little podcasts you can share with friends. Wanna try making one?",
                is_read=False
            )
        
        # Create user message
        user_message = AIMessage.objects.create(
            conversation=conversation,
            message_type='user',
            content=content,
            is_read=True
        )
        
        # Integrate with your AI service to generate Bondi's response
        # Get the last 10 messages for context
        last_10_messages = conversation.messages.order_by('-timestamp')[:10]
        last_10_messages_text = "\n".join([f"{msg.message_type}: {msg.content}" for msg in reversed(last_10_messages)])

        # Get the last user message
        last_user_message = conversation.messages.filter(message_type='user').order_by('-timestamp').first()
        last_user_message_text = last_user_message.content if last_user_message else "No previous user message"

        # Checking LLM Bondi AI Model State and Applying Transitions
        # Transition Response Model
        class TransitionResponse(BaseModel):
            transition: bool

        has_friends = request.user.friends.exists()

        # Only reset to fteIntro if user has no friends AND is in generalCase mode
        if not has_friends and (request.user.convo_llm_mode == llmModeState.generalCase.value or request.user.convo_llm_mode == llmModeState.fteBondCast.value):
            request.user.convo_llm_mode = llmModeState.fteIntro.value
            request.user.save()

        if request.user.convo_llm_mode != llmModeState.generalCase.value:
            if request.user.convo_llm_mode == llmModeState.fteIntro.value:
                transition_check_SC = llmAiDmFteIntroTransitionSC.format(
                    last_10_messages_text=last_10_messages_text,
                    last_user_message_text=last_user_message_text
                )

                transition_check_IN = f"""Analyze the conversation and if the user seems interested 
                in creating their first bondcast, output true for transtion boolean. Otherwise, 
                output false. Here are the last 10 messages in the conversation: {last_10_messages_text}"""

                transition_check = groq_transition_client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    response_model=TransitionResponse,
                    messages=[
                        {
                            "role": "system", 
                            "content": transition_check_SC
                        },
                        {"role": "user", "content": transition_check_IN}
                    ],
                    stream=False,
                    temperature=0.9,
                    max_completion_tokens=75
                )
                
                # Get the structured response directly
                should_transition = transition_check.transition

                if should_transition:
                    request.user.convo_llm_mode = llmModeState.fteFirstTopic.value
                    request.user.save()
            
            elif request.user.convo_llm_mode == llmModeState.fteFirstTopic.value:
                transition_check_SC = llmAiDmFteFirstTopicTransitionSC.format(
                    last_10_messages_text=last_10_messages_text,
                    last_user_message_text=last_user_message_text
                )

                transition_check_IN = f"""
                    Based on the last 10 messages, determine whether the user has clearly confirmed the topic they want to record 
                    their first BondCast about and has indicated they are ready to begin recording.
                    Acceptable topics can include a hot take, their life, hobbies, TV shows, movies, sports, news, or any personal interest.
                    
                    CRITICAL: If the user says anything like "ready", "let's do this", "yup", "yes", "sounds good", 
                    "I'm ready", "let's go", "ready to record", "super passionate", "fired up", or any clear confirmation to do their first bondcast,
                    immediately return true. Don't ask for more verification.
                    
                    Only return true if the user has explicitly or confidently settled on a topic and shown readiness to record. 
                    Otherwise, return false.
                    Here are the last 10 messages in the conversation:
                    {last_10_messages_text} Last user message: {last_user_message_text}
                """
                                    
                transition_check = groq_transition_client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    response_model=TransitionResponse,
                    messages=[
                        {
                            "role": "system", 
                            "content": transition_check_SC
                        },
                        {"role": "user", "content": transition_check_IN}
                    ],
                    stream=False,
                    temperature=0.9,
                    max_completion_tokens=75
                )

                 # Get the structured response directly
                should_transition = transition_check.transition

                if should_transition and not has_friends:
                    request.user.convo_llm_mode = llmModeState.fteAddFriend.value
                    request.user.save()
                elif should_transition and has_friends:
                    request.user.convo_llm_mode = llmModeState.fteBondCast.value
                    request.user.save()

            elif request.user.convo_llm_mode == llmModeState.fteAddFriend.value:
                if has_friends:
                    request.user.convo_llm_mode = llmModeState.fteBondCast.value
                    request.user.save()
                

        # Preparing Bondi LLM Response
        if request.user.convo_llm_mode == llmModeState.fteIntro.value:
            logger.info(f"FTE Intro Mode")
            bondi_response_SC = llmAiDmFteIntroSC.format(
                last_10_messages_text=last_10_messages_text,
                last_user_message_text=last_user_message_text
            )
        elif request.user.convo_llm_mode == llmModeState.fteFirstTopic.value:
            logger.info(f"FTE First Topic Mode")
            bondi_response_SC = llmAiDmFteFirstTopicSC.format(
                last_10_messages_text=last_10_messages_text,
                last_user_message_text=last_user_message_text
            )
        elif request.user.convo_llm_mode == llmModeState.fteAddFriend.value:
            logger.info(f"FTE Add Friend Mode")
            bondi_response_SC = llmAiDmFteAddFriendSC.format(
                last_10_messages_text=last_10_messages_text,
                last_user_message_text=last_user_message_text
            )
        elif request.user.convo_llm_mode == llmModeState.fteBondCast.value:
            logger.info(f"FTE Bond Cast Mode")
            bondi_response_SC = llmAiDmFteBondCastSC.format(
                last_10_messages_text=last_10_messages_text,
                last_user_message_text=last_user_message_text
            )
        elif request.user.convo_llm_mode == llmModeState.fteEnd.value:
            logger.info(f"FTE End Mode")
            bondi_response_SC = llmAiDmFteEndSC.format(
                last_10_messages_text=last_10_messages_text,
                last_user_message_text=last_user_message_text
            )
        elif request.user.convo_llm_mode == llmModeState.generalCase.value:
            logger.info(f"General Case Mode")
            bondi_response_SC = llmAiDmGeneralCaseSC.format(
                last_10_messages_text=last_10_messages_text,
                last_user_message_text=last_user_message_text
            )
        else:
            logger.info(f"Unknown Mode")
            bondi_response_SC = "Talk about a Toyota Supra"

        bondi_response_IN = content

        bondi_response = groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",  
                messages=[
                    {"role": "system", "content": bondi_response_SC},
                    {"role": "user", "content":  bondi_response_IN}
                ],
                stream=False,  
                temperature=0.9,
                max_completion_tokens=75,
            )

        ai_response = AIMessage.objects.create(
            conversation=conversation,
            message_type='ai',
            content=bondi_response.choices[0].message.content,
            is_read=False
        )
        
        return Response({
            'user_message': AIMessageSerializer(user_message).data,
            'ai_response': AIMessageSerializer(ai_response).data
        }, status=status.HTTP_201_CREATED)

class MarkMessagesReadView(generics.UpdateAPIView):
    """Mark AI messages as read"""
    permission_classes = [IsAuthenticated]
    
    def update(self, request, *args, **kwargs):
        conversation = AIConversation.objects.get(user=request.user)
        conversation.messages.filter(message_type='ai', is_read=False).update(is_read=True)
        return Response({'status': 'Messages marked as read'})
