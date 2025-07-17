"use client";

import { useState } from "react";
import { HiArrowLeft, HiMicrophone } from "react-icons/hi";
import Chat from "../../components/Chat";
import FancySendRecording from "./fancySendRecording";

interface Friend {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
}

interface BondcastRecordingProps {
  friends: Friend[];
  onBack: () => void;
  onRecordingComplete: (url: string) => void;
  onRecordingCancel: () => void;
  bondcastData?: {
    title: string;
    description: string;
    requestId: number;
  };
}


export default function BondcastRecording({ 
  friends, 
  onBack, 
  onRecordingComplete, 
  onRecordingCancel,
  bondcastData
}: BondcastRecordingProps) {
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [buttonText, setButtonText] = useState<string>("");
  const [recordingTitle, setRecordingTitle] = useState("");

  const handleRecordingComplete = (url: string) => {
    setRecordingUrl(url);
    onRecordingComplete(url);
        
    // Play beep sound for 0.75 seconds
    const beep = new Audio('/beep.mp3');
    beep.play();
    setTimeout(() => {
      beep.pause();
      beep.currentTime = 0;
    }, 750);
  };

  const handleSendRecording = async () => {
    if (!recordingUrl) return;
    if (!recordingTitle.trim()) {
      setButtonText("Please include a title");
      setTimeout(() => {
        setButtonText("");
      }, 1300);
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      console.error("No access token found");
      return;
    }
    
    try {
      setShowSuccess(true);
      
      const recipientsToSend = selectedFriendIds.length === 0 
        ? friends.map(friend => friend.id)
        : selectedFriendIds;

      // Create a FormData object to send the audio file
      const formData = new FormData();
      
      // Convert Blob URL to actual Blob
      const response = await fetch(recordingUrl);
      const audioBlob = await response.blob();
      
      // Create a proper File object with the correct MIME type
      const audioFile = new File([audioBlob], 'recording.wav', { 
        type: 'audio/webm' // Change to webm since that's what the browser records in
      });
      formData.append('audio', audioFile);
      formData.append('title', recordingTitle.trim());
      console.log('Recording title being sent:', recordingTitle.trim());
      recipientsToSend.forEach(id => {
        formData.append('to_users[]', id.toString());
      });

      const baseURL = process.env.NEXT_PUBLIC_URL;
      
      // Upload the recording
      const uploadResponse = await fetch(`${baseURL}/api/recordings/upload/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Failed to upload recording');
      }

      // Mark the bondcast request as completed if we have bondcastData
      if (bondcastData?.requestId) {
        try {
          const completeResponse = await fetch(`${baseURL}/api/bondcast-requests/${bondcastData.requestId}/complete/`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          });

          if (!completeResponse.ok) {
            console.error('Failed to mark bondcast request as completed:', completeResponse.status);
          } else {
            console.log('Bondcast request marked as completed');
          }
        } catch (error) {
          console.error('Error marking bondcast request as completed:', error);
        }
      }

      // Show success message immediately
      // Fetch updated recordings in the background
      fetch(`${baseURL}/api/recordings/get/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      .then(recordingsResponse => recordingsResponse.json())
      .then(data => {
        // Sort recordings by created_at in descending order (newest first)
        const sortedRecordings = [...data].sort((a, b) => {
          const dateA = new Date(a.created_at);
          const dateB = new Date(b.created_at);
          return dateB.getTime() - dateA.getTime();
        });
        // Update the recordings state in the parent component
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('recordingsUpdated', { 
            detail: { recordings: sortedRecordings }
          }));
        }
      })
      .catch(error => {
        console.error('Error fetching updated recordings:', error);
      });
      
      // Clear the recording and reset state after a delay, then go back to friends list
      setTimeout(() => {
        setRecordingUrl(null);
        setSelectedFriendIds([]);
        setRecordingTitle("");
        setShowSuccess(false);
        // Navigate back to friends list
        onBack();
      }, 1200);
    } catch (error) {
      console.error('Error sending recording:', error);
      alert('Error sending recording. Please try again.');
    }
  };

  const handleCancelRecording = () => {
    setRecordingUrl(null);
    onRecordingCancel();
  };

  const handleRecordAgain = () => {
    setRecordingUrl(null);
    setSelectedFriendIds([]);
    setRecordingTitle("");
    setShowSuccess(false);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold drop-shadow-2xl text-black">
          {recordingUrl ? "Recording Studio" : "Recording Studio"}
        </h2>
        <div className="relative flex items-center">
          <button
            onClick={recordingUrl ? handleCancelRecording : onBack}
            className="text-indigo-300 hover:text-white transition"
          >
            <HiArrowLeft
              size={26}
              className="mt-[6px] cursor-pointer text-indigo-200 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-200"
            />
          </button>
        </div>
      </div>

      {/* Show Chat component only when not recording */}
      {!recordingUrl ? (
        <Chat 
          variant="default"
          onRecordingComplete={handleRecordingComplete}
          disabled={friends.length === 0}
        />
      ) : (
        /* Show Record Again button when recording is complete */
        <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
          <button
            onClick={handleRecordAgain}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-purple-700 to-purple-900 text-amber-300 font-semibold shadow-xl hover:shadow-[0_0_20px_rgba(251,191,36,0.8)] hover:from-purple-600 hover:to-purple-800 hover:text-amber-200 active:scale-95 active:shadow-inner transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HiMicrophone size={20} />
              Record Again
            </div>
          </button>
        </div>
      )}

      {/* Bondcast Info Display - Show only before recording */}
      {bondcastData && !recordingUrl && (
        <div className="mt-2 bg-white rounded-xl p-6 shadow-xl border border-blue-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6 10v1a6 6 0 0 1-12 0v-1m6 8v4m-4 0h8" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-blue-900">Recording for BondCast</h3>
          </div>
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-blue-700 mb-1">Title</h4>
              <p className="text-blue-900 font-medium text-lg">{bondcastData.title}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-blue-700 mb-1">Description</h4>
              <p className="text-gray-700 text-sm leading-relaxed">{bondcastData.description}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-blue-100">
            <div className="flex items-center gap-2 text-blue-700 text-sm">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>Ready to record your response</span>
            </div>
          </div>
        </div>
      )}

      {!recordingUrl ? (
        <div className="flex flex-col gap-4 mt-[-7px] h-full">
          
        </div>
      ) : (
        <div className="mt-[-7px] flex flex-col gap-4">
          <div className="p-4 bg-pink-200/90 rounded-lg backdrop-blur-sm border-2 border-transparent hover:border-pink-300/50 hover:shadow-[0_0_20px_rgba(236,72,153,0.2)] transition-all duration-200">
            <div className="relative">
              <input
                type="text"
                value={recordingTitle}
                onChange={e => setRecordingTitle(e.target.value)}
                placeholder={"Enter a title for your Bondcast"}
                className="w-full mb-1 px-3 py-2 border-2 border-black rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black"
                disabled={showSuccess}
                maxLength={150}
              />
              <div className="text-right text-sm text-gray-600 mb-4">
                {recordingTitle.length}/150 characters
              </div>
            </div>
            <div className="mt-[-10px]">
              <FancySendRecording 
                audioSrc={recordingUrl}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <button
              onClick={friends.length === 0 ? onBack : handleSendRecording}
              className={`w-full bg-blue-900 hover:bg-blue-800 cursor-pointer text-white px-4 py-2 rounded-full font-semibold transition relative ${
                showSuccess ? 'bg-green-500 hover:bg-green-600' : ''
              }`}
              disabled={showSuccess}
            >
              {showSuccess ? (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Sent Successfully!
                </div>
              ) : buttonText ? (
                buttonText
              ) : friends.length === 0 ? (
                "Add a Friend to Send Recordings"
              ) : (
                selectedFriendIds.length === 0 
                  ? `Send to All Friends` 
                  : `Send to ${selectedFriendIds.length} Selected Friend${selectedFriendIds.length === 1 ? '' : 's'}`
              )}
            </button>

            {friends.length > 0 && (
              <div className="max-h-[calc(100vh-400px)] overflow-y-auto custom-scrollbar pr-4">
                <div className="flex flex-col gap-3">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="bg-blue-100/80 rounded-lg p-4 border-2 border-transparent hover:border-blue-400/50 hover:bg-blue-200/90 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all duration-200 cursor-pointer group flex items-center justify-between"
                      onClick={() => {
                        const selectedFriends = new Set(selectedFriendIds);
                        if (selectedFriends.has(friend.id)) {
                          selectedFriends.delete(friend.id);
                        } else {
                          selectedFriends.add(friend.id);
                        }
                        setSelectedFriendIds(Array.from(selectedFriends));
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-400 flex items-center justify-center text-lg font-bold text-white group-hover:bg-blue-500 group-hover:shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all duration-200">
                          {friend.firstname[0]}{friend.lastname[0]}
                        </div>
                        <div>
                          <h3 className="font-semibold text-blue-800 group-hover:text-blue-700 transition-colors duration-200">{friend.firstname} {friend.lastname}</h3>
                          <p className="text-sm text-black group-hover:text-black transition-colors duration-200">@{friend.username}</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200
                        ${selectedFriendIds.includes(friend.id) 
                          ? 'bg-blue-500 border-blue-500 group-hover:shadow-[0_0_10px_rgba(59,130,246,0.3)]' 
                          : 'border-blue-400 group-hover:border-blue-500'}`}
                      >
                        {selectedFriendIds.includes(friend.id) && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
