"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthContext";
import ProfileCard from "../components/ProfileCard";
import LeftBar from "./components/leftbar";
import NewBondCast from "./newBondCast";
import SeenBondCast from "./seenBondCast";
import YourBondCast from "./yourBondCast";
import BrowseTopic from "./browseTopic";

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

interface Topic {
  id: number;
  title: string;
  description: string;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [viewMode, setViewMode] = useState<'new' | 'seen' | 'your' | 'topics'>('new');
  const [isLoading, setIsLoading] = useState(true);
  const [showBrowseTopics, setShowBrowseTopics] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const baseURL = process.env.NEXT_PUBLIC_URL;

  const handleNavigateToTopics = () => {
    setShowBrowseTopics(true);
    setViewMode('topics');
  };

  const handleHideBrowseTopics = () => {
    setShowBrowseTopics(false);
    setSelectedTopic(null);
    // If we're currently on topics view, switch back to new
    if (viewMode === 'topics') {
      setViewMode('new');
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

  if (authLoading) {
    return (
      <div className="h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const renderContent = () => {
    switch (viewMode) {
      case 'new':
        return (
          <NewBondCast 
            recordings={recordings}
            isLoading={isLoading}
          />
        );
      case 'seen':
        return (
          <SeenBondCast 
            recordings={recordings}
            isLoading={isLoading}
            onRecordingsUpdate={setRecordings}
          />
        );
      case 'your':
        return (
          <YourBondCast 
            recordings={recordings}
            isLoading={isLoading}
            onRecordingsUpdate={setRecordings}
          />
        );
      case 'topics':
        return (
          <BrowseTopic 
            isLoading={isLoading}
            onTopicSelect={setSelectedTopic}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700 text-white font-sans overflow-hidden">
      <ProfileCard />

      <main className="flex flex-1 w-full h-full">
        <LeftBar 
          user={user}
          onNavigateToTopics={handleNavigateToTopics}
          onHideBrowseTopics={handleHideBrowseTopics}
          selectedTopic={selectedTopic}
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
                  viewMode === 'your' ? 'left-[120px] w-[135px]' :
                  'left-[255px] w-[120px]'
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
                Your BondCasts
              </button>
              {showBrowseTopics && (
                <button
                  onClick={() => setViewMode('topics')}
                  className={`relative cursor-pointer px-3 py-2 rounded-full text-sm font-semibold transition-all duration-200 h-full flex items-center ${
                    viewMode === 'topics' ? 'text-white' : 'text-indigo-900 hover:bg-indigo-300/50'
                  }`}
                >
                  Browse Topics
                </button>
              )}
            </div>
          </div>

          <div className="mt-[-22px]">
            {renderContent()}
          </div>
        </section>
      </main>
    </div>
  );
}
