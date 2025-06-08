"use client";

import { useEffect, useState, useRef } from "react";
import { HiMail, HiArrowLeft } from "react-icons/hi";
import Chat from "../../components/Chat";
import FancyRecording from "./fancyRecording";

interface Friend {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
}

interface FriendRequest {
  type: string;
  from_user: {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
  };
  status: string;
  created_at: string;
}

type LeftDashBarState = "listFriends" | "listFriendRequests" | "recording";

interface LeftBarProps {
  user: {
    username: string;
    firstname: string;
  };
}

const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 12px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(88, 28, 135, 0.3);
    border-radius: 8px;
    margin: 4px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: linear-gradient(to bottom, #6366f1, #4f46e5);
    border-radius: 8px;
    border: 2px solid rgba(88, 28, 135, 0.3);
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(to bottom, #818cf8, #6366f1);
  }
`;

export default function LeftBar({ user }: LeftBarProps) {
  const baseURL = process.env.NEXT_PUBLIC_URL;
  const websocketURL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
  const [newFriend, setNewFriend] = useState("");
  const [newFriendMessage, setNewFriendMessage] = useState("");
  const [newFriendSuccess, setNewFriendSuccess] = useState<boolean | null>(null);
  const [isMessageVisible, setIsMessageVisible] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [leftDashBarState, setLeftDashBarState] = useState<LeftDashBarState>("listFriends");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = scrollbarStyles;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const connectToFriendRequests = () => {
    if (!user) return;

    // Create new WebSocket connection with username
    const socket = new WebSocket(`${websocketURL}/ws/friend-requests/?username=${user.username}`);

    socket.onopen = () => {
      // console.log('Connected to friend requests WebSocket');
      // Send a proper JSON message
      socket.send(JSON.stringify({ type: 'ping' }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // console.log('Friend Requests:', data.friend_requests);
        // console.log('Friends:', data.user_friends);
        
        if (data && data.friend_requests && data.user_friends) {
          setFriends(data.user_friends);
          setFriendRequests(data.friend_requests);
        }
      } catch (error) {
        console.log('Error parsing message:', error);
      }
    };

    socket.onerror = (error) => {
      console.log('WebSocket error:', error);
      setFriends([]);
      setFriendRequests([]);
    };

    socket.onclose = (event) => {
      console.log('WebSocket closed with code:', event.code, 'reason:', event.reason);
      setFriends([]);
      setFriendRequests([]);
    };

    // Store socket reference
    wsRef.current = socket;
  };

  useEffect(() => {
    if (user) {
      // Add small delay before connecting
      setTimeout(() => {
        connectToFriendRequests();
      }, 1000);
    }

    // Cleanup on component unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user]);

  const addFriend = async () => {
    if (!newFriend.trim()) {
      setNewFriendMessage("Can't leave field Empty");
      setNewFriendSuccess(false);
      setIsMessageVisible(true);
      setTimeout(() => {
        setIsMessageVisible(false);
        setTimeout(() => {
          setNewFriendMessage("");
        }, 300);
      }, 1800);
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setNewFriendMessage("You must be logged in to send a friend request.");
      setNewFriendSuccess(false);
      setIsMessageVisible(true);
      setTimeout(() => {
        setIsMessageVisible(false);
        setTimeout(() => {
          setNewFriendMessage("");
        }, 300);
      }, 1800);
      return;
    }

    try {
      const response = await fetch(`${baseURL}/api/friends/add/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ to_username: newFriend.trim() }),
      });

      const data = await response.json();

      if (!data.error) {
        setNewFriendMessage("Friend request sent successfully!");
        setNewFriendSuccess(true);
        setNewFriend(""); // Clear the input field
        setIsMessageVisible(true);
        setTimeout(() => {
          setIsMessageVisible(false);
          setTimeout(() => {
            setNewFriendMessage("");
          }, 300);
        }, 1800);
      } else {
        setNewFriendSuccess(false);
        console.log(data.error);
        const errorMessage = data.error || "Failed to send friend request.";
        setNewFriendMessage(errorMessage);
        setIsMessageVisible(true);
        setTimeout(() => {
          setIsMessageVisible(false);
          setTimeout(() => {
            setNewFriendMessage("");
          }, 300);
        }, 1800);
      }
    } catch {
      setNewFriendMessage("An error occurred while sending the friend request.");
      setNewFriendSuccess(false);
      setIsMessageVisible(true);
      setTimeout(() => {
        setIsMessageVisible(false);
        setTimeout(() => {
          setNewFriendMessage("");
        }, 300);
      }, 1800);
    }
  };

  const acceptFriendRequest = async (fromUsername: string) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const response = await fetch(`${baseURL}/api/friends/accept/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ from_username: fromUsername }),
      });

      const data = await response.json();
      if (!data.error) {
        // Remove the accepted request from the list
        setFriendRequests(prev => prev.filter(req => req.from_user.username !== fromUsername));
      }
    } catch (error) {
      console.log('Error accepting friend request:', error);
    }
  };

  const declineFriendRequest = async (fromUsername: string) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const response = await fetch(`${baseURL}/api/friends/decline/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ from_username: fromUsername }),
      });

      const data = await response.json();
      if (!data.error) {
        // Remove the declined request from the list
        setFriendRequests(prev => prev.filter(req => req.from_user.username !== fromUsername));
      }
    } catch (error) {
      console.log('Error declining friend request:', error);
    }
  };

  const handleRecordingComplete = (url: string) => {
    setRecordingUrl(url);
    setLeftDashBarState("recording");
  };

  const handleSendRecording = async () => {
    if (!recordingUrl) return;
    
    const token = localStorage.getItem("accessToken");
    if (!token) {
      console.error("No access token found");
      return;
    }

    try {
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
      
      // If no friends are selected, send to all friends
      const recipientsToSend = selectedFriendIds.length === 0 
        ? friends.map(friend => friend.id)
        : selectedFriendIds;

      // Log the recipients for debugging
      // console.log('Sending to recipients:', recipientsToSend);

      recipientsToSend.forEach(id => {
        formData.append('to_users[]', id.toString());
      });

      // Log the FormData contents for debugging
      // for (let pair of formData.entries()) {
      //   console.log(pair[0], pair[1]);
      // }

      const uploadResponse = await fetch(`${baseURL}/api/recordings/upload/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (uploadResponse.ok) {
        // Show success message
        setShowSuccess(true);
        
        // Clear the recording and reset state after a delay
        setTimeout(() => {
          setRecordingUrl(null);
          setSelectedFriendIds([]);
          setLeftDashBarState("listFriends");
          setShowSuccess(false);
        }, 1200);
        
        // console.log("Successfully sent recording!")
      } else {
        const errorData = await uploadResponse.json();
        console.error('Failed to upload recording:', errorData);
        alert(`Failed to send recording: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending recording:', error);
      // Show error to user
      alert('Error sending recording. Please try again.');
    }
  };

  const handleCancelRecording = () => {
    setRecordingUrl(null);
    setLeftDashBarState("listFriends");
  };

  return (
    <aside className="relative w-96 bg-gradient-to-b from-purple-900 via-purple-800 to-purple-700 bg-opacity-80 rounded-xl p-6 flex flex-col gap-6 text-white shadow-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold mb-2 cursor-pointer text-blue-300">
          {leftDashBarState === "listFriends" ? "Friends" : 
           leftDashBarState === "listFriendRequests" ? "Friend Requests" : 
           "Recording Studio"}
        </h2>
        {leftDashBarState !== "recording" ? (
          <div className="relative">
            <button
              aria-label={leftDashBarState === "listFriends" ? "View friend requests" : "Back to friends"}
              className="text-indigo-300 hover:text-white transition"
              onClick={() => {
                setLeftDashBarState(prev => prev === "listFriends" ? "listFriendRequests" : "listFriends");
                setNewFriendMessage("");
              }}
            >
              {leftDashBarState === "listFriends" ? (
                <>
                  <HiMail
                    size={26}
                    className="mt-[-5px] cursor-pointer hover:text-indigo-300 transition"
                  />
                  {friendRequests.length > 0 && (
                    <div className="absolute -top-3.5 -right-3.5 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                      {friendRequests.length}
                    </div>
                  )}
                </>
              ) : (
                <HiArrowLeft
                  size={26}
                  className="mt-[-5px] cursor-pointer hover:text-indigo-300 transition"
                />
              )}
            </button>
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={handleCancelRecording}
              className="text-indigo-300 hover:text-white transition"
            >
              <HiArrowLeft
                size={26}
                className="mt-[-5px] cursor-pointer hover:text-indigo-300 transition"
              />
            </button>
          </div>
        )}
      </div>

      {leftDashBarState === "listFriends" && (
        <>
          <div className="flex gap-3 items-center mt-[-10px]">
            <input
              type="text"
              placeholder="Add New Friend By Username"
              value={newFriend}
              onChange={(e) => setNewFriend(e.target.value)}
              className="flex-1 rounded-full px-4 py-2 text-white border-2 border-indigo-400/30 bg-purple-800/50 placeholder-white/70 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 focus:bg-purple-800 transition-all duration-200"
            />
            <button
              onClick={addFriend}
              className="bg-indigo-600 hover:bg-indigo-700 cursor-pointer text-white px-4 py-2 rounded-full font-semibold whitespace-nowrap transition"
            >
              Send
            </button>
          </div>

          {newFriendMessage && (
            <div className="absolute right-30 top-19 z-50 transform -translate-y-full">
              <div
                className={`w-32 rounded-lg px-4 py-2 text-sm shadow-lg text-white whitespace-normal break-words transition-opacity duration-300 ${
                  newFriendSuccess ? "bg-green-600" : "bg-red-600"
                } ${isMessageVisible ? 'opacity-100' : 'opacity-0'}`}
              >
                {newFriendMessage}
                <div
                  className={`absolute right-3 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 ${
                    newFriendSuccess ? "border-t-green-600" : "border-t-red-600"
                  } border-l-transparent border-r-transparent`}
                />
              </div>
            </div>
          )}

          <p className="text-s text-white mt-[-10] flex items-start gap-1">
            <span className="text-black">•</span>
          </p>
          <div className="mt-[-40]">
            <Chat 
              llmMode="user_called" 
              onRecordingComplete={handleRecordingComplete}
            />
          </div>

          <div className="flex flex-col gap-3 mt-[-5] max-h-[calc(100vh-325px)] overflow-y-auto custom-scrollbar">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="bg-purple-800/50 rounded-lg p-4 border-2 border-transparent hover:border-indigo-400/50 hover:bg-purple-800/70 hover:shadow-[0_0_15px_rgba(129,140,248,0.3)] transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold group-hover:bg-indigo-500 group-hover:shadow-[0_0_10px_rgba(129,140,248,0.5)] transition-all duration-200">
                    {friend.firstname[0]}{friend.lastname[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold group-hover:text-indigo-200 transition-colors duration-200">{friend.firstname} {friend.lastname}</h3>
                    <p className="text-sm text-indigo-300 group-hover:text-indigo-200 transition-colors duration-200">@{friend.username}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {leftDashBarState === "recording" && recordingUrl && (
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-white/10 rounded-lg backdrop-blur-sm border-2 border-transparent hover:border-indigo-400/30 hover:shadow-[0_0_20px_rgba(129,140,248,0.3)] transition-all duration-200">
            <h3 className="text-xl font-semibold mb-4">Your Recording</h3>
            <FancyRecording 
              audioSrc={recordingUrl}
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-4">
            <button
              onClick={friends.length === 0 ? () => setLeftDashBarState("listFriends") : handleSendRecording}
              className={`w-full bg-indigo-600 hover:bg-indigo-700 cursor-pointer text-white px-4 py-2 rounded-full font-semibold transition relative ${
                showSuccess ? 'bg-green-600 hover:bg-green-700' : ''
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
              ) : friends.length === 0 ? (
                "Add a Friend to Send Recordings"
              ) : (
                selectedFriendIds.length === 0 
                  ? `Send to All Friends` 
                  : `Send to ${selectedFriendIds.length} Selected Friend${selectedFriendIds.length === 1 ? '' : 's'}`
              )}
            </button>

            {friends.length > 0 && (
              <div className="max-h-[calc(100vh-400px)] overflow-y-auto custom-scrollbar">
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 p-2 hover:bg-purple-800/50 rounded-lg cursor-pointer border-2 border-transparent hover:border-indigo-400/50 hover:shadow-[0_0_15px_rgba(129,140,248,0.3)] transition-all duration-200 group"
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
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200
                      ${selectedFriendIds.includes(friend.id) 
                        ? 'bg-indigo-600 border-indigo-600 group-hover:shadow-[0_0_10px_rgba(129,140,248,0.5)]' 
                        : 'border-indigo-300 group-hover:border-indigo-400'}`}
                    >
                      {selectedFriendIds.includes(friend.id) && (
                        <div className="w-2 h-2 bg-white rounded-full" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold group-hover:text-indigo-200 transition-colors duration-200">{friend.firstname} {friend.lastname}</h3>
                      <p className="text-sm text-indigo-300 group-hover:text-indigo-200 transition-colors duration-200">@{friend.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {leftDashBarState === "listFriendRequests" && (
        <div className="flex flex-col gap-3 mt-[-15]">
          {friendRequests.length > 0 ? (
            friendRequests.map((request) => (
              <div
                key={request.from_user.id}
                className="bg-purple-800/50 rounded-lg p-4 border-2 border-indigo-400/30 hover:border-indigo-400 hover:bg-purple-800/70 hover:shadow-[0_0_15px_rgba(129,140,248,0.3)] transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-m font-bold">
                    {request.from_user.firstname?.[0]}{request.from_user.lastname?.[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {request.from_user.firstname} {request.from_user.lastname}
                    </h3>
                    <p className="text-sm text-indigo-300">@{request.from_user.username}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptFriendRequest(request.from_user.username)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold transition cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => declineFriendRequest(request.from_user.username)}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-indigo-300">
              No friend requests to display
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
