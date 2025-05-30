import json, asyncio, logging
from channels.generic.websocket import AsyncWebsocketConsumer
import time
from vosk import Model, KaldiRecognizer
from django.contrib.auth import get_user_model
from channels.db import database_sync_to_async
from groq import Groq
from dotenv import load_dotenv
import os
from pathlib import Path
from elevenlabs import stream
from elevenlabs.client import ElevenLabs


# Load environment variables
env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(env_path)

# Configure logging
logger = logging.getLogger(__name__)

CHUNK_SAMPLES = 16000 // 2  
SILENCE_THRESHOLD = 1.2  # seconds of silence before processing
STREAM_TIMEOUT = 7  # seconds of silence before ending stream
FIRST_TIMEOUT = 3
SECOND_TIMEOUT = 5

# Initialize Vosk model
model_path = "convos/vosk-model-en-us-0.15"  # Path relative to backend directory
stt_model = Model(model_path)
stt_recognizer = KaldiRecognizer(stt_model, 16000)
stt_recognizer.SetWords(True)

# Initialize ElevenLabs client
api_key = os.getenv('ELEVENLABS_API_KEY')
if not api_key:
    raise ValueError("ELEVENLABS_API_KEY environment variable not set")
elevenlabs = ElevenLabs(api_key=api_key)

 # Initialize Groq client with API key from .env
groq_client = Groq(api_key=os.getenv('GROQ_API_KEY'))

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
            
        self.user_id = user.id
        self.firstname = user.firstname
        logger.info(f"Connected user {self.firstname} with llmMode: {self.llmMode}")
        
        self.buf = bytearray()
        self.last_user_audio_time = time.time()
        self.current_text = ""
        self.overall_text = ""
        self.silence_task = None
        self.streaming_text = False
        self.call_is_ending = False
        self.passed_first_timeout = False
        self.passed_second_timeout = False
        
        # Initialize Vosk recognizer
        self.recognizer = KaldiRecognizer(stt_model, 16000)
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
            self.silence_task = asyncio.create_task(self._check_silence())

    async def _check_silence(self):
        while True:
            await asyncio.sleep(0.1)  # Check every 100ms
            current_time = time.time()
            time_since_last_user_audio = current_time - self.last_user_audio_time

            # Check if user just joined call and hasn't said anything
            if self.llmMode == "user_called" and self.justCalled and time_since_last_user_audio > 1:
                self.justCalled = False
                llm_input = f"Give a response like, Hey there {self.firstname} How are you doing?"
                llm_system_context = f"{self.firstname} just called you. Give them a friendly casual brief greeting."
                await self._process_with_llm(llm_input, llm_system_context)
                break  # Exit the silence checker
 
            # Normal silence threshold check
            if self.llmMode == "user_called" and time_since_last_user_audio >= SILENCE_THRESHOLD and self.current_text:
                logger.info(f"Silence threshold reached. Processing text: {self.current_text}")
                reference = f"For reference, here's entire conversation history: {self.overall_text}" if self.overall_text else ""
                llm_input = f"{self.firstname} most recently said: \"{self.current_text}\" {reference}"          
                llm_system_context = f"You are imitating one of {self.firstname}'s friends. Give them normal relaxing responses and continue driving the conversation with questions about their day and what's been going on recently, but don't be overly nice and cringe. keep responses 1 to 2 sentences max unless you have good reason not to. Also don't talk about yourself at all unless {self.firstname} specifically asks about you. Reference relevant current events to liven up the conversation."
                self.overall_text += self.firstname + f": \"{self.current_text}\" "
                await self._process_with_llm(llm_input, llm_system_context)
                self.current_text = ""
                break  # Exit the silence checker

            # if not self.passed_first_timeout and not self.call_is_ending and time_since_last_user_audio >= FIRST_TIMEOUT:
            #     first_timeout_response = "Can you still hear me?"
            #     print(f"LLM* Response: {first_timeout_response}")
            #     self.passed_first_timeout = True
            #     # await self._stream_tts(first_timeout_response)
            #     break  # Exit the silence checker

            # if self.passed_first_timeout and not self.passed_second_timeout and not self.call_is_ending and time_since_last_user_audio >= SECOND_TIMEOUT:
            #     second_timeout_response = "Hello? Are you still there?"
            #     print(f"LLM* Response: {second_timeout_response}")
            #     self.passed_second_timeout = True
            #     # await self._stream_tts(second_timeout_response)
            #     break  # Exit the silence checker

            # # Streaming timeout check: User hasn't spoken in so long
            # if self.passed_first_timeout and self.passed_second_timeout and not self.call_is_ending and time_since_last_user_audio >= STREAM_TIMEOUT:
            #     timeout_response = "Let's talk later. Goodbye."
            #     print(f"LLM* Response: {timeout_response}")
            #     # await self._stream_tts(timeout_response)
            #     # self.streaming_text = True

            #     # while self.streaming_text:
            #     #     await asyncio.sleep(0.05)

            #     await self.close(code=1000)  # Normal closure
            #     break  # Exit the silence checker

    async def _transcribe(self, pcm_bytes: bytes):
        # Convert bytearray to bytes and ensure it's in the correct format
        audio_data = bytes(pcm_bytes)
        text = ""

        if not self.streaming_text:
            if stt_recognizer.AcceptWaveform(audio_data):
                result = json.loads(stt_recognizer.Result())
                text = result.get("text", "")
                # Reset the silence timer when we hear user
                if text:
                    # print(f"Time updated bc of complete text processing!")
                    self.justCalled = False
                    self.passed_first_timeout = False
                    self.passed_second_timeout = False
                    self.last_user_audio_time = time.time()
            else:
                partial_result = json.loads(stt_recognizer.PartialResult())
                partial_text = partial_result.get("partial", "")
                # Reset the silence timer when we hear user
                if partial_text: 
                    # print(f"Time updated bc of partial text processing!")
                    self.justCalled = False
                    self.passed_first_timeout = False
                    self.passed_second_timeout = False
                    self.last_user_audio_time = time.time()

        # Only process complete text from Vosk
        if not text.strip():
            return

        # Accumulate text for processing after silence
        self.current_text += text
        
        # Send transcription to backend logs
        print(f"transcription: {text}")

    async def _process_with_llm(self, llm_input: str, llm_system_context: str) -> str:
        self.last_user_audio_time = time.time()
        # print(f"LLM Input: {llm_input} and LLM System Context: {llm_system_context}")
    
        # Get groq response
        groq_response = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",  
            messages=[
                {"role": "system", "content": llm_system_context},
                {"role": "user", "content": llm_input}
            ],
            stream=False,  
            temperature=0.7,
            max_tokens=75
        )

        # Extract the full response content
        llm_response = groq_response.choices[0].message.content.strip()
                
        self.last_user_audio_time = time.time()
        self.overall_text += "AI: " + f"\"{llm_response}\" "
        print(f"LLM response: {llm_response}")
        # await self._stream_tts(llm_response)


    async def _stream_tts(self, tts_text):
        # Stream response to ElevenLabs
        try:
            # Get audio stream and send to frontend
            self.streaming_text = True
            audio_stream = elevenlabs.text_to_speech.stream(
                text=tts_text,
                voice_id="JBFqnCBsd6RMkjVDRZzb",
                model_id="eleven_flash_v2",
                output_format="pcm_16000"
            )
            
            # Stream audio chunks to frontend
            chunk_count = 0
            total_bytes = 0
            for chunk in audio_stream:
                if isinstance(chunk, bytes):
                    self.last_user_audio_time = time.time()
                    chunk_size = len(chunk)
                    total_bytes += chunk_size
                    chunk_count += 1
                    # logger.info(f"Chunk {chunk_count}: size={chunk_size} bytes")
                    await self.send(bytes_data=chunk)
            
            self.streaming_text = False
            # logger.info(f"Total chunks: {chunk_count}, Total bytes: {total_bytes}")

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
