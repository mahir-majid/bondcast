"use client";

import { useState, useRef } from "react";
import { setupAudioProcessor } from "./audio";
import { useAuth } from "./AuthContext";

interface ChatProps {
  llmMode: string;
  onRecordingComplete?: (url: string) => void;
}

export default function Chat({ llmMode, onRecordingComplete }: ChatProps) {
  const { user } = useAuth();
  const [isTalking, setIsTalking] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const transcriptionContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const workletNodeTTSRef = useRef<AudioWorkletNode | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTTSNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to play ringtone
  const playRingtone = () => {
    if (!ringtoneRef.current) {
      ringtoneRef.current = new Audio('/ringtone.mp3');
      ringtoneRef.current.loop = true;
    }
    ringtoneRef.current.play();
  };

  // Function to stop ringtone
  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
    if (ringtoneIntervalRef.current) {
      clearTimeout(ringtoneIntervalRef.current);
    }
  };

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** start / stop mic + websocket */
  const TalkToAI = async () => {
    try {
      if (!user?.username) {
        console.error("No user found");
        return;
      }

      // Set ringing state immediately
      setIsRinging(true);

      // Start playing ringtone
      playRingtone();

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

      // Don't start recording yet - we'll start it when ElevenLabs begins speaking
      
      // WebSocket connection with username
      const socket = new WebSocket(`${process.env.NEXT_PUBLIC_WEBSOCKET_URL}/ws/speech/${user.username}/${llmMode}/`);
      socket.binaryType = "arraybuffer";

      // Handles initial connection to the websocket
      socket.onopen = async () => {
        // Stop ringtone and play beep when connection is established
        await sleep(1000);
        stopRingtone();
        const beep = new Audio('/beep.mp3');

        // Send ready signal to start ElevenLabs streaming
        socket.send(JSON.stringify({ type: "ready_for_streaming" }));
        
        // Change to talking state after beep
        setIsRinging(false);
        setIsTalking(true);

        // Wait for beep to finish before starting audio processing
        await new Promise<void>((resolve) => {
          beep.onended = () => resolve();
          beep.play();
        });

        // Only start audio processing after beep is completely done
        if (workletNodeTTSRef.current) {
          workletNodeTTSRef.current.connect(playbackContext.destination);
        }
        if (recordingTTSNodeRef.current) {
          recordingTTSNodeRef.current.connect(recordingDestination);
        }
        // Connect transcription source and processor
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
            
            // Start recording when we receive the first audio chunk from ElevenLabs
            if (!mediaRecorderRef.current?.state || mediaRecorderRef.current.state === 'inactive') {
              mediaRecorderRef.current?.start();
            }
            
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
            if (data.type === 'error') {
              console.error('Error from backend:', data.content);
            } else if (data.type === 'stop_audio') {
              console.log("Received stop_audio from backend");
              // Forward stop_audio message to both worklets
              if (workletNodeTTSRef.current) {
                workletNodeTTSRef.current.port.postMessage({ type: 'stop_audio' });
              }
              if (recordingTTSNodeRef.current) {
                recordingTTSNodeRef.current.port.postMessage({ type: 'stop_audio' });
              }
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
      // console.log("WS closed"); 
      stop();
      // If we have recording chunks, create a recording
      if (recordingChunksRef.current.length > 0) {
        const blob = new Blob(recordingChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        onRecordingComplete?.(url);
      }
    };

    // Stop function
    const stop = () => {
        // console.log("Stopping audio and WebSocket");
        stopRingtone();

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
        setIsRinging(false);
      };

        stopRef.current = stop;

      } catch (err) {
        console.error("TalkToAI error:", err);
        setIsRinging(false);
      }
    };

  // Toggler between starting daily chat and ending it
  const handleClick = () => {
    if (isRinging) return; // Do nothing if ringing
    if (isTalking && stopRef.current) stopRef.current();
    else TalkToAI();
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
      <button
        onClick={handleClick}
        className={`px-6 py-3 cursor-pointer rounded-lg bg-gradient-to-r from-purple-700 to-purple-900 text-amber-300 font-semibold shadow-xl hover:shadow-[0_0_20px_rgba(251,191,36,0.8)] hover:from-purple-600 hover:to-purple-800 hover:text-amber-200 active:scale-95 active:shadow-inner transition-all duration-200 ${
          isRinging ? 'opacity-75 cursor-not-allowed' : ''
        }`}
      >
        {isRinging ? "Ringing..." : isTalking ? "End Call" : "Call Bondi"}
      </button>
    </div>
  );
} 