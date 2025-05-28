"use client";

import { useState, useRef } from "react";
import { setupAudioProcessor } from "./audio";
import { useAuth } from "../../components/AuthContext";

interface ChatProps {
  websocketURL: string;
}

interface Message {
  type: 'transcription' | 'response';
  text: string;
  timestamp: number;
}

export default function Chat({ websocketURL }: ChatProps) {
  const { user } = useAuth();
  const [isTalking, setIsTalking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const stopRef = useRef<(() => void) | null>(null);

  /** start / stop mic + websocket */
  const TalkToAI = async () => {
    try {
      if (!user?.username) {
        console.error("No user found");
        return;
      }

      // Get microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create audio context and source
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      
      // Setup audio processor
      const processor = await setupAudioProcessor(audioContext);
      
      // WebSocket connection with username
      const socket = new WebSocket(`${websocketURL}/ws/speech/${user.username}/`);
      socket.binaryType = "arraybuffer";

      // Handles initial connection to the websocket
      socket.onopen = () => {
        console.log("WebSocket connected");
        setIsTalking(true);
        source.connect(processor);
        processor.connect(audioContext.destination);
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
        if (audioContext.state !== "closed") audioContext.close();
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        setIsTalking(false);
      };
      stopRef.current = stop;

      // Websocket receiving information from the backend
      socket.onmessage = (e) => {
        try {
          // Handle JSON messages (transcription and response)
          const data = JSON.parse(e.data);
          if (data.transcription) {
            console.log(`Transcription from backend: ${data.transcription}`)
          } else if (data.response) {
            console.log(`LLM Response from backend: ${data.response}`)
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