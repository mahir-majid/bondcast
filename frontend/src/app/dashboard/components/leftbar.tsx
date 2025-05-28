"use client";

import { useEffect, useState, useRef } from "react";
import { HiMail, HiArrowLeft } from "react-icons/hi";

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

type LeftDashBarState = "listFriends" | "listFriendRequests";

interface LeftBarProps {
  user: {
    username: string;
    firstname: string;
  };
}

export default function LeftBar({ user }: LeftBarProps) {
  const baseURL = process.env.NEXT_PUBLIC_URL;
  const websocketURL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
  const [newFriend, setNewFriend] = useState("");
  const [newFriendMessage, setNewFriendMessage] = useState("");
  const [newFriendSuccess, setNewFriendSuccess] = useState<boolean | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [leftDashBarState, setLeftDashBarState] = useState<LeftDashBarState>("listFriends");
  const wsRef = useRef<WebSocket | null>(null);

  const connectToFriendRequests = () => {
    if (!user) return;

    // Create new WebSocket connection with username
    const socket = new WebSocket(`${websocketURL}/ws/friend-requests/?username=${user.username}`);

    socket.onopen = () => {
      console.log('Connected to friend requests WebSocket');
      // Send a proper JSON message
      socket.send(JSON.stringify({ type: 'ping' }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Friend Requests:', data.friend_requests);
        console.log('Friends:', data.user_friends);
        
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
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setNewFriendMessage("You must be logged in to send a friend request.");
      setNewFriendSuccess(false);
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
      console.log(data);

      if (!data.error) {
        setNewFriendMessage("Friend request sent successfully!");
        setNewFriendSuccess(true);
        setNewFriend(""); // Clear the input field
      } else {
        setNewFriendSuccess(false);
        console.log(data.error);
        const errorMessage = data.error || "Failed to send friend request.";
        setNewFriendMessage(errorMessage);
      }
    } catch (error) {
      setNewFriendMessage("An error occurred while sending the friend request.");
      setNewFriendSuccess(false);
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

  return (
    <aside className="w-96 bg-gradient-to-b from-purple-900 via-purple-800 to-purple-700 bg-opacity-80 rounded-xl p-6 flex flex-col gap-6 min-h-[calc(100vh-72px)] relative text-white shadow-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold mb-2 cursor-pointer text-blue-300">
          {leftDashBarState === "listFriends" ? "Friends" : "Friend Requests"}
        </h2>
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
      </div>

      {leftDashBarState === "listFriends" && (
        <div>
          <div className="flex gap-3 items-center mt-[-10px]">
            <input
              type="text"
              placeholder="Add New Friend..."
              value={newFriend}
              onChange={(e) => setNewFriend(e.target.value)}
              className="flex-1 rounded-full px-4 py-2 text-white border border-white bg-purple-800 placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
            />
            <button
              onClick={addFriend}
              className="bg-indigo-600 hover:bg-indigo-700 cursor-pointer text-white px-4 py-2 rounded-full font-semibold whitespace-nowrap transition"
            >
              Send
            </button>
          </div>

          <p className="text-s text-white mt-7 flex items-start gap-1">
            <span className="text-black">•</span>
            <span>
              Enter either username <span className="italic">OR</span> first and last name
            </span>
          </p>
        </div>
      )}

      {leftDashBarState === "listFriends" ? (
        <div className="flex flex-col gap-3 mt-[-5]">
          {friends.map((friend) => (
            <div
              key={friend.id}
              className="bg-purple-800/50 rounded-lg p-4 hover:bg-purple-800/70 transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold">
                  {friend.firstname[0]}{friend.lastname[0]}
                </div>
                <div>
                  <h3 className="font-semibold">{friend.firstname} {friend.lastname}</h3>
                  <p className="text-sm text-indigo-300">@{friend.username}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-4">
          {friendRequests.length > 0 ? (
            friendRequests.map((request) => (
              <div
                key={request.from_user.id}
                className="bg-purple-800/50 rounded-lg p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold">
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
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold transition"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => declineFriendRequest(request.from_user.username)}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition"
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

      {newFriendMessage && (
        <div className="relative self-end -mt-2 mr-1">
          <div
            className={`z-3 absolute right-20 bottom-full mb-[7.5rem] max-w-[1200px] w-auto rounded-lg px-4 py-2 text-sm shadow-lg text-white ${
              newFriendSuccess ? "bg-green-600" : "bg-red-600"
            }`}
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
    </aside>
  );
}
