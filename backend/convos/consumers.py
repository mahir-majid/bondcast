import json, asyncio, logging
from channels.generic.websocket import AsyncWebsocketConsumer
import time
from vosk import Model, KaldiRecognizer
from django.contrib.auth import get_user_model
from channels.db import database_sync_to_async
from groq import Groq, AsyncGroq
from dotenv import load_dotenv
import os
from pathlib import Path
from elevenlabs import stream
from elevenlabs.client import ElevenLabs
import random
from pydantic import BaseModel

# Load environment variables
env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(env_path)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

CHUNK_SAMPLES = 16000 // 4  
SILENCE_THRESHOLD = 0.5  # seconds of silence before processing
STREAM_TIMEOUT = 5  # seconds of silence before ending stream
FIRST_TIMEOUT = 5
SECOND_TIMEOUT = 5

# Initialize Vosk model
model_path = "convos/vosk-model-en-us-0.15"  # Path relative to backend directory
vosk_stt_model = Model(model_path)

# Initialize ElevenLabs client
api_key = os.getenv('ELEVENLABS_API_KEY')
if not api_key:
    raise ValueError("ELEVENLABS_API_KEY environment variable not set")
elevenlabs = ElevenLabs(api_key=api_key)

 # Initialize Groq client with API key from .env
groq_client = AsyncGroq(api_key=os.getenv('GROQ_API_KEY'))

User = get_user_model()

class SpeechConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Get username and llmMode from URL
        self.username = self.scope['url_route']['kwargs']['username']
        self.llmMode = self.scope['url_route']['kwargs']['llmMode']
        
        self.justCalled = True
        
        # Get user from database
        user = await self.get_user_by_username(self.username)
        if not user:
            logger.warning(f"User not found: {self.username}")
            await self.close(code=4001)
            return
        
        await self.accept()
            
        self.user_id = user.id
        self.firstname = user.firstname
        logger.info(f"Connected user {self.firstname} with llmMode: {self.llmMode}")

        # Initialize task tracking
        self.middleware_llm_task = None
        self.tts_llm_task = None

        # Greet the User
        greeting_options = [
                    f"Hey {self.firstname}, how are you doing?",
                    f"Hey, glad you called. How's it going?",
                    f"Hey there! How have you been?",
                    f"What's up {self.firstname}? Everything good?",
                    f"Hi! It's been a minute — how are you?",
                    f"Hey {self.firstname}, what's new with you?",
                    f"Hi {self.firstname}, how's your day going?"
                ]

        greeting = random.choice(greeting_options)
        self.buf = bytearray()
        self.overall_text = ""
        self.last_baseline_audio_time = time.time()
        self.current_text = ""
        self.agent_last_response = ""
        self.partial_text_cache = ""
        self.partial_last_commited_text = ""
        self.silence_task = None
        self.streaming_text = False
        self.transcribing_text = False
        self.call_is_ending = False
        self.passed_first_timeout = False
        self.passed_second_timeout = False

        # Initialize Vosk recognizer
        self.stt_recognizer = KaldiRecognizer(vosk_stt_model, 16000)
        self.stt_recognizer.SetWords(True)

        # Start background tasks
        self.transcription_task = asyncio.create_task(self._transcription_loop())
        self.silence_task = asyncio.create_task(self._check_silence_loop())

        await self._stream_tts(greeting)
        
        logger.info(f"WS connected for user: {self.firstname}")

    @database_sync_to_async
    def get_user_by_username(self, username):
        try:
            return User.objects.get(username=username)
        except User.DoesNotExist:
            return None

    async def _transcription_loop(self):
        while True:
            if not self.streaming_text and len(self.buf) >= CHUNK_SAMPLES * 2:
                chunk = self.buf[:CHUNK_SAMPLES * 2]
                del self.buf[:CHUNK_SAMPLES * 2]
                await self._transcribe(chunk)
            await asyncio.sleep(0.01)

    async def _check_silence_loop(self):
        while True:
            if self.streaming_text or not self.transcribing_text:
                await asyncio.sleep(0.1)
                continue

            current_time = time.time()
            user_audio_delay = current_time - self.last_baseline_audio_time
 
            # Normal silence threshold check
            if self.llmMode == "user_called" and user_audio_delay >= SILENCE_THRESHOLD and self.current_text:
                self.transcribing_text = False
                # logger.info(f"Middleware silence threshold reached. Processing text: {self.current_text}")
                llm_middleware_input = (f"User just said \"{self.current_text}\" with {int(user_audio_delay * 1000)} ms of silence. "
                f"For reference, the last thing the AI agent Bondi said to user was \"{self.agent_last_response}\" ")
                self.llm_middleware_last_current_text = self.current_text

                llm_middleware_system_context = (
                    "You are a real-time decision engine inside a voice AI system that talks with users. "
                    "Your only job is to detect whether the user has finished speaking and it's time for the AI agent named Bondi to respond.\n\n"

                    "Respond ONLY with JSON:\n"
                    "{\"should_respond\": true} — if the user has likely finished their response to Bondi's latest remark and the AI should now speak\n"
                    "{\"should_respond\": false} — if the user is still mid-thought and the AI should wait\n\n"

                    "Rules:\n"
                    "- If the user’s answer sounds complete in response to AI agent Bondi's last remark, respond with true even with very short silence (as low as 150 ms).\n"
                    "- If the utterance ends in a filler (like 'and', 'but', 'so', etc), or is clearly incomplete, respond false.\n"
                    "- For silence longer than 1200ms, assume user is done unless it's obviously a trailing sentence.\n"

                    "NEVER explain your reasoning. Just return the JSON."
                )
                asyncio.create_task(self._process_middleware_llm(llm_middleware_input, llm_middleware_system_context, user_audio_delay))

            # First timeout check
            if not self.passed_first_timeout and not self.call_is_ending and user_audio_delay >= FIRST_TIMEOUT and not self.current_text:
                self.transcribing_text = False
                logger.info("first timeout request made")
                first_timeout_response = "Can you still hear me?"
                self.passed_first_timeout = True
                await self._stream_tts(first_timeout_response)
                # Wait for streaming to complete before continuing
                while self.streaming_text:
                    await asyncio.sleep(0.1)
                continue  # Skip to next iteration to recheck conditions

            # Second timeout check
            if self.passed_first_timeout and not self.passed_second_timeout and not self.call_is_ending and user_audio_delay >= SECOND_TIMEOUT and not self.current_text:
                self.transcribing_text = False
                logger.info("second timeout request made")
                second_timeout_response = "Hello? Are you still there?"
                self.passed_second_timeout = True
                await self._stream_tts(second_timeout_response)
                # Wait for streaming to complete before continuing
                while self.streaming_text:
                    await asyncio.sleep(0.1)
                continue  # Skip to next iteration to recheck conditions

            # Final timeout check
            if self.passed_first_timeout and self.passed_second_timeout and not self.call_is_ending and user_audio_delay >= STREAM_TIMEOUT and not self.current_text:
                self.transcribing_text = False
                self.call_is_ending = True  # Set this before streaming to prevent race conditions
                timeout_response = "Let's talk later. Goodbye."
                await self._stream_tts(timeout_response)
                # Wait for streaming to complete before closing
                while self.streaming_text:
                    await asyncio.sleep(0.1)
                await self.close(code=1000)  # Normal closure
                break

            await asyncio.sleep(0.1)

    async def receive(self, text_data=None, bytes_data=None):
        if text_data:
            try:
                data = json.loads(text_data)
                if data.get("type") == "audio_started":
                    logger.info("Frontend started playing audio")
                    self.streaming_text = True
                    self.transcribing_text = False
                elif data.get("type") == "audio_done":
                    logger.info("Frontend finished playing audio")
                    self.streaming_text = False
                    self.transcribing_text = True
                    self.last_baseline_audio_time = time.time()
                return
            except Exception as e:
                logger.warning(f"Invalid JSON from frontend: {e}")

        if not bytes_data:
            return

        self.buf.extend(bytes_data)

    async def _transcribe(self, pcm_bytes: bytes):
        # Convert bytearray to bytes and ensure it's in the correct format
        audio_data = bytes(pcm_bytes)

        if not self.streaming_text:
            self.stt_recognizer.AcceptWaveform(audio_data)
            partial_result = json.loads(self.stt_recognizer.PartialResult())
            partial_text = partial_result.get("partial", "")

            if partial_text:
                # logger.info(f"Partial text: {partial_text}")
                self.justCalled = False
                self.passed_first_timeout = False
                self.passed_second_timeout = False

                if partial_text == self.partial_text_cache and partial_text != self.partial_last_commited_text:
                    # Cancel any ongoing LLM processing when new speech is detected
                    if self.middleware_llm_task and not self.middleware_llm_task.done():
                        self.middleware_llm_task.cancel()
                        logger.info("Cancelled middleware LLM task due to new user input")

                    if self.tts_llm_task and not self.tts_llm_task.done():
                        self.tts_llm_task.cancel()
                        logger.info("Cancelled TTS LLM task due to new user input")

                    self.current_text = partial_text
                    self.partial_last_commited_text = partial_text
                    self.partial_text_cache = ""  
                    self.last_baseline_audio_time = time.time()
                    logger.info(f"transcription: {partial_text}")
                    self.transcribing_text = True
                    # logger.info(f"current text: {self.current_text}")
                else:
                    self.partial_text_cache = partial_text
    
    async def _process_middleware_llm(self, llm_middleware_input: str, llm_middleware_system_context: str, silence_time: float) -> None:
        try:
            self.middleware_llm_task = asyncio.current_task()
            logger.info(f"Entered LLM Middleware Response with: {self.current_text}")
            logger.info(f"LLM Middleware Input: {llm_middleware_input}")
            # logger.info(f"LLM Middleware System Context: {llm_middleware_system_context}")

            groq_response = await groq_client.chat.completions.create(
                model="llama-3.1-8b-instant", 
                messages=[
                    {"role": "system", "content": llm_middleware_system_context},
                    {"role": "user", "content": llm_middleware_input}
                ],
                stream=False,  
                temperature=0.7,    
                max_completion_tokens=75,
            )

            raw_content = groq_response.choices[0].message.content.strip()
            logger.info(f"Middleware LLM Raw Output: {raw_content}")
            try:
                parsed = json.loads(raw_content)
                llm_should_respond = parsed.get("should_respond", False)
            except Exception as e:
                logger.warning(f"Failed to parse LLM middleware JSON: {e} — Raw: {raw_content}")
                llm_should_respond = False

            if not llm_should_respond:
                logger.info(f"Middleware Response Rejected")
                self.transcribing_text = True
                return
            elif not self.streaming_text and not self.transcribing_text:
                logger.info(f"Middleware Response Accepted")
                reference = f"For reference, here's entire conversation history: {self.overall_text}" if self.overall_text else ""
                llm_tts_input = (f"{self.firstname} most recently said: \"{self.current_text}\" {reference}"  
                                "VERY IMPORTANT, since you're not a real human, DO NOT talk about yourself at all as "
                                "if you're a human but feel free to give personalized feedback and remarks to be engaging "
                                "and drive further conversation with the user.")        
                llm_tts_system_context = (f"You are a kind caring AI conversational friend agent named Bondi and are imitating "
                f"as one of {self.firstname}'s friends. Give them normal "
                "relaxing responses and continue driving the conversation with questions about their day and "
                "what's been going on recently, but don't be cringe. keep responses 1 to 2 sentences "
                "max unless you have good reason not to. VERY IMPRORTANT, since you're not a real human, DO NOT talk about "
                "yourself at all as if you're a human but feel free to give personalized feedback and remarks to be engaging "
                "and to drive further conversation with the user. If the conversation gets dry, "
                "reference relevant current events to liven up the conversation, but only after hearing a sufficient amount "
                "about the user's day from their personal life. " )
                self.overall_text += self.firstname + f": \"{self.current_text}\" "
                asyncio.create_task(self._process_tts_llm(llm_tts_input, llm_tts_system_context))
                self.current_text = ""
        except asyncio.CancelledError:
            logger.info("Middleware LLM processing was cancelled mid-flight")
            return

    async def _process_tts_llm(self, llm_input: str, llm_system_context: str) -> None:
        try:
            self.tts_llm_task = asyncio.current_task()
            logger.info(f"Preparing LLM Response")
            logger.info(f"LLM TTS Input: {llm_input} ")
            # logger.info(f"LLM TTS System Context: {llm_system_context}") 
        
            # Get groq response
            groq_response = await groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",  
                messages=[
                    {"role": "system", "content": llm_system_context},
                    {"role": "user", "content": llm_input}
                ],
                stream=False,  
                temperature=0.7,
                max_completion_tokens=100,
            )
            # Extract the full response content
            llm_response = groq_response.choices[0].message.content.strip()
            asyncio.create_task(self._stream_tts(llm_response))
        except asyncio.CancelledError:
            logger.info("TTS LLM processing was cancelled mid-flight")
            return

    async def _stream_tts(self, tts_text):
        if self.streaming_text:
            logger.info("Streaming request blocked. Already streaming text")
            return
        elif self.transcribing_text:
            logger.info("Streaming request blocked bc transcription detection ping")
            return
        
        # Stream response to ElevenLabs
        try:
            logger.info("Commited to streaming :)")
            self.streaming_text = True
            self.stt_recognizer.Reset()
            self.agent_last_response = tts_text
            logger.info(f"Entered TTS streaming mode")
            logger.info(f"Bondi response: {tts_text}")
            self.overall_text += "Bondi: " + f"\"{tts_text}\" "

            # Get audio stream and send to frontend
            audio_stream = elevenlabs.text_to_speech.stream(
                text=tts_text,
                voice_id="4NejU5DwQjevnR6mh3mb",  # Ivanna
                model_id="eleven_flash_v2",
                output_format="pcm_16000"
            )
            
            # Stream audio chunks to frontend
            chunk_count = 0
            total_bytes = 0

            for chunk in audio_stream:
                if isinstance(chunk, bytes):
                    chunk_size = len(chunk)
                    total_bytes += chunk_size
                    chunk_count += 1

                    await self.send(bytes_data=chunk)
            
            self.last_baseline_audio_time = time.time()
            logger.info("ElevenLabs Speech Ended; Last Audio Set!")

        except Exception as e:
            logger.error(f"Error in ElevenLabs streaming: {str(e)}")
            logger.error(f"Error details: {type(e).__name__}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            # Send error message to frontend
            await self.send(text_data=json.dumps({
                "type": "error",
                "content": f"Failed to generate speech: {str(e)}"
            }))


    async def disconnect(self, code):
        await self._flush()
        if self.silence_task and not self.silence_task.done():
            self.silence_task.cancel()
        logger.info("WS closed")

    async def _flush(self):
        if self.buf:
            await self._transcribe(self.buf)
            self.buf.clear()
