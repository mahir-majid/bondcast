"use client";

import FancyDashboardRecording from "./components/fancyDashboardRecording";
import Masonry from "react-masonry-css";

interface Recording {
  id: number;
  sender: {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
  };
  audio_data: string;
  created_at: string;
  seen: boolean;
  title: string;
}

interface NewBondCastProps {
  recordings: Recording[];
  isLoading: boolean;
}

export default function NewBondCast({ recordings, isLoading }: NewBondCastProps) {
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

  const newRecordings = recordings
    .filter(recording => !recording.seen)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (newRecordings.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-center">
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No New BondCasts</h3>
          <p className="text-gray-700">You&apos;re all caught up! Check back later for new recordings.</p>
        </div>
      </div>
    );
  }

  return (
    <Masonry
      breakpointCols={{ default: 3, 1024: 2, 640: 1 }}
      className="flex w-full gap-6 p-6"
      columnClassName="space-y-6"
    >
      {newRecordings.map((recording) => (
        <div key={recording.id} className="bg-purple-200/90 backdrop-blur-md rounded-lg p-6 shadow-lg border-2 border-transparent hover:border-purple-300/50 transition-all duration-200 relative">
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
  );
}
