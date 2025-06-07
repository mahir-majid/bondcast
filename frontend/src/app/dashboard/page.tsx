"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthContext";
import { useRouter } from "next/navigation";
import AuthNavbar from "../components/AuthNavbar";
import LeftBar from "./components/leftbar";

interface Recording {
  id: number;
  sender: {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
  };
  audio_data: string;  // Base64 encoded audio data
  created_at: string;
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const baseURL = process.env.NEXT_PUBLIC_URL;

  useEffect(() => {
    const fetchRecordings = async () => {
      if (!user) return;

      const token = localStorage.getItem("accessToken");
      if (!token) return;

      try {
        const response = await fetch(`${baseURL}/api/recordings/get/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setRecordings(data);
        }
      } catch (error) {
        console.error('Error fetching recordings:', error);
      }
    };

    fetchRecordings();
  }, [user, baseURL]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700 text-white font-sans overflow-hidden">
      <div className="z-1">
        <AuthNavbar />
      </div>

      <main className="flex flex-1 w-full h-[calc(100vh-64px)]">
        <LeftBar user={user} />

        <section className="flex-1 p-6 max-w-full h-full overflow-y-auto">
          <h1 className="text-4xl font-extrabold drop-shadow-2xl ml-10">
            {user.firstname}&apos;s Dashboard
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {recordings.map((recording) => {
              return (
                <div key={recording.id} className="bg-white/10 backdrop-blur-sm rounded-lg p-6 shadow-lg border-2 border-transparent hover:border-indigo-400/30 hover:shadow-[0_0_20px_rgba(129,140,248,0.3)] transition-all duration-200">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold">
                      {recording.sender.firstname[0]}{recording.sender.lastname[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {recording.sender.firstname} {recording.sender.lastname}
                      </h3>
                      <p className="text-sm text-black">@{recording.sender.username}</p>
                    </div>
                  </div>
                  <audio 
                    controls 
                    className="w-full" 
                    preload="metadata"
                    onError={(e) => {
                      const audioElement = e.target as HTMLAudioElement;
                      console.error('Audio error details:', {
                        error: audioElement.error,
                        networkState: audioElement.networkState,
                        readyState: audioElement.readyState,
                        src: audioElement.src
                      });
                    }}
                  >
                    <source 
                      src={`data:audio/webm;base64,${recording.audio_data}`}
                      type="audio/webm"
                    />
                    Your browser does not support the audio element.
                  </audio>
                  <p className="text-sm text-black mt-2">
                    {new Date(recording.created_at).toLocaleDateString()}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
