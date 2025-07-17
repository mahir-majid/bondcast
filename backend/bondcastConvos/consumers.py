import json, asyncio, logging
from channels.generic.websocket import AsyncWebsocketConsumer  # type: ignore
import time
from vosk import Model, KaldiRecognizer  # type: ignore
from django.contrib.auth import get_user_model  # type: ignore
from channels.db import database_sync_to_async  # type: ignore
import groq  # type: ignore
import instructor  # type: ignore
from pydantic import BaseModel  # type: ignore
from dotenv import load_dotenv  # type: ignore
import os
from pathlib import Path
from elevenlabs import stream  # type: ignore
from elevenlabs.client import ElevenLabs  # type: ignore
import random
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date
from .assembly_stt import AssemblySTT
from .responsePrompts import *
from django.core.cache import cache  # type: ignore
from typing import List

executor = ThreadPoolExecutor(max_workers=2)  # Put globally

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

# Adjust chunk size to be within AssemblyAI's requirements (50-1000ms)
# For 16kHz audio, 800 samples = 50ms, 16000 samples = 1000ms
# Let's use 3200 samples = 200ms to be safe
CHUNK_SAMPLES = 3200  # 200ms of audio at 16kHz
SILENCE_THRESHOLD = 0.5  # seconds of silence before processing
STREAM_TIMEOUT = 2  # seconds of silence before ending stream
FIRST_TIMEOUT = 4
SECOND_TIMEOUT = 1
MAX_CALL_DURATION_TIME = 120


# Initialize Vosk model
model_path = "bondcastConvos/vosk-model-en-us-0.15"  # Path relative to backend directory
vosk_stt_model = Model(model_path)

# Initialize ElevenLabs client
api_key = os.getenv('ELEVENLABS_API_KEY')
if not api_key:
    raise ValueError("ELEVENLABS_API_KEY environment variable not set")
elevenlabs = ElevenLabs(api_key=api_key)

 # Initialize Groq client with API key from .env
groq_client = groq.Groq(api_key=os.getenv('GROQ_API_KEY'))

# Initialize instructor client for structured responses
groq_instructor_client = instructor.patch(groq.Groq(api_key=os.getenv('GROQ_API_KEY')))

User = get_user_model()

class SpeechConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Get username and Chat.tsx variant from URL
        self.username = self.scope['url_route']['kwargs']['username']
        self.variant = self.scope['url_route']['kwargs']['variant']
        
        self.justCalled = True
        self.ready_for_streaming = True  # Add this flag
        
        # Get user from database
        user = await self.get_user_by_username(self.username)  # type: ignore
        if not user:
            logger.warning(f"User not found: {self.username}")
            await self.close(code=4001)
            return
        
        await self.accept()

        self.is_recording = False            
        self.user_id = user.id
        self.firstname = user.firstname
        self.user_summary = user.user_summary
        
        logger.info(f"Connected user {self.firstname} with variant: {self.variant}")
        self.start_call_time = time.time()
        self.last_baseline_audio_time = time.time()
        self.buf = bytearray()
        self.conversation_history = ""
        self.current_user_input = ""
        self.agent_last_response = ""
        self.incoming_tts = ""
        self.streaming_text = True
        self.transcribing_text = False
        self.call_is_ending = False
        self.passed_first_timeout = False
        self.passed_second_timeout = False
        self.bondi_llm_triggered = False
        self.user_age = (date.today().year - user.dob.year) - ((date.today().month, date.today().day) < (user.dob.month, user.dob.day))
        self.current_day = datetime.now().strftime("%A, %B %d")
        self.convo_llm_mode = "general"

        # Initialize Vosk recognizer for partial transcription
        self.vosk_stt_recognizer = KaldiRecognizer(vosk_stt_model, 16000)
        self.vosk_partial_count = 0

        # Initialize AssemblyAI STT
        self.assembly_stt = AssemblySTT(self._transcribe)
        self.assembly_stt.start()

        # Start background tasks
        self.silence_task = asyncio.create_task(self._check_silence_loop())
        self.tts_llm_task = None
        self.tts_stream_task = None

        # Get greeting and contextual history from cache
        intro_cache_key = f'user_{self.user_id}_intro'
        bondcast_context_key = f'user_{self.user_id}_context'

        self.bondi_greeting = cache.get(intro_cache_key)
        self.conversation_context = cache.get(bondcast_context_key) or ""

        # logger.info(f"Contextual History: {self.conversation_context}")

        # Don't start greeting immediately - wait for ready signal
        self.bondi_llm_triggered = True

        # logger.info(f"WS connected for user: {self.firstname}")

    @database_sync_to_async
    def get_user_by_username(self, username):
        try:
            return User.objects.get(username=username)
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def check_user_has_friends(self, user):
        """Check if user has at least one friend"""
        from friends.models import Friendship
        return Friendship.objects.filter(user_a=user).exists() or Friendship.objects.filter(user_b=user).exists()

    def _transcribe(self, transcript):
        """Callback for handling transcripts from AssemblyAI"""
        if transcript == "__START_TRANSCRIPTION__":
            # logger.info(f"ASSEMBLY TRIGGERED TRANSCRIPTION")
            self.transcribing_text = True
            self.streaming_text = False
            return
        elif transcript:
            self.justCalled = False
            self.passed_first_timeout = False
            self.passed_second_timeout = False

            # Cancel any ongoing LLM processing when new speech is detected
            if self.tts_llm_task and not self.tts_llm_task.done():
                self.tts_llm_task.cancel()

            # Cancel any ongoing TTS streaming when new speech is detected
            if self.tts_stream_task and not self.tts_stream_task.done():
                self.tts_stream_task.cancel()

            if self.current_user_input: self.current_user_input += " " + transcript
            else: self.current_user_input = transcript

            # logger.info(f"TRANSCRIPTION: {transcript}")
            self.transcribing_text = False
            self.streaming_text = False
            self.last_baseline_audio_time = time.time()

    async def _check_silence_loop(self):
        while True:
            if self.transcribing_text:
                await asyncio.sleep(0.1)
                continue
            current_time = time.time()
            user_audio_delay = current_time - self.last_baseline_audio_time
            total_call_time = time.time() - self.start_call_time

            if user_audio_delay >= SILENCE_THRESHOLD and total_call_time > MAX_CALL_DURATION_TIME and not self.streaming_text and not self.transcribing_text: 
                self.call_is_ending = True  # Set this before streaming to prevent race conditions
                self.streaming_text = True
                timeout_response = "Sorry but I have to go right now. It was nice chatting and I will talk to you later."
                await self._stream_tts(timeout_response)
                # Connection will close when we receive audio_done
                break

            # Normal silence threshold check
            if not self.bondi_llm_triggered and user_audio_delay >= SILENCE_THRESHOLD and self.current_user_input and not self.transcribing_text:
                self.bondi_llm_triggered = True
                self.tts_llm_task = asyncio.create_task(self._process_tts_llm())

            # First timeout check
            if not self.streaming_text and not self.bondi_llm_triggered and not self.passed_first_timeout and not self.call_is_ending and user_audio_delay >= FIRST_TIMEOUT and not self.current_user_input:
                logger.info("first timeout request made")
                first_timeout_response = "Are you still there?"
                self.passed_first_timeout = True
                await self._stream_tts(first_timeout_response)
                # Wait for streaming to complete before continuing
                while self.streaming_text:
                    await asyncio.sleep(0.1)
                continue  # Skip to next iteration to recheck conditions

            # Second timeout check
            if self.passed_first_timeout and not self.passed_second_timeout and not self.call_is_ending and user_audio_delay >= SECOND_TIMEOUT and not self.current_user_input:
                logger.info("second timeout request made")
                self.passed_second_timeout = True
                # second_timeout_response = "Hello? Are you still there?"
                # await self._stream_tts(second_timeout_response)
                # # Wait for streaming to complete before continuing
                # while self.streaming_text:
                #     await asyncio.sleep(0.1)
                # continue  # Skip to next iteration to recheck conditions

            # Final timeout check
            if self.passed_first_timeout and self.passed_second_timeout and not self.call_is_ending and user_audio_delay >= STREAM_TIMEOUT and not self.current_user_input:
                self.call_is_ending = True  # Set this before streaming to prevent race conditions
                self.streaming_text = True
                timeout_response = "Let's do this Bond Cast later."
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
                if data.get("type") == "ready_for_streaming":
                    self.ready_for_streaming = True

                    if self.variant == "default":
                        # Send start recording signal to frontend
                        await self.send(text_data=json.dumps({"type": "start_recording"}))
                        logger.info("Sent start_recording signal to frontend")
                    # Now start the greeting
                    await self._stream_tts(self.bondi_greeting)
                elif data.get("type") == "audio_started":
                    # logger.info("Frontend started playing audio")
                    self.streaming_text = True
                elif data.get("type") == "audio_done":
                    self.streaming_text = False
                    self.bondi_llm_triggered = False
                    self.last_baseline_audio_time = time.time()
                    if self.conversation_history: self.conversation_history += self.firstname + f": \"{self.current_user_input}\" "
                    self.current_user_input = ""
                    self.agent_last_response = self.incoming_tts
                    self.conversation_history += "Bondi: " + f"\"{self.agent_last_response}\" "
                    self.buf.clear()  # Just clear the buffer, no need to send to AssemblyAI
                    # logger.info("Frontend finished playing audio")
                    # Close connection if this was the final timeout message
                    if self.call_is_ending:
                        await self.close(code=1000)  # Normal closure
                elif data.get("type") == "audio_cleanup":
                    # logger.info("Frontend audio cleanup complete")
                    self.streaming_text = False
                    self.bondi_llm_triggered = False
                return
            except Exception as e:
                logger.warning(f"Invalid JSON from frontend: {e}")

        if not bytes_data:
            return

        # Add new audio data to buffer
        self.buf.extend(bytes_data)

        # Send chunks for transcription once we have enough data
        if len(self.buf) >= CHUNK_SAMPLES:
            chunk = self.buf[:CHUNK_SAMPLES]
            del self.buf[:CHUNK_SAMPLES]

            # Send to AssemblyAI for real transcription
            self.assembly_stt.send_audio(bytes(chunk))
            
            # Process with Vosk for partial transcription
            self.vosk_stt_recognizer.AcceptWaveform(bytes(chunk))
            partial_result = json.loads(self.vosk_stt_recognizer.PartialResult())

            if partial_result.get("partial"):
                # logger.info(f"Vosk Partial Triggered!")
                self.last_baseline_audio_time = time.time()
                self.justCalled = False
                self.passed_first_timeout = False
                self.passed_second_timeout = False

                if not self.streaming_text: self.vosk_partial_count = 0
                
                # If we're streaming audio, tell frontend to stop immediately
                if self.streaming_text:
                    self.vosk_partial_count += 1
                    if self.vosk_partial_count >= 2:
                        await self.send(text_data=json.dumps({"type": "stop_audio"}))
                        self.streaming_text = False
                        self.vosk_partial_count = 0
  
                # Cancel any ongoing LLM processing when new speech is detected
                if self.tts_llm_task and not self.tts_llm_task.done():
                    self.tts_llm_task.cancel()

                # Cancel any ongoing TTS streaming when new speech is detected
                if self.tts_stream_task and not self.tts_stream_task.done():
                    self.tts_stream_task.cancel()
                
                self.vosk_stt_recognizer.Reset()  # Clear the recognizer's internal state

    async def _process_tts_llm(self) -> None:
        try:
            self.bondi_llm_triggered = True
            call_duration = time.time() - self.start_call_time

            logger.info(f"Entered TTS LLM Processing")
            logger.info(f"Call Duration: {call_duration}")
            logger.info(f"Agent Last Response: {self.agent_last_response}")
            logger.info(f"Current User Input: {self.current_user_input}")

            llm_tts_system_context = f"""You are Bondi, a fun, casual AI podcast co-host for Bondiver. 
                You're in the middle of a 1-minute BondCast voice conversation with a user named {self.firstname}. 
                If the call duration is nearing 1 minute, you should wrap up the convo and prepare your last message,
                Your job is to keep the convo light, entertaining, and podcast-like. 
                Speak naturally, as if you're chatting in a voice memo.

                Here's the conversation history so far:
                {self.conversation_history}

                Respond to {self.firstname} in a warm and expressive voice line. 
                Make sure to include a fun entertaining thoughtful
                follow-up question that would be entertaining for a podcast at the end of your response 
                unless you're ending the call.

                If {self.firstname} seems like they want to stop talking or if 
                the call is nearing 1 minute, that is also a signal to end the call.

                Return a JSON object with:
                - bondi_response: your message
                - end_call: true if this is the final message of the BondCast, false otherwise
            """

            llm_tts_input = f"""{self.firstname} just said: {self.current_user_input}
                Your last message was: {self.agent_last_response}

                Call duration so far: {time.time() - self.start_call_time:.2f} seconds

                Decide whether to keep the convo going or wrap it up based on tone and time. 
                Keep it entertaining, interesting, casual, and voice-message styled.

                Return a JSON object with:
                - bondi_response: your message
                - end_call: true if this is the final message of the BondCast, false otherwise
            """

            class BondiResponse(BaseModel):
                bondi_response: str
                end_call: bool

            # Get groq response with proper exception handling
            try:
                response = groq_instructor_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",  
                    response_model=BondiResponse,
                    messages=[
                        {"role": "system", "content": llm_tts_system_context},
                        {"role": "user", "content": llm_tts_input}
                    ],
                    stream=False,  
                    temperature=0.9,
                    max_completion_tokens=300,
                )
                
                # Extract the structured response content
                llm_response = response.bondi_response
                end_call = response.end_call

                logger.info(f"Bondi Response: {llm_response}")
                logger.info(f"End Call Boolean: {end_call}")

            except Exception as e:
                logger.error(f"Error calling Groq API: {str(e)}")
                logger.error(f"Error type: {type(e).__name__}")
                logger.error(f"Full error details: {repr(e)}")
                
                # Fallback response
                llm_response = "I'm having trouble processing that right now."
                end_call = True

            if self.transcribing_text:
                self.bondi_llm_triggered = False
                # logger.info(f"Bondi Silence: LLM TTS Response Getting Rejected bc transcribing_text is True")
                return

            elif end_call:
                logger.info(f"Last Response: {llm_response}")
                self.call_is_ending = True  # Set this before streaming to prevent race conditions
                self.streaming_text = True
                await self._stream_tts(llm_response)
                # Wait for streaming to complete before closing
                while self.streaming_text:
                    await asyncio.sleep(0.1)
                await self.close(code=1000)  # Normal closure
                return
            else:
                logger.info(f"LLM TTS Response Getting Accepted with following response: {llm_response}")
                self.tts_stream_task = asyncio.create_task(self._stream_tts(llm_response))

        except asyncio.CancelledError:
            self.bondi_llm_triggered = False
            # logger.info("TTS LLM processing was cancelled mid-flight")
            return
        

    async def _stream_tts(self, tts_text):
        try:
            self.incoming_tts = tts_text
            # logger.info(f"Entered TTS streaming mode")

            def stream_chunks_sync():
                return list(elevenlabs.text_to_speech.stream(
                    text=tts_text,
                    voice_id=os.getenv('ELEVENLABS_VOICE_ID'),
                    model_id="eleven_flash_v2",
                    output_format="pcm_16000"
                ))
            
            # zGjIP4SZlMnY9m93k97r (Another Voice Id to try out)

            audio_chunks = await asyncio.get_event_loop().run_in_executor(executor, stream_chunks_sync)

            for chunk in audio_chunks:
                await self.send(bytes_data=chunk)

            self.last_baseline_audio_time = time.time()
            # logger.info("ElevenLabs Speech Ended; Last Audio Set!")

        except asyncio.CancelledError:
            self.bondi_llm_triggered = False
            # logger.info("TTS streaming was cancelled mid-flight")
            # Tell frontend to stop playing audio and recording
            await self.send(text_data=json.dumps({"type": "stop_audio"}))
            self.streaming_text = False
            return


    async def disconnect(self, code):
        # Ensure recording is stopped when disconnecting (only in general mode)
        if self.variant == "default":
            try:
                await self.send(text_data=json.dumps({"type": "stop_recording"}))
            except:
                pass  # Connection might already be closed
        
        await self._flush()
        if self.silence_task and not self.silence_task.done():
            self.silence_task.cancel()
        if self.tts_llm_task and not self.tts_llm_task.done():
            self.tts_llm_task.cancel()

        if self.tts_stream_task and not self.tts_stream_task.done():
            self.tts_stream_task.cancel()

        if self.assembly_stt:
            self.assembly_stt.stop()

        logger.info("WS closed")

    async def _flush(self):
        if self.buf:
            self.assembly_stt.send_audio(bytes(self.buf))
            self.buf.clear()