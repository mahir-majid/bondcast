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
from .assembly_stt import AssemblySTT

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
SILENCE_THRESHOLD = 0.7  # seconds of silence before processing
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
        # logger.info(f"Connected user {self.firstname} with llmMode: {self.llmMode}")

        self.start_call_time = time.time()
        self.last_baseline_audio_time = time.time()
        self.buf = bytearray()
        self.conversation_history = ""
        self.current_user_input = ""
        self.agent_last_response = ""
        self.incoming_tts = ""
        self.streaming_text = False
        self.transcribing_text = False
        self.call_is_ending = False
        self.passed_first_timeout = False
        self.passed_second_timeout = False
        self.bondi_llm_triggered = False
        self.user_age = (date.today().year - user.dob.year) - ((date.today().month, date.today().day) < (user.dob.month, user.dob.day))

        # Initialize Vosk recognizer for partial transcription
        self.vosk_stt_recognizer = KaldiRecognizer(vosk_stt_model, 16000)

        # Initialize AssemblyAI STT
        self.assembly_stt = AssemblySTT(self._transcribe)
        self.assembly_stt.start()

        # Start background tasks
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
        
        # logger.info(f"WS connected for user: {self.firstname}")

    @database_sync_to_async
    def get_user_by_username(self, username):
        try:
            return User.objects.get(username=username)
        except User.DoesNotExist:
            return None

    def _transcribe(self, transcript):
        """Callback for handling transcripts from AssemblyAI"""
        if transcript == "__START_TRANSCRIPTION__":
            logger.info(f"ASSEMBLY TRIGGERED TRANSCRIPTION")
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

            logger.info(f"TRANSCRIPTION: {transcript}")
            self.transcribing_text = False
            self.streaming_text = False
            self.last_baseline_audio_time = time.time()

    async def _check_silence_loop(self):
        while True:
            if self.streaming_text or self.transcribing_text:
                await asyncio.sleep(0.1)
                logger.info(f"Transcribing Text: {self.transcribing_text}")
                continue
            logger.info(f"Transcribing Text: {self.transcribing_text}")
            current_time = time.time()
            user_audio_delay = current_time - self.last_baseline_audio_time
            total_call_time = time.time() - self.start_call_time

            if total_call_time > MAX_CALL_DURATION_TIME and not self.streaming_text and not self.transcribing_text: 
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
            if not self.bondi_llm_triggered and self.llmMode == "user_called" and user_audio_delay >= SILENCE_THRESHOLD and self.current_user_input and not self.streaming_text and not self.transcribing_text:
                self.bondi_llm_triggered = True
                self.tts_llm_task = asyncio.create_task(self._process_tts_llm(user_audio_delay))

            # First timeout check
            if not self.passed_first_timeout and not self.call_is_ending and user_audio_delay >= FIRST_TIMEOUT and not self.current_user_input:
                logger.info("first timeout request made")
                first_timeout_response = "Can you still hear me?"
                self.passed_first_timeout = True
                await self._stream_tts(first_timeout_response)
                # Wait for streaming to complete before continuing
                while self.streaming_text:
                    await asyncio.sleep(0.1)
                continue  # Skip to next iteration to recheck conditions

            # Second timeout check
            if self.passed_first_timeout and not self.passed_second_timeout and not self.call_is_ending and user_audio_delay >= SECOND_TIMEOUT and not self.current_user_input:
                logger.info("second timeout request made")
                second_timeout_response = "Hello? Are you still there?"
                self.passed_second_timeout = True
                await self._stream_tts(second_timeout_response)
                # Wait for streaming to complete before continuing
                while self.streaming_text:
                    await asyncio.sleep(0.1)
                continue  # Skip to next iteration to recheck conditions

            # Final timeout check
            if self.passed_first_timeout and self.passed_second_timeout and not self.call_is_ending and user_audio_delay >= STREAM_TIMEOUT and not self.current_user_input:
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
                    if self.conversation_history: self.conversation_history += self.firstname + f": \"{self.current_user_input}\" "
                    self.current_user_input = ""
                    self.agent_last_response = self.incoming_tts
                    self.conversation_history += "Bondi: " + f"\"{self.agent_last_response}\" "
                    self.buf.clear()  # Just clear the buffer, no need to send to AssemblyAI
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

        # Add new audio data to buffer
        self.buf.extend(bytes_data)

        # Send chunks for transcription once we have enough data
        if not self.streaming_text and len(self.buf) >= CHUNK_SAMPLES:
            chunk = self.buf[:CHUNK_SAMPLES]
            del self.buf[:CHUNK_SAMPLES]

            # Send to AssemblyAI for real transcription
            self.assembly_stt.send_audio(bytes(chunk))
            
            # Process with Vosk for partial transcription
            self.vosk_stt_recognizer.AcceptWaveform(bytes(chunk))
            partial_result = json.loads(self.vosk_stt_recognizer.PartialResult())
            if partial_result.get("partial"):
                logger.info(f"Vosk Partial Triggered!")
                self.last_baseline_audio_time = time.time()
                self.justCalled = False
                self.passed_first_timeout = False
                self.passed_second_timeout = False
                
                # Cancel any ongoing LLM processing when new speech is detected
                if self.tts_llm_task and not self.tts_llm_task.done():
                    self.tts_llm_task.cancel()

                # Cancel any ongoing TTS streaming when new speech is detected
                if self.tts_stream_task and not self.tts_stream_task.done():
                    self.tts_stream_task.cancel()
                
                self.vosk_stt_recognizer.Reset()  # Clear the recognizer's internal state

    async def _process_tts_llm(self, silence_time: float) -> None:
        try:
            self.bondi_llm_triggered = True
            llm_tts_system_context = ""
            llm_tts_input = ""

            if silence_time > 3:
                # logger.info("LLM Response to User Silence Delay or Incomplete Response")
                llm_tts_system_context = (
                f"Your name is Bondi, and you are a real-time conversational voice agent talking to {self.firstname} who is {self.user_age} years old. "
                f"Your job is to decide what to say in response to {self.firstname}, based on the last thing you said and what {self.firstname} just said in return. "

                f"{self.firstname} has been silent for quite a while—over 3 seconds—which strongly suggests {self.firstname} is either finished or unsure how to continue. "

                f"Even if {self.firstname}'s sentence sounds incomplete, now is a good moment to respond. "
                f"It's okay to step in with enthusiasm to help {self.firstname} continue and clarify their thoughts. "

                "Write a short, emotionally present reply in 1 or 2 casual, kind sentences. "
                f"Help {self.firstname} complete their thought or ask a relevant, open-ended follow-up question. "

                f"Your tone should be chill, friendly, and non-intrusive. Be careful not to talk about yourself, and don't just repeat what {self.firstname} said. "
                "Be helpful, curious, and human-like. "

                f"Here is the full conversational history: {self.conversation_history.strip()} "
                )

                llm_tts_input = (
                    f"{self.firstname} just said: \"{self.current_user_input}\" "
                    f"The last thing you (Bondi) said was: \"{self.agent_last_response}\" "

                    f"Even if the {self.firstname}'s message sounds incomplete, the long pause suggests {self.firstname} is done for now or could use a gentle nudge. "
                    "Respond with warmth and care—briefly and naturally—as if continuing a casual voice conversation ending your response with a question. "
                    "Do not explain anything. Just say the reply. Nothing else."
                )
                
            else:
                llm_tts_system_context = (
                    f"Your name is Bondi, and you are a real-time conversational voice agent talking to {self.firstname}, who is {self.user_age} years old. "
                    f"Your job is to reply to {self.firstname} based on the last thing you said and what {self.firstname} just said. "
                    f"Talk very casually and be entertaining. "

                    f"If {self.firstname} still seems to be in the middle of a thought—if their message is vague, trails off, or sounds incomplete—then respond only with the word: silence. "
                    "Do not explain or add anything. Just say: \"shush\". This allows the conversation to breathe. "

                    f"But if {self.firstname} clearly finishes a thought, respond in a way that shows you're *deeply listening*. "
                    f"Focus on being engaging. Ask something that builds on what they just said. Bring up something specific, surprising, or thought-provoking. "

                    "- Always speak in 1 or 2 short, natural-sounding sentences.\n"
                    "- Always end with a specific, open-ended follow-up question tied directly to what they just said.\n"
                    "- Never talk about yourself, your abilities, or explain what you're doing.\n"
                    "- Be witty and playful, but still be engaging and interesting."

                    f"Here's the full conversation so far:\n{self.conversation_history.strip()}"
                )

                llm_tts_input = (
                    f"{self.firstname} just said: \"{self.current_user_input}\" with {silence_time} milliseconds of silence " 
                    f"The last thing you (Bondi) said was: \"{self.agent_last_response}\" "

                    "Decide whether the user's message is complete. "
                    "- If it sounds like they're still mid-thought—hesitating, rambling, or cutting off—respond only with the text: \"shush\" "
                    "- But if they've finished a full thought, reply warmly and casually with 1–2 sentences that reflect what they said and ask a thoughtful follow-up question. "
                    "Make it feel like a real back-and-forth between friends. "
                    "Do not explain anything. If you respond, say only the reply. Nothing else."
                )

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

            if "shush" in llm_response.lower():
                self.bondi_llm_triggered = False
                logger.info(f"Bondi Silence: LLM TTS Response Getting Rejected bc not apropriate to respond right now with following response: {llm_response}")
                return
            elif self.transcribing_text:
                logger.info(f"Bondi Silence: LLM TTS Response Getting Rejected bc transcribing_text is True")
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

        if self.assembly_stt:
            self.assembly_stt.stop()

        logger.info("WS closed")

    async def _flush(self):
        if self.buf:
            self.assembly_stt.send_audio(bytes(self.buf))
            self.buf.clear()