from faster_whisper import WhisperModel
import numpy as np, json, asyncio, torch, logging
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

device="cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"device: {device}")

model = WhisperModel("tiny", device=device, compute_type="float16" if torch.cuda.is_available() else "int8")

CHUNK_SAMPLES = 16000 * 2        # 2 s at 16 kHz = 32 000 samples ➜ 64 000 bytes

class SpeechConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.buf = bytearray()
        await self.accept()
        logger.info("WS connected")

    async def disconnect(self, code):  # flush tail
        await self._flush()
        logger.info("WS closed")

    async def receive(self, text_data=None, bytes_data=None):
        if not bytes_data:
            return
        
        # logger.info(f"Received bytes: {list(bytes_data[:50])} ...")

        self.buf.extend(bytes_data)

        while len(self.buf) >= CHUNK_SAMPLES * 2:   # bytes → samples
            chunk = self.buf[:CHUNK_SAMPLES * 2]
            del self.buf[:CHUNK_SAMPLES * 2]

            # Convert bytes to numpy int16 array
            samples = np.frombuffer(chunk, dtype=np.int16)
            logger.info(f"Chunk min: {samples.min()}, max: {samples.max()}")

            await self._transcribe(chunk)

    async def _flush(self):
        if self.buf:
            await self._transcribe(self.buf)
            self.buf.clear()

    async def _transcribe(self, pcm_bytes: bytes):
        audio_np = (np.frombuffer(pcm_bytes, np.int16)
                      .astype(np.float32) / 32768.0)
        audio_np = np.asfortranarray(audio_np)      # whisper wants F‑contiguous

        logger.info(f"Audio chunk stats — shape: {audio_np.shape}, min: {audio_np.min()}, max: {audio_np.max()}")

        try:
            segments, _ = await asyncio.to_thread(model.transcribe, audio_np, beam_size=5)
        except Exception as e:
            logger.exception("Transcription error")
            return
        
        if not segments:
            logger.warning("No transcription produced for this chunk")

        text = ""
        for s in segments:
            logger.info(f"[{s.start:.2f}-{s.end:.2f}] {s.text}")
            text += s.text

        if not text: text = "no speech"

        await self.send(text_data=json.dumps({"transcription": text}))
