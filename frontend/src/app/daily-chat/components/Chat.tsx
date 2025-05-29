"use client";

import { useState, useRef } from "react";
import { setupAudioProcessor } from "./audio";
import { useAuth } from "../../components/AuthContext";

interface ChatProps {
  websocketURL: string;
}

interface Message {
  type: 'transcription' | 'llm_response' | 'error';
  content: string;
  timestamp: number;
}

export default function Chat({ websocketURL }: ChatProps) {
  const { user } = useAuth();
  const [isTalking, setIsTalking] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const transcriptionContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);

  /** start / stop mic + websocket */
  const TalkToAI = async () => {
    try {
      if (!user?.username) {
        console.error("No user found");
        return;
      }

      // Get microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create audio context for transcription (16kHz for Vosk)
      const transcriptionContext = new AudioContext({ sampleRate: 16000 });
      transcriptionContextRef.current = transcriptionContext;
      const source = transcriptionContext.createMediaStreamSource(stream);
      
      // Create audio context for playback (16kHz for ElevenLabs PCM)
      const playbackContext = new AudioContext({ sampleRate: 16000 });
      playbackContextRef.current = playbackContext;
      
      // Setup audio processor
      const processor = await setupAudioProcessor(transcriptionContext);
      
      // WebSocket connection with username
      const socket = new WebSocket(`${websocketURL}/ws/speech/${user.username}/`);
      socket.binaryType = "arraybuffer";

      // Handles initial connection to the websocket
      socket.onopen = () => {
        console.log("WebSocket connected");
        setIsTalking(true);
        source.connect(processor);
        processor.connect(transcriptionContext.destination);
      };

      // Handle audio data from processor and send to backend for transcription
      processor.port.onmessage = (e) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(e.data);
        }
      };

      // Cleanup helper
      const stop = () => {
        console.log("Stopping audio + WS");
        source.disconnect();
        processor.disconnect();
        stream.getTracks().forEach(track => track.stop());
        if (transcriptionContext.state !== "closed") transcriptionContext.close();
        if (playbackContext.state !== "closed") playbackContext.close();
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        setIsTalking(false);
      };
      stopRef.current = stop;

      // Websocket receiving information from the backend
      socket.onmessage = async (e) => {
        try {
          // Handles ElevenLabs streaming
          if (e.data instanceof ArrayBuffer) {
            // Skip partial chunks
            if (e.data.byteLength % 2 !== 0) {
              console.log("Skipping partial audio chunk");
              return;
            }

            // Log chunk details
            console.log(`Received audio chunk: size=${e.data.byteLength} bytes`);
            const pcmData = new Int16Array(e.data);
            console.log(`First few PCM values: ${Array.from(pcmData.slice(0, 10))}`);

            // Handle binary audio data - play immediately using playback context
            const playbackContext = playbackContextRef.current;
            if (playbackContext) {
              // Convert raw PCM to Float32Array
              const floatData = new Float32Array(pcmData.length);
              for (let i = 0; i < pcmData.length; i++) {
                floatData[i] = pcmData[i] / 32768; // normalize to [-1, 1]
              }

              // Create and fill audio buffer
              const audioBuffer = playbackContext.createBuffer(1, floatData.length, 16000);
              audioBuffer.getChannelData(0).set(floatData);

              // Log audio buffer details
              console.log(`Created audio buffer: length=${audioBuffer.length}, sampleRate=${audioBuffer.sampleRate}`);

              // Play the audio
              const source = playbackContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(playbackContext.destination);
              source.start();
              console.log('Started playing audio chunk');
            }
          } else {
            // Handle JSON messages
            const data = JSON.parse(e.data);
            if (data.type === 'llm_response') {
              
            } else if (data.type === 'error') {
              console.error('Error from backend:', data.content);
            }
          }
        } catch (error) {
          console.error("Error processing message:", error);
        }
      };

      // Catching error in websocket stream / Closing stream when 
      // user ends it or stops talking
      socket.onerror = (e) => { console.error("WS error", e); stop(); };
      socket.onclose = () => { console.log("WS closed"); stop(); };

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
        {isTalking ? "End Daily Chat" : "Start Daily Chat"}
      </button>
    </div>
  );
} 