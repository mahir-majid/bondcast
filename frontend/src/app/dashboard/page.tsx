"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthContext";
import AuthNavbar from "../components/AuthNavbar";
import LeftBar from "./components/leftbar";
import FancyRecording from "./components/fancyRecording";
import { HiTrash } from "react-icons/hi";

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
  seen: boolean;
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [viewMode, setViewMode] = useState<'new' | 'seen'>('new');
  const baseURL = process.env.NEXT_PUBLIC_URL;

  const markRecordingAsSeen = async (recordingId: number) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      console.log('Marking recording as seen:', recordingId);
      const response = await fetch(`${baseURL}/api/recordings/mark-seen/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ recording_id: recordingId }),
      });

      if (!response.ok) {
        console.error('Failed to mark recording as seen:', await response.text());
      } else {
        console.log('Successfully marked recording as seen');
      }
    } catch (error) {
      console.error('Error marking recording as seen:', error);
    }
  };

  const deleteRecording = async (recordingId: number) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const response = await fetch(`${baseURL}/api/recordings/delete/${recordingId}/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Remove the recording from the local state
        setRecordings(prev => prev.filter(rec => rec.id !== recordingId));
      } else {
        console.error('Failed to delete recording');
      }
    } catch (error) {
      console.error('Error deleting recording:', error);
    }
  };

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
          console.log('Fetched recordings:', data);
          // Sort recordings by created_at in descending order (newest first)
          const sortedRecordings = [...data].sort((a: Recording, b: Recording) => {
            const dateA = new Date(a.created_at);
            const dateB = new Date(b.created_at);
            return dateB.getTime() - dateA.getTime();
          });
          setRecordings(sortedRecordings);
        }
      } catch (error) {
        console.error('Error fetching recordings:', error);
      }
    };

    fetchRecordings();

    // Add event listener for recordings updates
    const handleRecordingsUpdate = (event: CustomEvent) => {
      setRecordings(event.detail.recordings);
    };

    window.addEventListener('recordingsUpdated', handleRecordingsUpdate as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('recordingsUpdated', handleRecordingsUpdate as EventListener);
    };
  }, [user, baseURL]);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if it's today
    if (date.toDateString() === now.toDateString()) {
      return `Sent Today at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    // Check if it's yesterday
    if (date.toDateString() === yesterday.toDateString()) {
      return `Sent Yesterday at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    // Otherwise show full date and time
    return "Sent on " + date.toLocaleString();
  };

  const filteredRecordings = recordings.filter(recording => 
    viewMode === 'new' ? !recording.seen : recording.seen
  );

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
          <h1 className="mt-[0px] text-3xl font-extrabold drop-shadow-2xl ml-10 text-black">
            {user.firstname}&apos;s Dashboard
          </h1>

          <div className="mt-[16px] flex items-center gap-4 ml-10 mb-6">
            <div className="bg-indigo-200/80 backdrop-blur-md rounded-full flex items-center gap-1 relative border border-indigo-300/50 h-[40px]">
              <div 
                className={`absolute h-full bg-indigo-600 rounded-full transition-all duration-300 ease-in-out ${
                  viewMode === 'new' ? 'left-0 w-[135px]' : 'left-[135px] w-[60px]'
                }`}
              />
              <button
                onClick={() => setViewMode('new')}
                className={`relative cursor-pointer px-3 py-2 rounded-full text-sm font-semibold transition-all duration-200 h-full flex items-center ${
                  viewMode === 'new' ? 'text-white' : 'text-indigo-900 hover:bg-indigo-300/50'
                }`}
              >
                New Recordings
              </button>
              <button
                onClick={() => setViewMode('seen')}
                className={`relative cursor-pointer px-3 py-2 rounded-full text-sm font-semibold transition-all duration-200 h-full flex items-center ${
                  viewMode === 'seen' ? 'text-white' : 'text-indigo-900 hover:bg-indigo-300/50'
                }`}
              >
                Seen
              </button>
            </div>
          </div>

          <div className="mt-[-22px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {filteredRecordings.map((recording) => (
              <div key={recording.id} className="bg-purple-200/90 backdrop-blur-md rounded-lg p-6 shadow-lg border-2 border-transparent hover:border-purple-300/50 transition-all duration-200 relative">
                {viewMode === 'seen' && (
                  <button
                    onClick={() => deleteRecording(recording.id)}
                    className="cursor-pointer absolute top-4 right-4 text-red-800 hover:text-red-700 transition-colors duration-200"
                    title="Delete recording"
                  >
                    <HiTrash size={20} />
                  </button>
                )}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-purple-700 flex items-center justify-center text-lg font-bold text-white">
                    {recording.sender.firstname[0]}{recording.sender.lastname[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold text-purple-900">
                      {recording.sender.firstname} {recording.sender.lastname}
                    </h3>
                    <p className="text-sm font-semibold text-purple-700">@{recording.sender.username}</p>
                  </div>
                </div>
                <FancyRecording 
                  audioSrc={`data:audio/webm;base64,${recording.audio_data}`}
                  sender={recording.sender}
                  showSender={false}
                  className="w-full"
                  onPlay={() => markRecordingAsSeen(recording.id)}
                />
                <p className="text-sm font-semibold text-black mt-2">
                  {formatDateTime(recording.created_at)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
