"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthContext";
import AuthNavbar from "../components/AuthNavbar";
import LeftBar from "./components/leftbar";
import FancyDashboardRecording from "./components/fancyDashboardRecording";
import { HiTrash } from "react-icons/hi";
import Masonry from "react-masonry-css";

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
  title: string;  // Add title field
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [viewMode, setViewMode] = useState<'new' | 'seen' | 'your'>('new');
  const [isLoading, setIsLoading] = useState(true);
  const baseURL = process.env.NEXT_PUBLIC_URL;

  useEffect(() => {
    const generateInitialGreeting = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        // Get current time in user's timezone
        const now = new Date();
        const timeContext = {
          timestamp: now.toISOString(),
          hour: now.getHours(),
          minute: now.getMinutes(),
          weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
          isWeekend: [0, 6].includes(now.getDay()),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };

        const response = await fetch('/api/groq/generate-greeting', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(timeContext)
        });

        if (!response.ok) {
          console.error('Failed to generate greeting');
        }
      } catch (error) {
        console.error('Error generating greeting:', error);
      }
    };

    if (user) {
      generateInitialGreeting();
    }
  }, [user]);

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

    // Optimistically remove the recording from UI
    setRecordings(prev => prev.filter(rec => rec.id !== recordingId));

    try {
      const response = await fetch(`${baseURL}/api/recordings/delete/${recordingId}/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // If the deletion fails, revert the UI change
        const errorData = await response.json();
        console.error('Failed to delete recording:', errorData);
        // Re-fetch recordings to restore the correct state
        const recordingsResponse = await fetch(`${baseURL}/api/recordings/get/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (recordingsResponse.ok) {
          const data = await recordingsResponse.json();
          const sortedRecordings = [...data].sort((a: Recording, b: Recording) => {
            const dateA = new Date(a.created_at);
            const dateB = new Date(b.created_at);
            return dateB.getTime() - dateA.getTime();
          });
          setRecordings(sortedRecordings);
        }
      }
    } catch (error) {
      console.error('Error deleting recording:', error);
      // Re-fetch recordings to restore the correct state
      try {
        const recordingsResponse = await fetch(`${baseURL}/api/recordings/get/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (recordingsResponse.ok) {
          const data = await recordingsResponse.json();
          const sortedRecordings = [...data].sort((a: Recording, b: Recording) => {
            const dateA = new Date(a.created_at);
            const dateB = new Date(b.created_at);
            return dateB.getTime() - dateA.getTime();
          });
          setRecordings(sortedRecordings);
        }
      } catch (fetchError) {
        console.error('Error restoring recordings:', fetchError);
      }
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
          setIsLoading(false); // Set loading to false after successful fetch
        } else {
          setIsLoading(false); // Set loading to false if response is not ok
        }
      } catch (error) {
        console.error('Error fetching recordings:', error);
        setIsLoading(false); // Set loading to false on error
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
    // Check if it's this year
    if (date.getFullYear() === now.getFullYear()) {
      return `Sent on ${date.toLocaleDateString([], { month: 'long', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    // For older years, include the year
    return `Sent on ${date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  };

  const sortedRecordings = recordings
    .filter(recording => {
      if (viewMode === 'new') return !recording.seen;
      if (viewMode === 'seen') return recording.seen && user && recording.sender.id !== user.id;
      if (viewMode === 'your' && user) return recording.sender.id === user.id;
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (authLoading) {
    return (
      <div className="h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700">
        <div className="z-1">
          <AuthNavbar />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
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
        <LeftBar 
          user={user} 
        />

        <section className="flex-1 p-6 max-w-full h-full overflow-y-auto">
          <h1 className="mt-[0px] text-3xl font-extrabold drop-shadow-2xl ml-10 text-black">
            {user.firstname}&apos;s Dashboard
          </h1>

          <div className="mt-[16px] flex items-center gap-4 ml-10 mb-6">
            <div className="bg-indigo-200/80 backdrop-blur-md rounded-full flex items-center gap-1 relative border border-indigo-300/50 h-[40px]">
              <div 
                className={`absolute h-full bg-indigo-600 rounded-full transition-all duration-300 ease-in-out ${
                  viewMode === 'new' ? 'left-0 w-[55px]' : 
                  viewMode === 'seen' ? 'left-[55px] w-[61px]' : 
                  'left-[120px] w-[135px]'
                }`}
              />
              <button
                onClick={() => setViewMode('new')}
                className={`relative cursor-pointer px-3 py-2 rounded-full text-sm font-semibold transition-all duration-200 h-full flex items-center ${
                  viewMode === 'new' ? 'text-white' : 'text-indigo-900 hover:bg-indigo-300/50'
                }`}
              >
                New
              </button>
              <button
                onClick={() => setViewMode('seen')}
                className={`relative cursor-pointer px-3 py-2 rounded-full text-sm font-semibold transition-all duration-200 h-full flex items-center ${
                  viewMode === 'seen' ? 'text-white' : 'text-indigo-900 hover:bg-indigo-300/50'
                }`}
              >
                Seen
              </button>
              <button
                onClick={() => setViewMode('your')}
                className={`relative cursor-pointer px-3 py-2 rounded-full text-sm font-semibold transition-all duration-200 h-full flex items-center ${
                  viewMode === 'your' ? 'text-white' : 'text-indigo-900 hover:bg-indigo-300/50'
                }`}
              >
                Your Recordings
              </button>
            </div>
          </div>

          <div className="mt-[-22px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Masonry
                breakpointCols={{ default: 3, 1024: 2, 640: 1 }}
                className="flex w-full gap-6 p-6"
                columnClassName="space-y-6"
              >
                {sortedRecordings.map((recording) => (
                  <div key={recording.id} className="bg-purple-200/90 backdrop-blur-md rounded-lg p-6 shadow-lg border-2 border-transparent hover:border-purple-300/50 transition-all duration-200 relative">
                    {(viewMode === 'seen' || viewMode === 'your') && (
                      <button
                        onClick={() => deleteRecording(recording.id)}
                        className="cursor-pointer absolute top-6 right-4 text-red-800 hover:text-red-700 transition-colors duration-200"
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
                    <FancyDashboardRecording 
                      recordingId={recording.id}
                      sender={recording.sender}
                      showSender={false}
                      title={recording.title}
                      className="w-full"
                      onPlay={() => markRecordingAsSeen(recording.id)}
                    />
                    <p className="text-sm font-semibold text-black mt-4">
                      {formatDateTime(recording.created_at)}
                    </p>
                  </div>
                ))}
              </Masonry>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
