from rest_framework.views import APIView   # type: ignore
from rest_framework.permissions import IsAuthenticated  # type: ignore
from rest_framework.response import Response  # type: ignore
from django.core.cache import cache  # type: ignore
import os  # type: ignore
from groq import Groq  # type: ignore
from datetime import datetime  # type: ignore
import logging  # type: ignore
import pytz  # type: ignore

logger = logging.getLogger(__name__)

class SetIntroView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Get time context from frontend
        user = request.user
        podcast_description = request.data.get('podcast_description', "")
        logger.info(f"Podcast Description: {podcast_description}")
        
        greeting_llm_tts_system_context = f""""Podcast Description: "{podcast_description}". User's name: {user.firstname}"""

        greeting_llm_tts_input = f"""Concisely rephrase the podcast description as a simple question to " 
        "jumpstart a 1 minute podcast conversation. You must ask {user.firstname} a question at the end of your response.
        Example Response: "Today, I'm here with {user.firstname} and we're talking about (simple blank). Then say
        {user.firstname} and ask the question."""

        # Call Groq
        groq_api_key = os.getenv('GROQ_API_KEY')
        if not groq_api_key:
            return Response({'error': 'Groq API key not set'}, status=500)
        groq = Groq(api_key=groq_api_key)
        try:
            completion = groq.chat.completions.create(
                messages=[
                    {"role": "system", "content": greeting_llm_tts_system_context},
                    {"role": "user", "content": greeting_llm_tts_input}
                ],
                model="llama-3.1-8b-instant",
                temperature=0.9,
                max_tokens=75,
            )
            intro = completion.choices[0].message.content.strip()
        except Exception as e:
            return Response({'error': f'Groq error: {str(e)}'}, status=500)

        # Store the greeting and contextual history in cache with user's ID as part of the key
        cache_key = f'user_{user.id}_intro'
        cache.set(cache_key, intro, timeout=3600)  # Cache for 1 hour
        
        context_key = f'user_{user.id}_context'
        cache.set(context_key, podcast_description, timeout=3600)  # Cache for 1 hour

        return Response({'success': True, 'greeting': intro}) 