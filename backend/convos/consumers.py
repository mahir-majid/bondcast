import json, asyncio, logging
from channels.generic.websocket import AsyncWebsocketConsumer
import time
from vosk import Model, KaldiRecognizer
from django.contrib.auth import get_user_model
from channels.db import database_sync_to_async

# Configure logging
logger = logging.getLogger(__name__)

CHUNK_SAMPLES = 16000 // 4  
SILENCE_THRESHOLD = 1.2  # seconds of silence before processing
STREAM_TIMEOUT = 10  # seconds of silence before ending stream

# Initialize Vosk model
model_path = "convos/vosk-model-small-en-us-0.15"  # Path relative to backend directory
model = Model(model_path)

User = get_user_model()

class SpeechConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Get username from URL
        self.username = self.scope['url_route']['kwargs']['username']
        
        # Get user from database
        user = await self.get_user_by_username(self.username)
        if not user:
            logger.warning(f"User not found: {self.username}")
            await self.close(code=4001)
            return
            
        self.user_id = user.id
        self.firstname = user.firstname
        logger.info(f"Connected user {self.firstname}")
        
        self.buf = bytearray()
        self.last_user_audio_time = time.time()
        self.processing = False
        self.current_text = ""
        self.overall_text = ""
        self.silence_task = None
        
        # Initialize Vosk recognizer
        self.recognizer = KaldiRecognizer(model, 16000)
        self.recognizer.SetWords(True)
        
        await self.accept()
        logger.info(f"WS connected for user: {self.firstname}")

    @database_sync_to_async
    def get_user_by_username(self, username):
        try:
            return User.objects.get(username=username)
        except User.DoesNotExist:
            return None

    # Process incoming audio chunks from the frontend
    async def receive(self, text_data=None, bytes_data=None):
        if not bytes_data:
            return

        self.buf.extend(bytes_data)

        # Wait until sufficient amount of audio chunks have come in for meaningful processing
        while len(self.buf) >= CHUNK_SAMPLES * 2:
            chunk = self.buf[:CHUNK_SAMPLES * 2]
            del self.buf[:CHUNK_SAMPLES * 2]
            await self._transcribe(chunk)

        # Start silence detection if not already running
        if self.silence_task is None or self.silence_task.done():
            self.processing = True
            self.silence_task = asyncio.create_task(self._check_silence())

    async def _check_silence(self):
        while True:
            await asyncio.sleep(0.1)  # Check every 100ms
            current_time = time.time()
            time_since_last_user_audio = current_time - self.last_user_audio_time

            # Check for stream timeout
            if time_since_last_user_audio >= STREAM_TIMEOUT:
                logger.info("Stream timeout reached - ending session")
                await self._process_with_llm("Nice chatting with you. Talk to you later.")
                # Wait a bit to ensure LLM processing and response are sent
                await asyncio.sleep(1)
                await self.close(code=1000)  # Normal closure
                return  # Exit the silence checker

            # Normal silence threshold check
            if time_since_last_user_audio >= SILENCE_THRESHOLD:
                if self.current_text:
                    logger.info(f"Silence threshold reached. Processing text: {self.current_text}")
                    llm_input = self.firstname + " most recently said: " + f"\"{self.current_text}\"" + " For reference, here's entire conversation history: " + self.overall_text
                    self.overall_text += self.firstname + f": \"{self.current_text}\" "
                    await self._process_with_llm(llm_input)
                    self.current_text = ""
                self.processing = False
                break  # stop the silence checker

    async def _transcribe(self, pcm_bytes: bytes):
        # Convert bytearray to bytes and ensure it's in the correct format
        audio_data = bytes(pcm_bytes)
        text = ""
        
        if self.recognizer.AcceptWaveform(audio_data):
            result = json.loads(self.recognizer.Result())
            text = result.get("text", "")
            # Reset the silence timer when we hear user
            if text:
                # print(f"Time updated bc of complete text processing!")
                self.last_user_audio_time = time.time()

        else:
            partial_result = json.loads(self.recognizer.PartialResult())
            partial_text = partial_result.get("partial", "")
            # Reset the silence timer when we hear user
            if partial_text: 
                # print(f"Time updated bc of partial text processing!")
                self.last_user_audio_time = time.time()

        # Only process complete text from Vosk
        if not text.strip():
            return

        # Accumulate text for processing after silence
        self.current_text += text
        
        # Send transcription to frontend for display
        print(f"transcription: {text}")


    async def _process_with_llm(self, llm_input: str) -> str:
        # TODO: Implement actual LLM processing here
        # For now, return a simple response
        print(f"Entered LLM processing service")
        print(f"LLM Input: {llm_input}")

        # Update with Groq + llm_input
        response = "This is an AI Message"


        self.overall_text += "AI: " + f"\"{response}\" " 
        print(f"LLM response: {response}")

        # Stream response to ElevenLabs


    async def disconnect(self, code):
        await self._flush()
        if self.silence_task and not self.silence_task.done():
            self.silence_task.cancel()
        logger.info("WS closed")

    async def _flush(self):
        if self.buf:
            await self._transcribe(self.buf)
            self.buf.clear()
