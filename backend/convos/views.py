from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.core.cache import cache
import os
from groq import Groq
from datetime import datetime
import logging
import pytz

logger = logging.getLogger(__name__)

class SetGreetingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Get time context from frontend
        time_context = request.data
        user = request.user
        now = datetime.now()

        # Get user's timezone from frontend, default to UTC if not provided
        user_timezone = pytz.timezone(time_context.get('timezone', 'UTC'))
        now = now.astimezone(user_timezone)

        # Use provided context if available
        hour = time_context.get('hour', now.hour)
        minute = time_context.get('minute', now.minute)
        weekday = time_context.get('weekday', now.strftime('%A'))
        is_weekend = weekday in ["Saturday", "Sunday"]
        meal_time_context = ""
        general_time_context = ""

        # Determine time of day context
        if 0 <= hour < 5:
            time_of_day_context = "late night"
            if is_weekend: general_time_context = f"Consider that {user.firstname} is up really late at night on a weekend."
            else: general_time_context = f"Consider that {user.firstname} is up really late at night on a weekday."
        elif 5 <= hour < 7:
            time_of_day_context = "early morning"
            if is_weekend:
                general_time_context = f"Consider that {user.firstname} is up really early in the morning on a weekend."
            else:
                general_time_context = (f"Consider that {user.firstname} is up really early in the morning on a weekday "
                "and could be getting ready for their day of work, internship, or school.")
            meal_time_context = f"Consider that {user.firstname} might have just had or is about to eat breakfast but you don't know what they are eating."
        elif 7 <= hour < 9:
            time_of_day_context = "morning"
            if is_weekend: 
                general_time_context = f"Consider that {user.firstname} is up in the morning on a weekend."
            else: 
                general_time_context = (f"Consider that {user.firstname} is up in the morning on a weekday "
                "and could be getting ready for their day of work, internship, or school.")
            meal_time_context = f"Consider that {user.firstname} might have just had or is about to eat breakfast."
        elif 9 <= hour < 11:
            time_of_day_context = "morning"
            if not is_weekend: 
                general_time_context = (f"Consider that {user.firstname} might currently "
                "be at their work, internship, or school.")
            if is_weekend: meal_time_context = f"Consider that {user.firstname} might have just had or is about to eat breakfast."
        elif 11 <= hour < 15:
            time_of_day_context = "afternoon"
            meal_time_context = f"Consider that {user.firstname} might have just had or is about to eat lunch."
            if not is_weekend: 
                general_time_context = (f"Consider that {user.firstname} might currently "
                "be at their work, internship, or school.")
        elif 15 <= hour < 17:
            time_of_day_context = "afternoon"
            if not is_weekend: 
                general_time_context = (f"Consider that {user.firstname} might currently "
                "be at their work, internship, or school.")
        elif 17 <= hour < 19:
            time_of_day_context = "evening"
            if not is_weekend: 
                general_time_context = (f"Consider that {user.firstname} might currently "
                "be finshing up or have finished their work, internship, or school for the day.")
        elif 19 <= hour < 22:
            time_of_day_context = "evening"
            meal_time_context = f"Consider that {user.firstname} might have just had or is about to eat dinner."
            if not is_weekend: 
                general_time_context = (f"Consider that {user.firstname} have just "
                "up a day of their work, internship, or school.")
        else:
            time_of_day_context = "night"
            if not is_weekend: 
                general_time_context = (f"Consider that {user.firstname} have just "
                "up a day of their work, internship, or school.")

        # Build contextual history
        dob = getattr(user, 'dob', None)
        birthday_today = False
        if dob:
            try:
                birthday_today = (dob.month == now.month and dob.day == now.day)
            except Exception:
                pass

        bondi_contextual_history = [
            f"You are on a call with {user.firstname} on {weekday} in {time_of_day_context} at {hour:02d}:{minute:02d}",
            f"{general_time_context} {meal_time_context}",
            f"It's {user.firstname}'s birthday today on {dob.month} {dob.day}." if birthday_today else None,
            "It's Christmas Day." if (now.month == 12 and now.day == 25) else None,
            "It's New Year's Day." if (now.month == 1 and now.day == 1) else None,
        ]

        bondi_contextual_history = ' '.join([x for x in bondi_contextual_history if x])

        logger.info(f"Bondi contextual history: {bondi_contextual_history}")

        greeting_llm_tts_system_context = (
            f"Your name is Bondi and you are on a call with {user.firstname} who just called you. "
            f"You are on a call with {user.firstname} on {weekday} in {time_of_day_context} at {hour:02d}:{minute:02d}"
            + (f" It's {user.firstname}'s birthday today on {dob.month} {dob.day}." if birthday_today else "")
            + (" It's Christmas Day." if (now.month == 12 and now.day == 25) else "")
            + (" It's New Year's Day." if (now.month == 1 and now.day == 1) else "")
        )
        greeting_llm_tts_input = (
            f"Your name is Bondi and you are on a call with {user.firstname} who just called you. "
            f"Spark a conversation with {user.firstname} and only "
            f"ONLY say a simple casual call opener with a question like a human would during a phone call. Nothing Else."
        )

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
            greeting = completion.choices[0].message.content.strip()
        except Exception as e:
            return Response({'error': f'Groq error: {str(e)}'}, status=500)

        # Store the greeting and contextual history in cache with user's ID as part of the key
        cache_key = f'user_{user.id}_greeting'
        cache.set(cache_key, greeting, timeout=3600)  # Cache for 1 hour
        
        context_key = f'user_{user.id}_context'
        cache.set(context_key, bondi_contextual_history, timeout=3600)  # Cache for 1 hour

        return Response({'success': True, 'greeting': greeting}) 