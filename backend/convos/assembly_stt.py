import websocket
import json
import threading
import time
from urllib.parse import urlencode
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(env_path)

class AssemblySTT:
    def __init__(self, on_transcript_callback):
        self.api_key = os.getenv('ASSEMBLY_STT_KEY')
        if not self.api_key:
            raise ValueError("ASSEMBLY_STT_KEY environment variable not set")

        self.connection_params = {
            "sample_rate": 16000,
            "format_turns": True,
        }
        self.api_endpoint = f"wss://streaming.assemblyai.com/v3/ws?{urlencode(self.connection_params)}"
        
        self.ws_app = None
        self.audio_thread = None
        self.stop_event = threading.Event()
        self.on_transcript_callback = on_transcript_callback
        self.current_transcript = ""
        self.last_formatted_transcript = ""
        self.is_building_transcript = False

    def on_message(self, ws, message):
        try:
            data = json.loads(message)
            msg_type = data.get('type')

            if msg_type == "Turn":
                transcript = data.get('transcript', '')
                formatted = data.get('turn_is_formatted', False)

                if formatted:
                    self.last_formatted_transcript = transcript
                    if transcript != self.current_transcript:
                        self.current_transcript = transcript
                        self.is_building_transcript = False
                        self.on_transcript_callback(transcript)
                else:
                    if not self.is_building_transcript:
                        self.is_building_transcript = True
                        self.on_transcript_callback("__START_TRANSCRIPTION__")
                    self.current_transcript = transcript

        except json.JSONDecodeError as e:
            print(f"Error decoding message: {e}")
        except Exception as e:
            print(f"Error handling message: {e}")

    def on_error(self, ws, error):
        print(f"WebSocket Error: {error}")
        self.stop_event.set()

    def on_close(self, ws, close_status_code, close_msg):
        print(f"WebSocket Disconnected: Status={close_status_code}, Msg={close_msg}")
        self.stop_event.set()

    def on_open(self, ws):
        print("WebSocket connection opened.")
        print(f"Connected to: {self.api_endpoint}")

        def stream_audio():
            print("Starting audio streaming...")
            while not self.stop_event.is_set():
                try:
                    # The audio data will be sent from the consumer
                    time.sleep(0.01)  # Small sleep to prevent CPU overuse
                except Exception as e:
                    print(f"Error in audio streaming: {e}")
                    break
            print("Audio streaming stopped.")

        self.audio_thread = threading.Thread(target=stream_audio)
        self.audio_thread.daemon = True
        self.audio_thread.start()

    def start(self):
        self.ws_app = websocket.WebSocketApp(
            self.api_endpoint,
            header={"Authorization": self.api_key},
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close,
        )

        # Run WebSocketApp in a separate thread
        ws_thread = threading.Thread(target=self.ws_app.run_forever)
        ws_thread.daemon = True
        ws_thread.start()

    def send_audio(self, audio_data):
        if self.ws_app and self.ws_app.sock and self.ws_app.sock.connected:
            try:
                self.ws_app.send(audio_data, websocket.ABNF.OPCODE_BINARY)
            except Exception as e:
                print(f"Error sending audio data: {e}")

    def stop(self):
        self.stop_event.set()
        if self.ws_app:
            try:
                terminate_message = {"type": "Terminate"}
                self.ws_app.send(json.dumps(terminate_message))
                time.sleep(1)  # Give a moment for messages to process
            except Exception as e:
                print(f"Error sending termination message: {e}")
            finally:
                self.ws_app.close()
