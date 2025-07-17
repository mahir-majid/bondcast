"use client";

import { useEffect, useState, useCallback } from "react";
import { HiUsers, HiMicrophone, HiPaperAirplane } from "react-icons/hi";
import ListFriendRequests from "./listFriendRequests";
import BondcastStudio from "./bondcastStudio";
import BondcastRecording from "./bondcastRecording";
import MessageBondi from "./messageBondi";
import MessageFriend from "./messageFriend";
import ListFriends from "./listFriends";
import SendBondcastRequest from "./sendBondcastRequest";
import GeneralBondcastRequest from "./generalBondcastRequest";

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

interface Topic {
  id: number;
  title: string;
  description: string;
}

type LeftDashBarState = "listFriends" | "listFriendRequests" | "recording" | "messageBondi" | "messageFriend" | "bondCastStudio" | "bondcastRecording" | "sendBondcastRequest" | "generalBondcastRequest";

interface LeftBarProps {
  user: {
    username: string;
    firstname: string;
  };
  onNavigateToTopics: () => void;
  onHideBrowseTopics: () => void;
  selectedTopic: Topic | null;
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

export default function LeftBar({ user, onNavigateToTopics, onHideBrowseTopics, selectedTopic }: LeftBarProps) {
  const baseURL = process.env.NEXT_PUBLIC_URL;
  const websocketURL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [leftDashBarState, setLeftDashBarState] = useState<LeftDashBarState>("listFriends");
  const [unreadAiMessages, setUnreadAiMessages] = useState(0);
  const [pendingBondcastRequests, setPendingBondcastRequests] = useState(0);
  const [isFriendsLoaded, setIsFriendsLoaded] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [selectedFriendForBondcast, setSelectedFriendForBondcast] = useState<Friend | null>(null);
  const [unreadFriendMessages, setUnreadFriendMessages] = useState<{[key: string]: number}>({});
  const [bondcastData, setBondcastData] = useState<{ title: string; description: string; requestId: number } | undefined>(undefined);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = scrollbarStyles;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);


  // Fetch initial unread AI messages count
  const fetchUnreadAiMessages = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const response = await fetch(`${baseURL}/api/ai-messages/conversation/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUnreadAiMessages(data.unread_count || 0);
      }
    } catch (error) {
      console.error('Error fetching unread AI messages:', error);
      console.log(unreadAiMessages);
    }
  }, [baseURL, unreadAiMessages]);

  // Fetch initial unread friend message counts
  const fetchUnreadFriendMessages = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const response = await fetch(`${baseURL}/api/friends/unread-counts/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Add +1 to compensate for timing issues with backend fetch
        const adjustedCounts: {[key: string]: number} = {};
        for (const [username, count] of Object.entries(data.unread_counts || {})) {
          adjustedCounts[username] = (count as number) + 1;
        }
        setUnreadFriendMessages(adjustedCounts);
      }
    } catch (error) {
      console.error('Error fetching unread friend messages:', error);
    }
  }, [baseURL]);

  // Fetch initial pending bondcast requests count
  const fetchPendingBondcastRequests = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const response = await fetch(`${baseURL}/api/bondcast-requests/pending/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Add +1 to compensate for timing issues with backend fetch (same as friends)
        setPendingBondcastRequests((data.pending_count || 0) + 1);
      }
    } catch (error) {
      console.error('Error fetching pending bondcast requests:', error);
    }
  }, [baseURL]);

  // WebSocket connection for friends and friend requests
  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    // Fetch initial unread counts
    fetchUnreadAiMessages();
    fetchUnreadFriendMessages();
    fetchPendingBondcastRequests();

    const socket = new WebSocket(`${websocketURL}/ws/friend-requests/?username=${user.username}&token=${token}`);

    socket.onopen = () => {
      console.log('[LeftBar] WebSocket connected for friends and friend requests');
      socket.send(JSON.stringify({ type: 'ping' }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[LeftBar] Received WebSocket message:', data);
        
        if (data && data.friend_requests && data.user_friends) {
          console.log('[LeftBar] Setting friends and friend requests');
          setFriends(data.user_friends);
          setFriendRequests(data.friend_requests);
          setIsFriendsLoaded(true);
        } else if (data && data.type === 'new_message') {
          // Handle new message notification
          console.log('[LeftBar] New message received:', data);
          const message = data.message;
          const senderUsername = message.sender_username;
          
          // Simple increment (duplicates will be handled by dividing by 2 in display)
          setUnreadFriendMessages(prevCounts => ({
            ...prevCounts,
            [senderUsername]: (prevCounts[senderUsername] || 0) + 1
          }));
        }
      } catch (error) {
        console.log('[LeftBar] Error parsing message:', error);
        setFriends([]);
        setFriendRequests([]);
      }
    };

    socket.onerror = (error) => {
      console.log('[LeftBar] WebSocket error:', error);
      setFriends([]);
      setFriendRequests([]);
    };

    socket.onclose = (event) => {
      console.log('[LeftBar] WebSocket closed with code:', event.code, 'reason:', event.reason);
      setFriends([]);
      setFriendRequests([]);
    };

    // Bondcast requests WebSocket connection
    const bondcastSocket = new WebSocket(`${websocketURL}/ws/bondcast-requests/${user.username}/${token}/`);

    bondcastSocket.onopen = () => {
      console.log('[LeftBar] WebSocket connected for bondcast requests');
    };

    bondcastSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[LeftBar] Received bondcast WebSocket message:', data);
        
        if (data && data.type === 'new_bondcast_request') {
          // Simple increment (duplicates will be handled by dividing by 2 in display, same as friends)
          setPendingBondcastRequests(prev => prev + 1);
        } else if (data && data.type === 'connection_established') {
          // Add +1 to compensate for timing issues (same as friends)
          setPendingBondcastRequests((data.pending_count || 0) + 1);
        } else if (data && data.type === 'requests_marked_seen') {
          // Clear the count when requests are marked as seen
          setPendingBondcastRequests(0);
        }
      } catch (error) {
        console.log('[LeftBar] Error parsing bondcast message:', error);
      }
    };

    bondcastSocket.onerror = (error) => {
      console.log('[LeftBar] Bondcast WebSocket error:', error);
    };

    bondcastSocket.onclose = (event) => {
      console.log('[LeftBar] Bondcast WebSocket closed with code:', event.code, 'reason:', event.reason);
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      if (bondcastSocket.readyState === WebSocket.OPEN) {
        bondcastSocket.close();
      }
    };
  }, [user, websocketURL, fetchUnreadAiMessages, fetchUnreadFriendMessages, fetchPendingBondcastRequests]);

  
  return (
    <aside className="relative w-96 bg-gradient-to-b from-blue-400 via-blue-500 to-blue-600 bg-opacity-90 rounded-xl p-6 flex flex-col gap-6 text-blue-900 shadow-lg">
      {leftDashBarState === "listFriends" && (
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-extrabold drop-shadow-2xl text-black">
            Friends
          </h2>
          <div className="relative flex items-center gap-4">
            <button
              aria-label="Record a BondCast"
              className="text-indigo-300 hover:text-white transition relative"
              onClick={() => setLeftDashBarState("bondCastStudio")}
            >
              <HiMicrophone
                size={22}
                className="mt-[6px] cursor-pointer text-indigo-200 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-200"
              />
              {Math.floor(pendingBondcastRequests / 2) > 0 && (
                <div className="absolute -top-2.5 -right-3 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                  {Math.floor(pendingBondcastRequests / 2)}
                </div>
              )}
            </button>
            {/* General Bondcast Request (Airplane Icon) */}
            <button
              aria-label="Send General Bondcast Request"
              className="text-indigo-300 hover:text-white transition relative"
              onClick={() => {
                setLeftDashBarState("generalBondcastRequest");
              }}
            >
              <HiPaperAirplane
                size={22}
                className="mt-[6px] cursor-pointer text-indigo-200 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-200"
              />
            </button>
            <button
              aria-label="View friend requests"
              className="text-indigo-300 hover:text-white transition relative"
              onClick={() => {
                setLeftDashBarState("listFriendRequests");
              }}
            >
              <HiUsers
                size={26}
                className="mt-[6px] cursor-pointer text-indigo-200 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-200"
              />
              {friendRequests.length > 0 && (
                <div className="absolute -top-2.5 -right-3 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                  {friendRequests.length}
                </div>
              )}
            </button>
          </div>
        </div>
      )}

      {leftDashBarState === "listFriends" && (
        <ListFriends
          friends={friends}
          isFriendsLoaded={isFriendsLoaded}
          unreadCounts={unreadFriendMessages}
          onAddFriend={async () => {
            // This will be handled by ListFriends component internally
          }}
          onRemoveFriend={async (friendUsername: string) => {
            // Remove friend from local state
            setFriends(prev => prev.filter(friend => friend.username !== friendUsername));
          }}
          onMessageFriend={(friend: Friend) => {
            setSelectedFriend(friend);
            setLeftDashBarState("messageFriend");
            // Clear unread count when opening chat
            setUnreadFriendMessages(prev => ({
              ...prev,
              [friend.username]: 0
            }));
          }}
          onSendBondcastRequest={(friend: Friend) => {
            setSelectedFriendForBondcast(friend);
            setLeftDashBarState("sendBondcastRequest");
          }}
        />
      )}

      {leftDashBarState === "listFriendRequests" && (
        <ListFriendRequests
          friendRequests={friendRequests}
          onBack={() => {
            setLeftDashBarState("listFriends");
          }}
          onAcceptRequest={(fromUsername: string) => {
        // Find the request before removing it
        const acceptedRequest = friendRequests.find(req => req.from_user.username === fromUsername);
        
        // Remove the accepted request from the list
        setFriendRequests(prev => prev.filter(req => req.from_user.username !== fromUsername));
        
        // Add the new friend to the friends list if we found the request
        if (acceptedRequest) {
          setFriends(prev => [...prev, {
            id: acceptedRequest.from_user.id,
            username: acceptedRequest.from_user.username,
            firstname: acceptedRequest.from_user.firstname,
            lastname: acceptedRequest.from_user.lastname
          }]);
        }
          }}
          onDeclineRequest={(fromUsername: string) => {
        // Remove the declined request from the list
        setFriendRequests(prev => prev.filter(req => req.from_user.username !== fromUsername));
          }}
        />
      )}

      {leftDashBarState === "bondCastStudio" && (
        <BondcastStudio
          friends={friends}
          onRecordingComplete={() => setLeftDashBarState("bondCastStudio")}
          onBack={() => {
            // Refresh bondcast request count when going back to ensure up-to-date data
            fetchPendingBondcastRequests();
            setLeftDashBarState("listFriends");
          }}
          onRecordingCancel={() => setLeftDashBarState("listFriends")}
          onStartRecording={(bondcastData) => {
            // Store the bondcast data and switch to recording
            if (bondcastData) {
              setBondcastData(bondcastData);
            }
            setLeftDashBarState("bondcastRecording");
          }}
          onClearBondcastCount={() => {
            // Clear the count when entering studio (will be refreshed when going back)
            setPendingBondcastRequests(0);
          }}
        />
      )}

      {leftDashBarState === "bondcastRecording" && (
        <BondcastRecording
          friends={friends}
          onRecordingComplete={() => setLeftDashBarState("bondcastRecording")}
          onBack={() => setLeftDashBarState("bondCastStudio")}
          onRecordingCancel={() => setLeftDashBarState("bondCastStudio")}
          bondcastData={bondcastData}
        />
      )}

      {leftDashBarState === "messageBondi" && (
        <MessageBondi
          user={user}
          onBack={() => setLeftDashBarState("listFriends")}
          onUnreadCountUpdate={setUnreadAiMessages}
        />
      )}

      {leftDashBarState === "messageFriend" && selectedFriend && (
        <MessageFriend
          user={user}
          friend={selectedFriend}
          setUnreadFriendMessages={setUnreadFriendMessages}
          onBack={() => {
            setSelectedFriend(null);
            // Refresh unread counts when going back to ensure up-to-date data
            fetchUnreadFriendMessages();
            setLeftDashBarState("listFriends");
          }}
        />
      )}

      {leftDashBarState === "sendBondcastRequest" && selectedFriendForBondcast && (
        <SendBondcastRequest
          friend={selectedFriendForBondcast}
          onBack={() => {
            setSelectedFriendForBondcast(null);
            setLeftDashBarState("listFriends");
            onHideBrowseTopics();
          }}
          onNavigateToTopics={onNavigateToTopics}
          selectedTopic={selectedTopic}
          allFriends={friends}
        />
      )}

      {leftDashBarState === "generalBondcastRequest" && (
        <GeneralBondcastRequest
          allFriends={friends}
          currentUser={user}
          onBack={() => setLeftDashBarState("listFriends")}
          onNavigateToTopics={onNavigateToTopics}
          selectedTopic={selectedTopic}
          onHideBrowseTopics={onHideBrowseTopics}
        />
      )}
    </aside>
  );
}
