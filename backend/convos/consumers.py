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
import functools
from concurrent.futures import ThreadPoolExecutor

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

CHUNK_SAMPLES = 16000 // 4  
SILENCE_THRESHOLD = 0.4  # seconds of silence before processing
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

        
        self.buf = bytearray()
        self.overall_text = ""
        self.last_baseline_audio_time = time.time()
        self.current_text = ""
        self.agent_last_response = ""
        self.incoming_tts = ""
        self.partial_text_cache = ""
        self.partial_last_commited_text = ""
        self.streaming_text = False
        self.call_is_ending = False
        self.passed_first_timeout = False
        self.passed_second_timeout = False
        self.bondi_llm_triggered = False

        # Initialize Vosk recognizer
        self.stt_recognizer = KaldiRecognizer(vosk_stt_model, 16000)
        self.stt_recognizer.SetWords(True)

        # Start background tasks
        self.transcription_task = asyncio.create_task(self._transcription_loop())
        self.silence_task = asyncio.create_task(self._check_silence_loop())
        self.tts_llm_task = None
        self.tts_stream_task = None

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
            if self.streaming_text:
                await asyncio.sleep(0.1)
                continue

            current_time = time.time()
            user_audio_delay = current_time - self.last_baseline_audio_time
 
            # Normal silence threshold check
            if not self.bondi_llm_triggered and self.llmMode == "user_called" and user_audio_delay >= SILENCE_THRESHOLD and self.current_text and not self.streaming_text:
                self.bondi_llm_triggered = True
                self.tts_llm_task = asyncio.create_task(self._process_tts_llm(user_audio_delay))

            # First timeout check
            if not self.passed_first_timeout and not self.call_is_ending and user_audio_delay >= FIRST_TIMEOUT and not self.current_text:
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
                self.call_is_ending = True  # Set this before streaming to prevent race conditions
                self.streaming_text = True
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
                elif data.get("type") == "audio_done":
                    self.streaming_text = False
                    self.bondi_llm_triggered = False
                    self.last_baseline_audio_time = time.time()
                    self.overall_text += self.firstname + f": \"{self.current_text}\" "
                    self.current_text = ""
                    self.agent_last_response = self.incoming_tts
                    self.overall_text += "Bondi: " + f"\"{self.agent_last_response}\" "
                    self.stt_recognizer.Reset()
                    logger.info("Frontend finished playing audio")

                elif data.get("type") == "audio_cleanup":
                    logger.info("Frontend audio cleanup complete")
                    self.streaming_text = False
                    self.bondi_llm_triggered = False
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
                    if self.tts_llm_task and not self.tts_llm_task.done():
                        self.tts_llm_task.cancel()
                        logger.info("Cancelled TTS LLM task due to new user input")

                    # Cancel any ongoing TTS streaming when new speech is detected
                    if self.tts_stream_task and not self.tts_stream_task.done():
                        self.tts_stream_task.cancel()
                        logger.info("Cancelled TTS streaming task due to new user input")

                    self.current_text = partial_text
                    self.partial_last_commited_text = partial_text
                    self.partial_text_cache = ""  
                    self.last_baseline_audio_time = time.time()
                    logger.info(f"transcription: {partial_text}")
                    # logger.info(f"current text: {self.current_text}")
                else:
                    self.partial_text_cache = partial_text


    async def _process_tts_llm(self, silence_time: float) -> None:
        try:
            self.bondi_llm_triggered = True

            llm_tts_system_context = (
                "You are Bondi, a real-time conversational voice agent. Your job is to decide what to say in response to the user, based on the last thing you said and what they just said in return. "
                "If now is NOT a good time to respond—because the user's message is incomplete, vague, or mid-thought—then respond with the keyword: \"Bondi Silence\" "
                "Say only that exact phrase: \"Bondi Silence\" No punctuation, no explanation, no other text. This keyword tells the system to stay quiet. "
                "If it IS a good time to respond—because the user clearly finished a meaningful thought—then only write back the natural conversational repsonse with NO EXPLANATION and ANY OTHER TEXT. "
                "Your reply should be 1 to 2 short, emotionally warm, casual sentences with a relevant follow-up question. "
                "Do not talk about yourself. Do not echo what the user said. Keep it human and light. "
                "You should also be sensitive to the amount of time the user paused after speaking. A pause over 500ms often means they may be done. If the pause is under 400ms, especially if the message is short or vague, it's usually safer to return \"Bondi Silence\". "
                "Remember if you do end up deciding to respond to user, you are not a human, but your voice is comforting and emotionally present. "
                f"Also for your reference, here's entire conversational history: {self.overall_text.strip()} "
                "Lastly, to reiterate, here are examples of when to return \"Bondi Silence\": user's current response ends with anything such as \"I would say\", \"So\", \"well\", \"And then\", or ends with words like \"but\", \"because\", \"like\"—anything that signals the thought is still in progress. "
                "If you're unsure whether the user is done, default to responding with the keyword: \"Bondi Silence\""
            )

            llm_tts_input = (
                f"The user just said: \"{self.current_text}\" with {int(silence_time * 1000)} ms of silence. "
                f"The last thing you (Bondi) said was: \"{self.agent_last_response}\" "
                "Decide whether to respond. If the user's message sounds incomplete or premature, reply with the keyword: \"Bondi Silence\" "
                "If the message is clearly finished, give a short and natural reply."
            )
            
            logger.info(f"Preparing LLM Response")    
            logger.info(f"LLM TTS Input: {llm_tts_input}")

            # Get groq response
            groq_response = await groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",  
                messages=[
                    {"role": "system", "content": llm_tts_system_context},
                    {"role": "user", "content": llm_tts_input}
                ],
                stream=False,  
                temperature=0.7,
                max_completion_tokens=100,
            )
            # Extract the full response content
            llm_response = groq_response.choices[0].message.content.strip()

            if llm_response.lower() == "bondi silence" or llm_response == "\"Bondi Silence\"": 
                self.bondi_llm_triggered = False
                logger.info("Bondi Silence: LLM TTS Response Getting Rejected bc not apropriate to respond right now")
                return
            else:
                logger.info(f"LLM TTS Response Getting Accepted with following response: {llm_response}")
                self.tts_stream_task = asyncio.create_task(self._stream_tts(llm_response))

        except asyncio.CancelledError:
            self.bondi_llm_triggered = False
            logger.info("TTS LLM processing was cancelled mid-flight")
            return
        

    async def _stream_tts(self, tts_text):
        try:
            self.incoming_tts = tts_text
            logger.info(f"Entered TTS streaming mode")

            def stream_chunks_sync():
                return list(elevenlabs.text_to_speech.stream(
                    text=tts_text,
                    voice_id="4NejU5DwQjevnR6mh3mb",
                    model_id="eleven_flash_v2",
                    output_format="pcm_16000"
                ))

            audio_chunks = await asyncio.get_event_loop().run_in_executor(executor, stream_chunks_sync)

            for chunk in audio_chunks:
                await self.send(bytes_data=chunk)

            self.last_baseline_audio_time = time.time()
            logger.info("ElevenLabs Speech Ended; Last Audio Set!")

        except asyncio.CancelledError:
            self.bondi_llm_triggered = False
            logger.info("TTS streaming was cancelled mid-flight")
            # Tel frontend to stop playing audio
            await self.send(text_data=json.dumps({"type": "stop_audio"}))
            self.streaming_text = False
            return


    async def disconnect(self, code):
        await self._flush()
        if self.silence_task and not self.silence_task.done():
            self.silence_task.cancel()
        if self.tts_llm_task and not self.tts_llm_task.done():
            self.tts_llm_task.cancel()

        if self.tts_stream_task and not self.tts_stream_task.done():
            self.tts_stream_task.cancel()

        if self.transcription_task and not self.transcription_task.done():
            self.transcription_task.cancel()

        logger.info("WS closed")

    async def _flush(self):
        if self.buf:
            await self._transcribe(self.buf)
            self.buf.clear()