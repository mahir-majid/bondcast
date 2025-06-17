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
import datetime
from datetime import date
from .assembly_stt import AssemblySTT
from django.core.cache import cache

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
SILENCE_THRESHOLD = 0.3  # seconds of silence before processing
STREAM_TIMEOUT = 5  # seconds of silence before ending stream
FIRST_TIMEOUT = 5
SECOND_TIMEOUT = 5
MAX_CALL_DURATION_TIME = 180


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
        self.ready_for_streaming = False  # Add this flag
        
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
        self.streaming_text = True
        self.transcribing_text = False
        self.call_is_ending = False
        self.passed_first_timeout = False
        self.passed_second_timeout = False
        self.bondi_llm_triggered = False
        self.user_age = (date.today().year - user.dob.year) - ((date.today().month, date.today().day) < (user.dob.month, user.dob.day))

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
        cache_key = f'user_{self.user_id}_greeting'
        context_key = f'user_{self.user_id}_context'
        self.bondi_greeting = cache.get(cache_key) or "Hello, how are you doing today?"
        self.conversation_context = cache.get(context_key) or ""

        logger.info(f"Contextual History: {self.conversation_context}")

        # Don't start greeting immediately - wait for ready signal
        self.bondi_llm_triggered = True

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
            if not self.bondi_llm_triggered and self.llmMode == "user_called" and user_audio_delay >= SILENCE_THRESHOLD and self.current_user_input and not self.transcribing_text:
                self.bondi_llm_triggered = True
                self.tts_llm_task = asyncio.create_task(self._process_tts_llm("normal"))

            # First timeout check
            if not self.streaming_text and not self.bondi_llm_triggered and not self.passed_first_timeout and not self.call_is_ending and user_audio_delay >= FIRST_TIMEOUT and not self.current_user_input:
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
                if data.get("type") == "ready_for_streaming":
                    self.ready_for_streaming = True
                    # Now start the greeting
                    await self._stream_tts(self.bondi_greeting)
                elif data.get("type") == "audio_started":
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
                    # Close connection if this was the final timeout message
                    if self.call_is_ending:
                        await self.close(code=1000)  # Normal closure
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
        if len(self.buf) >= CHUNK_SAMPLES:
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

    async def _process_tts_llm(self, response_type: str) -> None:
        try:
            self.bondi_llm_triggered = True
            call_duration = time.time() - self.start_call_time
            llm_tts_system_context = ""
            llm_tts_input = ""

            logger.info(f"Entered TTS LLM Processing")

            if response_type == "normal" and call_duration < 90:
                llm_tts_system_context = (
                    f"Your name is Bondi, and you are on a brief call with {self.firstname}, who is {self.user_age} years old. "
                    f"Your goal is to end the call as soon as possible but before you do so, you need to have a simple conversation with {self.firstname}."
                    f"starting with phase 1. asking what {self.firstname} is up to right now, phase 2. asking {self.firstname} about how their day has been "
                    f"and for any life updates, phase 3. transition to asking asking about their plans for the rest of the DAY. After going through all 3 phases, "
                    f"it is VERY IMPORTANT that you start transitioning to the final phase 4: remarks that signal the end of the call and preparing to "
                    f"say goodbye to {self.firstname} with the the goal of reaching your final response that you include an asterick at the end to signal the end "
                    f"of the call. Also, note that the user might intentionally want to end the call early and if the user shows any sign of wanting to end "
                    f"the call early, do not ask them any more questions and just immediately transition to ending call."
                    f"IMPORTANT: Once you have finished your last remark to the user such as \"Goodbye\" or \"See you later\", "
                    f"end your response with an asterick: * to signal that the call is over"
                    f"Keep the conversation moving and don't get too deep into any specific topic. "
                    f"Don't make any assumptions about {self.firstname}'s day unless you know with 100% certainty and only use information based on the conversation."
                    f"You have limited time to get life updates from {self.firstname}, so be brief and to the point. "
                    f"Be casual, drive the conversation with engaging questions, and speak very simply like a human would during a phone call. "
                    f"If {self.firstname} has interesting information to share, ask them more about it but only at a surface level like a casual friend would. "
                    f"Remember to not get too deep into any specific topic in the conversation and be brief, and fluid in switching topics. "
                    f"Now, your job is to reply to {self.firstname} based on the last thing you (Bondi) said and what {self.firstname} just said. "
                    "Don't bring up details that you don't know for a hundred percent certainty."
                    "- Always speak in 1 or 2 short, natural-sounding sentences.\n"
                    "- Always end with a specific, open-ended follow-up question tied directly to what they just said unless the call is ending.\n"
                    "- IMPORTANT:Never repeat the user's words or talk about yourself.\n"
                    "- Be witty and playful, but still be engaging and interesting."
                    "- Never say \"Haha\" in your answers"

                    f"Here's the full conversation so far:\n{self.conversation_history.strip()}"
                    f"Here's contextual history about {self.firstname}: {self.conversation_context}"
                )

                llm_tts_input = (
                    f"{self.firstname} just said: \"{self.current_user_input}\" " 
                    f"The last thing you (Bondi) said was: \"{self.agent_last_response}\" "
                    f"IMPORTANT:If user's response feels vague, respond briefly and then switch conversation topic."
                    f"Say only the reply. Nothing else."
                    f"Be extremely sensitive to any intention of {self.firstname} trying to end the call early or saying that they have to go or something similar, "
                    f"and immediately transition to ending call phase."                    f"If the user shows any sign of wanting to end the call early, do not ask them any more questions and just immediately transition to ending call."
                    "At your lasting remark such as \"Goodbye\" or \"See you later\", end your response with an asterick: * to signal that the call is over"
                )
            else:
                llm_tts_system_context = (
                    f"Your name is Bondi, and you are on a brief call with {self.firstname}, who is {self.user_age} years old. "
                    f"The call has been going on for {call_duration} seconds and it is now a good time to transition to ending call."
                    f"Your goal is to end the call as soon as possible but in a natural human conversation manner."
                    f"It is VERY IMPORTANT that you start transitioning to remarks that signal the end of the call "
                    f"with the the goal of reaching your final response that you include an asterick at the end to signal the end of the call."
                    f"IMPORTANT: Once you have finished your last remark to the user such as \"Goodbye\" or \"See you later\", "
                    f"end your response with an asterick: * to signal that the call is over"

                    f"Here's the full conversation so far:\n{self.conversation_history.strip()}"
                    f"Here's contextual history about {self.firstname}: {self.conversation_context}"
                )

                llm_tts_input = (
                    f"{self.firstname} just said: \"{self.current_user_input}\" " 
                    f"The last thing you (Bondi) said was: \"{self.agent_last_response}\" "
                    f"Say only the reply. Nothing else."
                    f"Start naturally transitioning to ending call phase."
                    f"Be extremely sensitive to any intention of {self.firstname} trying to end the call early or saying that they have to go or something similar, "
                    f"and immediately transition to ending call phase."
                    f"If the user shows any sign of wanting to end the call early, do not ask them any more questions and just immediately transition to ending call."
                    f"If the user says something like \"I have to go\" or \"I have to go now\" or \"I have to get going\" or something similar, "
                    f"immediately transition to ending call phase."
                    "At your lasting remark such as \"Goodbye\" or \"See you later\", end your response with an asterick: * to signal that the call is over"
                )


            # Get groq response
            groq_response = await groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",  
                messages=[
                    {"role": "system", "content": llm_tts_system_context},
                    {"role": "user", "content": llm_tts_input}
                ],
                stream=False,  
                temperature=0.9,
                max_completion_tokens=150,
            )
            # Extract the full response content
            llm_response = groq_response.choices[0].message.content.strip()

            if self.transcribing_text:
                self.bondi_llm_triggered = False
                logger.info(f"Bondi Silence: LLM TTS Response Getting Rejected bc transcribing_text is True")
                return
            elif "*" in llm_response:
                logger.info(f"LLM TTS Convo ending with following response: {llm_response}")
                logger.info(f"Call Duration Time: {time.time() - self.start_call_time}")
                self.call_is_ending = True
                self.streaming_text = True
                await self._stream_tts(llm_response)
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