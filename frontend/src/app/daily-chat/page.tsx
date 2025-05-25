// app/dashboard/page.tsx   (frontend with “live mic” fix applied)

"use client";

import { useAuth } from "../components/AuthContext";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AuthNavbar from "../components/AuthNavbar";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const websocketURL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
  const [isTalking, setIsTalking] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  /** start / stop mic + websocket */
  const TalkToAI = async () => {
    try {
      /* 1️⃣ get mic permission */
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      /* 2️⃣ force‑16 kHz context (hardware may still be 48 kHz; that’s fine) */
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);

      /* 3️⃣ inline AudioWorklet that converts Float32 → Int16 PCM */
      const processorCode = `
        class PCMProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (input.length && input[0].length) {
              const data = input[0];
              const buf = new Int16Array(data.length);
              for (let i = 0; i < data.length; i++) {
                const s = Math.max(-1, Math.min(1, data[i]));
                buf[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              this.port.postMessage(buf.buffer, [buf.buffer]);
            }
            return true;
          }
        }
        registerProcessor("pcm-processor", PCMProcessor);
      `;
      const blobUrl = URL.createObjectURL(
        new Blob([processorCode], { type: "application/javascript" })
      );
      await audioContext.audioWorklet.addModule(blobUrl);

      /* 4️⃣ create node with **one dummy output** so the graph pulls real audio */
      const pcmNode = new AudioWorkletNode(audioContext, "pcm-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1], // 1‑channel silent output
      });

      /* 5️⃣ mute that output to avoid feedback but keep node alive */
      const silence = audioContext.createGain();
      silence.gain.value = 0;

      /* 6️⃣ WebSocket to Django Channels */
      const socket = new WebSocket(`${websocketURL}/ws/speech/`);
      socket.binaryType = "arraybuffer";

      /* send each PCM buffer */
      pcmNode.port.onmessage = (e) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(e.data);
      };

      /* cleanup helper */
      const stop = () => {
        console.log("Stopping audio + WS");
        source.disconnect();
        pcmNode.disconnect();
        silence.disconnect();
        if (audioContext.state !== "closed") audioContext.close();
        stream.getTracks().forEach((t) => t.stop());
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
          socket.close();
        setIsTalking(false);
      };
      stopRef.current = stop;

      /* open WS, hook up graph */
      socket.onopen = () => {
        console.log("WebSocket connected");
        setIsTalking(true);
        source.connect(pcmNode);            // mic → worklet
        pcmNode.connect(silence);           // worklet → muted gain
        silence.connect(audioContext.destination); // keep graph alive, no audible output
      };

      socket.onmessage = (e) => console.log("From server:", e.data);
      socket.onerror   = (e) => { console.error("WS error", e); stop(); };
      socket.onclose   = () => { console.log("WS closed"); stop(); };

    } catch (err) {
      console.error("TalkToAI error:", err);
    }
  };

  /* toggle */
  const handleClick = () => (isTalking && stopRef.current ? stopRef.current() : TalkToAI());

  /* auth guard */
  useEffect(() => { if (!loading && !user) router.push("/join"); }, [loading, user, router]);

  if (loading) return <div>Loading…</div>;
  if (!user)   return null;

  /* UI */
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700 text-white font-sans">
      <AuthNavbar />

      <main className="flex-1 p-6 max-w-5xl mx-auto flex flex-col items-center">
        <h1 className="text-4xl font-extrabold mb-6 mt-10 drop-shadow-2xl">
          {user.firstname}&rsquo;s Daily Chat
        </h1>

        <button
          onClick={handleClick}
          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-700 rounded-lg shadow-lg hover:from-blue-600 hover:to-blue-800 active:scale-95 active:shadow-inner transition"
        >
          {isTalking ? "End Daily Chat" : "Start Daily Chat"}
        </button>
      </main>

      <footer className="text-center py-6 text-sm text-white/70 bg-indigo-950 mt-auto">
        © {new Date().getFullYear()} Bondiver — Dive Deeper.
      </footer>
    </div>
  );
}
