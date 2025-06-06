"use client";

import { useAuth } from "../components/AuthContext";
import { useRouter } from "next/navigation";
import AuthNavbar from "../components/AuthNavbar";
import LeftBar from "./components/leftbar";
import Chat from "../components/Chat";
import { useState } from "react";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  const handleRecordingComplete = (url: string) => {
    setRecordingUrl(url);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null; // or redirecting...
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700 text-white font-sans">
      <div className="z-1">
        <AuthNavbar />
      </div>

      <main className="flex flex-1 w-full">
        <LeftBar user={user} />

        {/* Main dashboard content fills remaining space */}
        <section className="flex-1 p-6 max-w-full">
          <h1 className="text-4xl font-extrabold drop-shadow-2xl ml-10">
            {user.firstname}&apos;s Dashboard
          </h1>
          {/* Recording playback UI */}
          {recordingUrl && (
            <div className="absolute top-40 right-8 p-4 bg-white/10 rounded-lg backdrop-blur-sm">
              <h2 className="text-xl font-semibold mb-4">Your Recording</h2>
              <audio 
                controls 
                className="w-full max-w-md"
                src={recordingUrl}
              >
                Your browser does not support the audio element.
              </audio>
            </div>
          )}
        </section>
      </main>
      <div className="absolute top-25 right-8">
        <Chat 
          llmMode={"user_called"} 
          onRecordingComplete={handleRecordingComplete}
        />
      </div>
    </div>
  );
}
