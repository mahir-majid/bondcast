"use client";

import { useState, useRef } from "react";
import { setupAudioProcessor } from "./audio";
import { useAuth } from "./AuthContext";

interface ChatProps {
  llmMode: string;
  onRecordingComplete?: (url: string) => void;
}

interface Message {
  type: 'transcription' | 'llm_response' | 'error';
  content: string;
  timestamp: number;
}

export default function Chat({ llmMode, onRecordingComplete }: ChatProps) {
  const { user } = useAuth();
  const [isTalking, setIsTalking] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const transcriptionContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const workletNodeTTSRef = useRef<AudioWorkletNode | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTTSNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  /** start / stop mic + websocket */
  const TalkToAI = async () => {
    try {
      if (!user?.username) {
        console.error("No user found");
        return;
      }

      // Get microphone permission
      const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Transcription: Create audio context for transcription (16kHz for Vosk)
      const transcriptionContext = new AudioContext({ sampleRate: 16000 });
      transcriptionContextRef.current = transcriptionContext;
      const transcriptionSource = transcriptionContext.createMediaStreamSource(microphoneStream);

      // Setup audio processor for transcription
      const transcriptionProcessor = await setupAudioProcessor(transcriptionContext);
      
      // Playback: Create audio context for playback (16kHz for ElevenLabs PCM)
      const playbackContext = new AudioContext({ sampleRate: 16000 });
      playbackContextRef.current = playbackContext;
      // Load and initialize the audio worklet (used for ElevenLabs TTS)
      await playbackContext.audioWorklet.addModule('/audio-processor.js');
      const workletNodeTTS = new AudioWorkletNode(playbackContext, 'pcm-processor');
      workletNodeTTSRef.current = workletNodeTTS;
      workletNodeTTS.connect(playbackContext.destination);

      // Recording: Set Up Recording (New Audio Context)
      const recordingContext = new AudioContext({ sampleRate: 44100 });
      const recordingDestination = recordingContext.createMediaStreamDestination();
      // Connect mic to recording
      const recordingMicSource = recordingContext.createMediaStreamSource(microphoneStream);
      recordingMicSource.connect(recordingDestination);
      // Connect ElevenLabs audio to recording
      await recordingContext.audioWorklet.addModule('/recording-processor.js');
      const recordingTTSNode = new AudioWorkletNode(recordingContext, 'recording-processor'); // Using new processor
      recordingTTSNode.connect(recordingDestination);
      recordingTTSNodeRef.current = recordingTTSNode;

      // set up Media Recorder: Start recording
      const recordingCombinedStream = recordingDestination.stream;
      const mediaRecorder = new MediaRecorder(recordingCombinedStream);
      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        // console.log("Recording complete:", url);
        onRecordingComplete?.(url);
      };

      mediaRecorder.start();
      
      // WebSocket connection with username
      const socket = new WebSocket(`${process.env.NEXT_PUBLIC_WEBSOCKET_URL}/ws/speech/${user.username}/${llmMode}/`);
      socket.binaryType = "arraybuffer";

      // Handles initial connection to the websocket
      socket.onopen = () => {
        // console.log("WebSocket connected");
        setIsTalking(true);
        transcriptionSource.connect(transcriptionProcessor);
        transcriptionProcessor.connect(transcriptionContext.destination);
      };

      // Handle audio data from processor and send to backend for transcription
      transcriptionProcessor.port.onmessage = (e) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(e.data);
        }
      };

      // Websocket receiving information from the backend
      socket.onmessage = async (e) => {
        try {
          // Handles ElevenLabs streaming
          if (e.data instanceof ArrayBuffer) {
            // Skip partial chunks
            if (e.data.byteLength % 2 !== 0) {
              // console.log("Skipping partial audio chunk");
              return;
            }

            // Log chunk details
            // console.log(`Received audio chunk: size=${e.data.byteLength} bytes`);
            
            // Create copies of the buffer before any transfers
            const bufferCopy = e.data.slice(0);
            
            // Send the PCM data to the worklet
            if (workletNodeTTSRef.current) {
              workletNodeTTSRef.current.port.postMessage({
                type: 'pcm',
                buffer: e.data
              }, [e.data]);
            }
            // Also send to recording worklet
            if (recordingTTSNodeRef.current) {
              recordingTTSNodeRef.current.port.postMessage({
                type: 'pcm',
                buffer: bufferCopy
              }, [bufferCopy]);
            }
          } else {
            // Handle JSON messages
            const data = JSON.parse(e.data);
            // console.log(`Received from backend: ${JSON.stringify(data)}`);
            if (data.type === 'llm_response') {
              
            } else if (data.type === 'error') {
              console.error('Error from backend:', data.content);
            }
          }
        } catch (error) {
          console.error("Error processing message:", error);
        }
      };

    // (For storing recording) Handle audio playback state events
    workletNodeTTS.port.onmessage = (event) => {
      const { type } = event.data;
      if (type === "audio_started" || type === "audio_done") {
        // console.log(`Audio state: ${type}`);
        if (socket.readyState === WebSocket.OPEN) {
          // Ensure the message is sent as a string
          const message = JSON.stringify({ type });
          // console.log(`Sending to backend: ${message}`);
          socket.send(message);
        }
      }
    };

    recordingTTSNode.port.onmessage = (event) => {
      if (event.data.type === "audio_started" || event.data.type === "audio_done") {
        // Forward state change as needed (optional)
      }
    };  

    // Catching error in websocket stream / Closing stream when 
    // user ends it or stops talking
    socket.onerror = (e) => { console.error("WS error", e); stop(); };
    socket.onclose = () => { 
      // console.log("WS closed"); stop(); 
    };

    // Stop function
    const stop = () => {
        // console.log("Stopping audio and WebSocket");

        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "audio_cleanup" }));
        }

        try {
          transcriptionSource.disconnect();
          transcriptionProcessor.disconnect();
          if (workletNodeTTSRef.current) workletNodeTTSRef.current.disconnect();
          if (recordingTTSNodeRef.current) recordingTTSNodeRef.current.disconnect();
        } catch {}

        microphoneStream.getTracks().forEach(track => track.stop());
        if (transcriptionContext.state !== "closed") transcriptionContext.close();
        if (playbackContext.state !== "closed") playbackContext.close();

        mediaRecorderRef.current?.stop();

        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }

        setIsTalking(false);
      };

        stopRef.current = stop;

      } catch (err) {
        console.error("TalkToAI error:", err);
      }
    };

  // Toggler between starting daily chat and ending it
  const handleClick = () => (isTalking && stopRef.current ? stopRef.current() : TalkToAI());

  return (

    <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
      <button
        onClick={handleClick}
        className="px-6 py-3 cursor-pointer bg-gradient-to-r from-blue-500 to-blue-700 rounded-lg shadow-lg hover:from-blue-600 hover:to-blue-800 active:scale-95 active:shadow-inner transition"
      >
        {isTalking ? "End Call" : "Call Bondi"}
      </button>
    </div>
  );
} 