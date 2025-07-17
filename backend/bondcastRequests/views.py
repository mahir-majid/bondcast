from rest_framework import generics, status  # type: ignore
from rest_framework.response import Response  # type: ignore
from rest_framework.permissions import IsAuthenticated  # type: ignore
from django.contrib.auth import get_user_model  # type: ignore
from django.db.models import Q  # type: ignore
from channels.layers import get_channel_layer  # type: ignore
from asgiref.sync import async_to_sync  # type: ignore
from .models import BondcastRequest
from .serializers import (
    BondcastRequestSerializer, 
    CreateBondcastRequestSerializer,
    UpdateBondcastRequestSerializer,
    BondcastRequestListSerializer
)
import groq  # type: ignore
from dotenv import load_dotenv  # type: ignore
import os
import instructor  # type: ignore
from pydantic import BaseModel  # type: ignore
import json
import logging

logger = logging.getLogger(__name__)

User = get_user_model()

# Load environment variables
load_dotenv()

# Initialize Groq client
groq_client = groq.Groq(api_key=os.getenv('GROQ_API_KEY'))

# Initialize instructor client for structured responses
groq_instructor_client = instructor.patch(groq.Groq(api_key=os.getenv('GROQ_API_KEY')))

# Define the response model for structured JSON output
class TopicsResponse(BaseModel):
    title1: str
    description1: str
    title2: str
    description2: str
    title3: str
    description3: str
    title4: str
    description4: str
    title5: str
    description5: str
    title6: str
    description6: str
    title7: str
    description7: str
    title8: str
    description8: str
    title9: str
    description9: str

# Define validation response model
class ValidationResponse(BaseModel):
    is_valid: bool
    reason: str

# Example topics from the frontend for context
example_topics = [
    {
        "title": "Time Travel",
        "description": "Would you rather travel 100 years into the past or 100 years into the future? What would you do first and why?"
    },
    {
        "title": "Superpower Dilemma", 
        "description": "Would you rather be able to fly but only 2 feet off the ground, or be invisible but only when no one is looking at you?"
    },
    {
        "title": "Food for Thought",
        "description": "Would you rather eat your favorite food for every meal but it's always cold, or eat food you hate but it's always perfectly cooked?"
    },
    {
        "title": "Money vs. Time",
        "description": "Would you rather have unlimited money but only 24 hours to live, or live forever but be broke? What would you do with your choice?"
    },
    {
        "title": "Animal Transformation",
        "description": "If you had to spend a day as any animal, which would you choose and what would be the first thing you'd do?"
    },
    {
        "title": "Dream Job Reality",
        "description": "If you could have any job in the world but had to work 80 hours a week, would you take it? What would that job be?"
    },
    {
        "title": "Celebrity Swap",
        "description": "If you had to switch lives with any celebrity for a week, who would you choose and what would be the most interesting part?"
    },
    {
        "title": "Weather Control",
        "description": "If you could control the weather but only in your city, what would you do? Would you make it always sunny or mix it up?"
    },
    {
        "title": "Language Superpower",
        "description": "Would you rather speak every language fluently but sound like a robot, or speak only your native language but have the most beautiful voice in the world?"
    }
]

class CreateBondcastRequestView(generics.CreateAPIView):
    """Create a new bondcast request"""
    permission_classes = [IsAuthenticated]
    serializer_class = CreateBondcastRequestSerializer
    
    def perform_create(self, serializer):
        """Create the bondcast request and send WebSocket notification"""
        bondcast_request = serializer.save()
        
        # Send WebSocket notification to recipient
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"bondcast_requests_{bondcast_request.recipient.id}",
            {
                "type": "bondcast_request_notification",
                "data": {
                    "type": "new_bondcast_request",
                    "request": {
                        "id": bondcast_request.id,
                        "sender_type": bondcast_request.sender_type,
                        "sender_name": bondcast_request.display_sender_name,
                        "title": bondcast_request.title,
                        "request_body": bondcast_request.request_body,
                        "created_at": bondcast_request.created_at.isoformat()
                    }
                }
            }
        )
        
        return bondcast_request

class UpdateBondcastRequestView(generics.UpdateAPIView):
    """Update a bondcast request (PATCH)"""
    permission_classes = [IsAuthenticated]
    serializer_class = UpdateBondcastRequestSerializer
    queryset = BondcastRequest.objects.all()
    
    def get_queryset(self):
        """Only allow users to update their own requests"""
        return BondcastRequest.objects.filter(
            Q(sender=self.request.user) | Q(recipient=self.request.user)
        )
    
    def perform_update(self, serializer):
        """Update the bondcast request and send WebSocket notification"""
        bondcast_request = serializer.save()
        
        # Send WebSocket notification to both sender and recipient
        channel_layer = get_channel_layer()
        
        # Notify recipient
        if bondcast_request.recipient != self.request.user:
            async_to_sync(channel_layer.group_send)(
                f"bondcast_requests_{bondcast_request.recipient.id}",
                {
                    "type": "bondcast_request_notification",
                    "data": {
                        "type": "bondcast_request_updated",
                        "request": {
                            "id": bondcast_request.id,
                            "title": bondcast_request.title,
                            "request_body": bondcast_request.request_body,
                            "updated_at": bondcast_request.updated_at.isoformat()
                        }
                    }
                }
            )
        
        # Notify sender if different from updater
        if bondcast_request.sender and bondcast_request.sender != self.request.user:
            async_to_sync(channel_layer.group_send)(
                f"bondcast_requests_{bondcast_request.sender.id}",
                {
                    "type": "bondcast_request_notification",
                    "data": {
                        "type": "bondcast_request_updated",
                        "request": {
                            "id": bondcast_request.id,
                            "title": bondcast_request.title,
                            "request_body": bondcast_request.request_body,
                            "updated_at": bondcast_request.updated_at.isoformat()
                        }
                    }
                }
            )

class ListBondcastRequestsView(generics.ListAPIView):
    """List bondcast requests for the authenticated user"""
    permission_classes = [IsAuthenticated]
    serializer_class = BondcastRequestListSerializer
    
    def get_queryset(self):
        """Get requests where user is either sender or recipient"""
        return BondcastRequest.objects.filter(
            Q(sender=self.request.user) | Q(recipient=self.request.user)
        ).order_by('-created_at')

class RetrieveBondcastRequestView(generics.RetrieveAPIView):
    """Retrieve a specific bondcast request"""
    permission_classes = [IsAuthenticated]
    serializer_class = BondcastRequestSerializer
    queryset = BondcastRequest.objects.all()
    
    def get_queryset(self):
        """Only allow users to view requests they're involved in"""
        return BondcastRequest.objects.filter(
            Q(sender=self.request.user) | Q(recipient=self.request.user)
        )

class AcceptBondcastRequestView(generics.UpdateAPIView):
    """Accept a bondcast request"""
    permission_classes = [IsAuthenticated]
    serializer_class = BondcastRequestSerializer
    queryset = BondcastRequest.objects.all()
    
    def get_queryset(self):
        """Only allow recipients to accept requests"""
        return BondcastRequest.objects.filter(recipient=self.request.user)
    
    def update(self, request, *args, **kwargs):
        """Accept the request and send WebSocket notification"""
        bondcast_request = self.get_object()
        bondcast_request.status = 'accepted'
        bondcast_request.save()
        
        # Send WebSocket notification to sender
        if bondcast_request.sender:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"bondcast_requests_{bondcast_request.sender.id}",
                {
                    "type": "bondcast_request_notification",
                    "data": {
                        "type": "bondcast_request_accepted",
                        "request": {
                            "id": bondcast_request.id,
                            "status": bondcast_request.status
                        }
                    }
                }
            )
        
        serializer = self.get_serializer(bondcast_request)
        return Response(serializer.data)

class RejectBondcastRequestView(generics.UpdateAPIView):
    """Reject a bondcast request"""
    permission_classes = [IsAuthenticated]
    serializer_class = BondcastRequestSerializer
    queryset = BondcastRequest.objects.all()
    
    def get_queryset(self):
        """Only allow recipients to reject requests"""
        return BondcastRequest.objects.filter(recipient=self.request.user)
    
    def update(self, request, *args, **kwargs):
        """Reject the request and send WebSocket notification"""
        bondcast_request = self.get_object()
        bondcast_request.status = 'rejected'
        bondcast_request.save()
        
        # Send WebSocket notification to sender
        if bondcast_request.sender:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"bondcast_requests_{bondcast_request.sender.id}",
                {
                    "type": "bondcast_request_notification",
                    "data": {
                        "type": "bondcast_request_rejected",
                        "request": {
                            "id": bondcast_request.id,
                            "status": bondcast_request.status
                        }
                    }
                }
            )
        
        serializer = self.get_serializer(bondcast_request)
        return Response(serializer.data)

class GetPendingBondcastRequestsView(generics.ListAPIView):
    """Get pending bondcast requests count for notifications"""
    permission_classes = [IsAuthenticated]
    serializer_class = BondcastRequestListSerializer
    
    def get_queryset(self):
        """Get all pending requests for the user (seen status only affects notification count)"""
        return BondcastRequest.objects.filter(
            recipient=self.request.user,
            status='pending'
        ).order_by('-created_at')
    
    def list(self, request, *args, **kwargs):
        """Return count and list of pending requests"""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        
        # Get count of unseen requests for notifications
        unseen_count = BondcastRequest.objects.filter(
            recipient=request.user,
            status='pending',
            seen=False
        ).count()
        
        return Response({
            'pending_count': unseen_count,  # For notification badges
            'total_pending_count': queryset.count(),  # For studio display
            'requests': serializer.data
        })

class UpdateResponseAudioView(generics.UpdateAPIView):
    """Update the response_audio_url for a completed bondcast request"""
    permission_classes = [IsAuthenticated]
    serializer_class = BondcastRequestSerializer
    queryset = BondcastRequest.objects.all()
    
    def get_queryset(self):
        """Only allow users to update their own completed requests"""
        return BondcastRequest.objects.filter(
            recipient=self.request.user,
            status='accepted'  # Only allow updating accepted requests
        )
    
    def perform_update(self, serializer):
        """Update the response audio URL and mark as completed"""
        bondcast_request = serializer.save()
        
        # Mark as completed when response audio is added
        if bondcast_request.response_audio_url:
            bondcast_request.mark_as_completed()
        
        # Send WebSocket notification to sender
        if bondcast_request.sender:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"bondcast_requests_{bondcast_request.sender.id}",
                {
                    "type": "bondcast_request_notification",
                    "data": {
                        "type": "bondcast_request_completed",
                        "request": {
                            "id": bondcast_request.id,
                            "status": bondcast_request.status,
                            "response_audio_url": bondcast_request.response_audio_url
                        }
                    }
                }
            )

class MarkBondcastRequestSeenView(generics.UpdateAPIView):
    """Mark bondcast requests as seen"""
    permission_classes = [IsAuthenticated]
    serializer_class = BondcastRequestSerializer
    queryset = BondcastRequest.objects.all()
    
    def update(self, request, *args, **kwargs):
        """Mark all pending bondcast requests for the user as seen"""
        current_user = request.user
        
        # Mark all pending and unseen bondcast requests as seen
        updated_count = BondcastRequest.objects.filter(
            recipient=current_user,
            status='pending',
            seen=False
        ).update(seen=True)
        
        # Send WebSocket notification to update the count
        if updated_count > 0:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"bondcast_requests_{current_user.id}",
                {
                    "type": "bondcast_request_notification",
                    "data": {
                        "type": "requests_marked_seen",
                        "updated_count": updated_count
                    }
                }
            )
        
        return Response({
            'message': f'{updated_count} bondcast requests marked as seen.',
            'updated_count': updated_count
        }, status=status.HTTP_200_OK)

class GenerateMoreTopicsView(generics.CreateAPIView):
    """Generate more topics using Groq AI"""
    permission_classes = [IsAuthenticated]
    
    def create(self, request, *args, **kwargs):
        """Generate 9 new topics based on existing examples"""
        
        # Create the system prompt
        system_prompt = f"""You are an AI assistant that generates fun, engaging topics for BondCast requests. 
        
        Based on these example topics, generate 9 NEW unique topics that are:
        - Fun and engaging for short conversations lasting about a minute
        - Similar in style to the examples (Would You Rather scenarios, hypothetical questions, etc.)
        - Suitable for creating interesting BondCasts
        - Diverse in themes and topics
        
        Example topics for reference:
        {json.dumps(example_topics, indent=2)}
        
        CRITICAL: You MUST return EXACTLY 18 fields: title1, description1, title2, description2, title3, description3, title4, description4, title5, description5, title6, description6, title7, description7, title8, description8, title9, description9.
        
        Each title should be short and catchy (2-4 words).
        Each description should be a fun question or scenario and simple enought for a 1 minute podcast-like conversation (1-2 sentences).
        
        Generate exactly 9 new topics with titles and descriptions. Make them creative, fun, and different from the examples provided.
        """
        
        max_retries = 10
        for attempt in range(max_retries):
            try:
                logger.info(f"Starting topic generation with Groq (attempt {attempt + 1}/{max_retries})")
                
                # Generate topics using Groq with structured output
                response = groq_instructor_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    response_model=TopicsResponse,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": "Generate 9 new fun topics for BondCast requests."}
                    ],
                    stream=False,
                    temperature=0.9,
                    max_completion_tokens=1000
                )
                
                logger.info("Successfully received response from Groq")
                
                # Convert the structured response to a list of topics
                topics = []
                for i in range(1, 10):
                    title = getattr(response, f'title{i}')
                    description = getattr(response, f'description{i}')
                    topics.append({
                        "id": i,
                        "title": title,
                        "description": description
                    })
                
                logger.info(f"Generated {len(topics)} topics successfully")
                
                return Response({
                    'topics': topics
                }, status=status.HTTP_200_OK)
                
            except Exception as e:
                logger.error(f"Error generating topics (attempt {attempt + 1}): {str(e)}")
                logger.error(f"Error type: {type(e).__name__}")
                
                if attempt < max_retries - 1:
                    logger.info(f"Retrying... ({attempt + 2}/{max_retries})")
                    continue
                else:
                    logger.error("All retry attempts failed")
                    return Response({
                        'error': f'Failed to generate topics after {max_retries} attempts: {str(e)}'
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class GenerateUserInputTopicView(generics.CreateAPIView):
    """Generate topics based on user input search"""
    permission_classes = [IsAuthenticated]
    
    def create(self, request, *args, **kwargs):
        """Generate topics based on user input after validation"""
        user_input = request.data.get('search_query', '').strip()
        
        if not user_input:
            return Response({
                'error': 'Please write something appropriate'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # First, validate the user input
        validation_prompt = f"""
        Evaluate if this user input is appropriate and makes sense for generating podcast topics:
        "{user_input}"
        
        Consider:
        - Is it clear and understandable, or is the input just random letters?
        - Is it not offensive, violent, or inappropriate?
        
        Respond with:
        - is_valid: true/false
        - reason: brief explanation of why it's valid or invalid
        """
        
        try:
            # Validate user input
            validation_response = groq_instructor_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                response_model=ValidationResponse,
                messages=[
                    {"role": "system", "content": validation_prompt},
                    {"role": "user", "content": f"Validate this input: {user_input}"}
                ],
                stream=False,
                temperature=0.3,
                max_completion_tokens=200
            )
            
            logger.info(f"Validation result: {validation_response.is_valid} - {validation_response.reason}")
            
            # If validation fails, return error
            if not validation_response.is_valid:
                return Response({
                    'error': 'Please write something appropriate'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # If validation passes, generate topics based on user input
            generation_prompt = f"""You are an AI assistant that generates fun, engaging topics for BondCast requests. 
            
            The user has requested topics related to: "{user_input}"
            
            Based on this request and these example topics, generate 9 NEW unique topics that are:
            - Related to the user's search query
            - Fun and engaging for short conversations lasting about a minute
            - Similar in style to the examples (Would You Rather scenarios, hypothetical questions, etc.)
            - Suitable for creating interesting BondCasts
            - Diverse in themes and topics
            
            Example topics for reference:
            {json.dumps(example_topics, indent=2)}
            
            CRITICAL: You MUST return EXACTLY 18 fields: title1, description1, title2, description2, title3, description3, title4, description4, title5, description5, title6, description6, title7, description7, title8, description8, title9, description9.
            
            Each title should be short and catchy (2-4 words).
            Each description should be a fun question or scenario and simple enough for a 1 minute podcast-like conversation (1-2 sentences).
            
            Generate exactly 9 new topics with titles and descriptions. Make them creative, fun, and different from the examples provided.
            """
            
            max_retries = 5
            for attempt in range(max_retries):
                try:
                    logger.info(f"Generating topics based on user input (attempt {attempt + 1}/{max_retries})")
                    
                    # Generate topics using Groq with structured output
                    response = groq_instructor_client.chat.completions.create(
                        model="llama-3.3-70b-versatile",
                        response_model=TopicsResponse,
                        messages=[
                            {"role": "system", "content": generation_prompt},
                            {"role": "user", "content": f"Generate 9 topics related to: {user_input}"}
                        ],
                        stream=False,
                        temperature=0.9,
                        max_completion_tokens=1000
                    )
                    
                    logger.info("Successfully received response from Groq")
                    
                    # Convert the structured response to a list of topics
                    topics = []
                    for i in range(1, 10):
                        title = getattr(response, f'title{i}')
                        description = getattr(response, f'description{i}')
                        topics.append({
                            "id": i,
                            "title": title,
                            "description": description
                        })
                    
                    logger.info(f"Generated {len(topics)} topics successfully based on user input")
                    
                    return Response({
                        'topics': topics
                    }, status=status.HTTP_200_OK)
                    
                except Exception as e:
                    logger.error(f"Error generating topics (attempt {attempt + 1}): {str(e)}")
                    logger.error(f"Error type: {type(e).__name__}")
                    
                    if attempt < max_retries - 1:
                        logger.info(f"Retrying... ({attempt + 2}/{max_retries})")
                        continue
                    else:
                        logger.error("All retry attempts failed")
                        return Response({
                            'error': f'Failed to generate topics after {max_retries} attempts: {str(e)}'
                        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        except Exception as e:
            logger.error(f"Error in validation or generation: {str(e)}")
            return Response({
                'error': f'Failed to process request: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class MarkBondcastRequestCompletedView(generics.UpdateAPIView):
    """Mark a bondcast request as completed when a recording is sent"""
    permission_classes = [IsAuthenticated]
    serializer_class = BondcastRequestSerializer
    queryset = BondcastRequest.objects.all()
    
    def get_queryset(self):
        """Only allow recipients to complete their own requests"""
        return BondcastRequest.objects.filter(recipient=self.request.user)
    
    def update(self, request, *args, **kwargs):
        """Mark the request as completed and send WebSocket notification"""
        bondcast_request = self.get_object()
        bondcast_request.mark_as_completed()
        
        # Send WebSocket notification to sender
        if bondcast_request.sender:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"bondcast_requests_{bondcast_request.sender.id}",
                {
                    "type": "bondcast_request_notification",
                    "data": {
                        "type": "bondcast_request_completed",
                        "request": {
                            "id": bondcast_request.id,
                            "status": bondcast_request.status,
                            "completed_at": bondcast_request.completed_at.isoformat() if bondcast_request.completed_at else None
                        }
                    }
                }
            )
        
        serializer = self.get_serializer(bondcast_request)
        return Response(serializer.data)
