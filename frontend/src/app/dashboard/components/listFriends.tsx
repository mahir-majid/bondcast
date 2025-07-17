"use client";

import { useState, useEffect } from "react";
import { HiX } from "react-icons/hi";
import { BsChatFill } from "react-icons/bs";
import { HiPaperAirplane } from "react-icons/hi";

interface Friend {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
}

interface ListFriendsProps {
  friends: Friend[];
  isFriendsLoaded: boolean;
  unreadCounts: {[key: string]: number};
  onAddFriend: (username: string) => Promise<void>;
  onRemoveFriend: (friendUsername: string) => Promise<void>;
  onMessageFriend: (friend: Friend) => void;
  onSendBondcastRequest: (friend: Friend) => void;
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

export default function ListFriends({ 
  friends, 
  isFriendsLoaded, 
  unreadCounts,
  onRemoveFriend,
  onMessageFriend,
  onSendBondcastRequest
}: ListFriendsProps) {
  const [newFriend, setNewFriend] = useState("");
  const [newFriendMessage, setNewFriendMessage] = useState("");
  const [newFriendSuccess, setNewFriendSuccess] = useState<boolean | null>(null);
  const [isMessageVisible, setIsMessageVisible] = useState(false);
  const [showRemovePopup, setShowRemovePopup] = useState<number | null>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = scrollbarStyles;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showRemovePopup !== null) {
        setShowRemovePopup(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showRemovePopup]);

  const handleAddFriend = async () => {
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
      const baseURL = process.env.NEXT_PUBLIC_URL;
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
    } catch (error: unknown) {
      setNewFriendSuccess(false);
      const errorMessage = error instanceof Error ? error.message : "An error occurred while sending the friend request.";
      setNewFriendMessage(errorMessage);
      setIsMessageVisible(true);
      setTimeout(() => {
        setIsMessageVisible(false);
        setTimeout(() => {
          setNewFriendMessage("");
        }, 300);
      }, 1800);
    }
  };

  const handleRemoveFriend = async (friendUsername: string) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const baseURL = process.env.NEXT_PUBLIC_URL;
      const response = await fetch(`${baseURL}/api/friends/remove/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ friend_username: friendUsername }),
      });

      const data = await response.json();
      if (!data.error) {
        // Call the callback to update parent state
        await onRemoveFriend(friendUsername);
        setShowRemovePopup(null); // Close popup
      } else {
        console.error('Error removing friend:', data.error);
      }
    } catch (error) {
      console.error('Error removing friend:', error);
    }
  };


  return (
    <>
      <div className="flex gap-3 items-center mt-[-10px]">
        <input
          type="text"
          placeholder="Add New Friend By Username"
          value={newFriend}
          onChange={(e) => setNewFriend(e.target.value)}
          className="flex-1 rounded-full px-4 py-2 text-black border-2 border-blue-500/30 bg-blue-200/50 placeholder-black focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:bg-blue-200 transition-all duration-200"
        />
        <button
          onClick={handleAddFriend}
          className="bg-blue-900 hover:bg-blue-800 cursor-pointer text-white px-4 py-2 rounded-full font-semibold whitespace-nowrap transition"
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

      <div className="flex flex-col gap-3 mt-[0.2vh] max-h-[calc(100vh-325px)] overflow-y-auto custom-scrollbar pr-4">
        {!isFriendsLoaded ? (
          <div className="flex items-center justify-center h-[calc(100vh-400px)]">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : friends.length > 0 ? (
          friends.map((friend) => (
            <div
              key={friend.id}
              className="bg-blue-200/90 rounded-lg p-4 border-2 border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all duration-200 group relative"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div 
                      className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-lg font-bold text-white shadow-[0_0_10px_rgba(59,130,246,0.3)] cursor-pointer hover:bg-blue-600 transition-colors duration-200"
                      onClick={() => setShowRemovePopup(showRemovePopup === friend.id ? null : friend.id)}
                    >
                      {friend.firstname[0]}{friend.lastname[0]}
                    </div>
                    {showRemovePopup === friend.id && (
                      <button
                        onClick={() => handleRemoveFriend(friend.username)}
                        className="absolute -top-4 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600 transition-colors duration-200"
                        title="Remove Friend"
                      >
                        <HiX size={14} />
                      </button>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-blue-700">{friend.firstname} {friend.lastname}</h3>
                    <p className="text-sm text-black">@{friend.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-0">
                  <button
                    onClick={() => onSendBondcastRequest(friend)}
                    className="text-purple-500 hover:text-purple-700 transition-colors duration-200 p-0.5 cursor-pointer relative"
                    title="Send BondCast Request"
                  >
                    <HiPaperAirplane 
                      size={24} 
                    />
                  </button>
                  <button
                    onClick={() => onMessageFriend(friend)}
                    className="text-blue-500 hover:text-blue-900 transition-colors duration-200 p-3 cursor-pointer relative"
                    title="Message Friend"
                  >
                    <BsChatFill 
                      size={24} 
                    />
                    {unreadCounts[friend.username] > 0 && (
                      <div className="absolute top-0.5 right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {Math.floor(unreadCounts[friend.username] / 2)}
                      </div>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-gradient-to-br from-blue-400/20 via-purple-500/20 to-pink-400/20 backdrop-blur-sm rounded-xl p-6 border border-white/30 shadow-lg text-center relative overflow-hidden">
            {/* Animated background effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 animate-pulse"></div>
            
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/30 via-purple-500/30 to-pink-400/30 rounded-xl blur-xl opacity-50"></div>
            
            <div className="relative z-10">
              <div className="text-3xl mb-3 animate-bounce">🎙️</div>
              <p className="text-white font-bold text-lg drop-shadow-lg">
                Add a Friend to send your first BondCast!
              </p>
              <div className="mt-2 w-16 h-1 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full mx-auto"></div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
