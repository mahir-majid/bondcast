"use client";

import { useEffect } from "react";
import { HiArrowLeft } from "react-icons/hi";

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

interface ListFriendRequestsProps {
  friendRequests: FriendRequest[];
  onBack: () => void;
  onAcceptRequest: (fromUsername: string) => void;
  onDeclineRequest: (fromUsername: string) => void;
}

const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 12px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(153, 27, 27, 0.2);
    border-radius: 8px;
    margin: 4px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: linear-gradient(to bottom, #b91c1c, #991b1b);
    border-radius: 8px;
    border: 2px solid rgba(153, 27, 27, 0.2);
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(to bottom, #dc2626, #b91c1c);
  }
`;

export default function ListFriendRequests({ 
  friendRequests, 
  onBack, 
  onAcceptRequest,
  onDeclineRequest
}: ListFriendRequestsProps) {
  const baseURL = process.env.NEXT_PUBLIC_URL;

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = scrollbarStyles;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

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
        onAcceptRequest(fromUsername);
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
        onDeclineRequest(fromUsername);
      }
    } catch (error) {
      console.log('Error declining friend request:', error);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold drop-shadow-2xl text-black">
          Friend Requests
        </h2>
        <div className="relative flex items-center">
          <button
            aria-label="Back to friends"
            className="text-indigo-300 hover:text-white transition"
            onClick={onBack}
          >
            <HiArrowLeft
              size={26}
              className="mt-[6px] cursor-pointer text-indigo-200 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-200"
            />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-[-7px] max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar pr-4">
        {friendRequests.length > 0 ? (
          friendRequests.map((request) => (
            <div
              key={request.from_user.id}
              className="bg-blue-200/50 rounded-lg p-4 border-2 border-blue-500/30 hover:border-blue-500 hover:bg-blue-300/70 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all duration-200"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-m font-bold text-white">
                  {request.from_user.firstname?.[0]}{request.from_user.lastname?.[0]}
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900">
                    {request.from_user.firstname} {request.from_user.lastname}
                  </h3>
                  <p className="text-sm text-black">@{request.from_user.username}</p>
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
          <div className="mt-[5px] text-center text-black text-lg">
            No friend requests to display
          </div>
        )}
      </div>
    </>
  );
}
