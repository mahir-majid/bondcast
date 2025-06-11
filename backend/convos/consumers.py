import json, asyncio, logging
from channels.generic.websocket import AsyncWebsocketConsumer
import time
from vosk import Model, KaldiRecognizer
from django.contrib.auth import get_user_model
from channels.db import database_sync_to_async
from groq import AsyncGroq
from dotenv import load_dotenv
import os
from pathlib import Path
from elevenlabs import stream
from elevenlabs.client import ElevenLabs
import random
from concurrent.futures import ThreadPoolExecutor
from datetime import date

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
SILENCE_THRESHOLD = 0.3  # seconds of silence before processing
STREAM_TIMEOUT = 5  # seconds of silence before ending stream
FIRST_TIMEOUT = 5
SECOND_TIMEOUT = 5
MAX_CALL_DURATION_TIME = 120

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

        self.start_call_time = time.time()
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
        self.user_age = (date.today().year - user.dob.year) - ((date.today().month, date.today().day) < (user.dob.month, user.dob.day))

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
            total_call_time = time.time() - self.start_call_time

            if total_call_time > MAX_CALL_DURATION_TIME: 
                self.call_is_ending = True  # Set this before streaming to prevent race conditions
                self.streaming_text = True
                timeout_response = "Sorry but I have to go right now. It was nice chatting and I will talk to you later."
                await self._stream_tts(timeout_response)
                # Wait for streaming to complete before closing
                while self.streaming_text:
                    await asyncio.sleep(0.1)
                await self.close(code=1000)  # Normal closure
                break

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
                        # logger.info("Cancelled TTS LLM task due to new user input")

                    # Cancel any ongoing TTS streaming when new speech is detected
                    if self.tts_stream_task and not self.tts_stream_task.done():
                        self.tts_stream_task.cancel()
                        # logger.info("Cancelled TTS streaming task due to new user input")

                    self.current_text = partial_text
                    self.partial_last_commited_text = partial_text
                    self.partial_text_cache = ""  
                    self.last_baseline_audio_time = time.time()
                    logger.info(f"TRANSCRIPTION: {partial_text}")
                    # logger.info(f"current text: {self.current_text}")
                else:
                    self.partial_text_cache = partial_text


    async def _process_tts_llm(self, silence_time: float) -> None:
        try:
            self.bondi_llm_triggered = True
            llm_tts_system_context = ""
            llm_tts_input = ""

            if silence_time > 3:
                logger.info("LLM Response to User Silence Delay or Incomplete Response")
                llm_tts_system_context = (
                f"Your name is Bondi, and you are a real-time conversational voice agent talking to {self.firstname} who is {self.user_age} years old. "
                f"Your job is to decide what to say in response to {self.firstname}, based on the last thing you said and what {self.firstname} just said in return. "

                f"{self.firstname} has been silent for quite a while—over 3 seconds—which strongly suggests {self.firstname} is either finished or unsure how to continue. "

                f"Even if {self.firstname}'s sentence sounds incomplete, now is a good moment to respond. "
                f"It’s okay to step in with enthusiasm to help {self.firstname} continue and clarify their thoughts. "

                "Write a short, emotionally present reply in 1 or 2 casual, kind sentences. "
                f"Help {self.firstname} complete their thought or ask a relevant, open-ended follow-up question. "

                f"Your tone should be chill, friendly, and non-intrusive. Be careful not to talk about yourself, and don’t just repeat what {self.firstname} said. "
                "Be helpful, curious, and human-like. "

                f"Here is the full conversational history: {self.overall_text.strip()} "
                )

                llm_tts_input = (
                    f"{self.firstname} just said: \"{self.current_text}\" "
                    f"The last thing you (Bondi) said was: \"{self.agent_last_response}\" "

                    f"Even if the {self.firstname}'s message sounds incomplete, the long pause suggests {self.firstname} is done for now or could use a gentle nudge. "
                    "Respond with warmth and care—briefly and naturally—as if continuing a casual voice conversation ending your response with a question. "
                    "Do not explain anything. Just say the reply. Nothing else."
                )
                
            else:
                llm_tts_system_context = (
                f"Your name is Bondi, and you are a real-time conversational voice agent talking to {self.firstname} who is {self.user_age} years old. "
                f"Your job is to decide what to say in response to {self.firstname}, based on the last thing you said and what {self.firstname} just said in return. "

                f"You must be extremely cautious about interrupting {self.firstname}. "
                f"If there is *any* sign that {self.firstname}'s message is vague, partial, mid-thought, or not a complete response — you must return: Bondi Silence. "
                "Say only that exact phrase: Bondi Silence with no punctuation or explanation. "
                f"Do not try to be helpful if {self.firstname} clearly hasn't finished their sentence. "
                f"Short or hanging phrases from {self.firstname} like \"I'm doing\", \"It was\", \"The thing is\", \"I feel like\", or \"I mean\" are all incomplete — they must trigger Bondi Silence. "

                f"If and only if the {self.firstname} clearly finishes a thought, you may respond. When you do: "
                "- Use casual and exciting friendly language. Keep it friendly and low-key, like you're chatting with someone you care about. "
                f"- Behave as a extroverted friend asking casual questions to {self.firstname} instead of a therapist. "
                "- Do not explain anything. If you choose to respond, just say the reply and nothing else. "
                "- Write only 1 to 2 short, natural sentences. "
                "- Always end with a gentle follow-up question. This keeps the conversation open and shows curiosity. "
                f"- Never talk about yourself. Never echo {self.firstname}. Never explain what you're doing. Just respond as if you're present with them. "

                f"Here is the full conversational history: {self.overall_text.strip()} "

                "Examples of messages that are *not* complete and should trigger Bondi Silence:\n"
                "- \"I'm doing\"\n"
                "- \"Because I was\"\n"
                "- \"Well...\"\n"
                "- \"And then I\"\n"
                "- \"The thing is\"\n"
                "- \"I feel like\"\n"
                "- \"It's kind of like\"\n"
                "- Anything ending with a conjunction, filler, or hesitation\n"

                "If you are not sure — always respond with: Bondi Silence"
                )

                llm_tts_input = (
                    f"The user just said: \"{self.current_text}\" "
                    f"The last thing you (Bondi) said was: \"{self.agent_last_response}\" "

                    "Decide if the user has clearly finished speaking. "
                    "- If the message is incomplete or trails off, respond only with: Bondi Silence "
                    "- If it’s a full thought, respond in 1–2 warm, casual sentences that always end with a gentle follow-up question. "
                    "Do not explain anything. If you choose to respond, just say the reply and nothing else."
                )

            logger.info(f"Preparing LLM Response")    
            # logger.info(f"LLM TTS Input: {llm_tts_input}")

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

            if llm_response.lower() == "bondi silence" or llm_response.lower() == "bondi silence." or llm_response.lower() == "\"bondi silence\"": 
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