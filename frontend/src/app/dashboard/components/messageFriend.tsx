"use client";

import { useEffect, useState, useCallback } from "react";
import { HiArrowLeft } from "react-icons/hi";

interface MessageFriendProps {
  user: {
    username: string;
    firstname: string;
  };
  friend: {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
  };
  setUnreadFriendMessages: React.Dispatch<React.SetStateAction<{[key: string]: number}>>;
  onBack: () => void;
}

interface FriendMessage {
  id: number;
  content: string;
  sender_username: string;
  timestamp: string;
  conversation_id: number;
}

const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(153, 27, 27, 0.1);
    border-radius: 3px;
    margin: 2px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: linear-gradient(to bottom, #b91c1c, #991b1b);
    border-radius: 3px;
    border: 1px solid rgba(153, 27, 27, 0.2);
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(to bottom, #dc2626, #b91c1c);
  }
`;

export default function MessageFriend({ 
  user, 
  friend,
  setUnreadFriendMessages,
  onBack 
}: MessageFriendProps) {
  const baseURL = process.env.NEXT_PUBLIC_URL;
  const websocketURL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [shouldClearUnread, setShouldClearUnread] = useState(false);

  const scrollToBottom = () => {
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = scrollbarStyles;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const fetchMessages = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`${baseURL}/api/friends/conversation/${friend.username}/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setIsLoading(false);
        
        // Mark messages as read when conversation is opened
        if (data.messages && data.messages.length > 0) {
          // Try to get conversation_id from the conversation object first, then from first message
          const conversationId = data.id || data.messages[0]?.conversation_id;
          if (conversationId) {
            console.log('[MessageFriend] Marking existing messages as read:', conversationId);
            markMessageAsRead(conversationId);
            setShouldClearUnread(true);
          }
        }
      } else {
        console.error('Failed to fetch messages:', response.status);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      setIsLoading(false);
    }
  }, [baseURL, friend.username]);

  const markMessageAsRead = useCallback(async (conversationId: number) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      await fetch(`${baseURL}/api/friends/mark-read/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          conversation_id: conversationId
        }),
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }, [baseURL]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    setIsSendingMessage(true);
    
    try {
      const response = await fetch(`${baseURL}/api/friends/send/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          to_username: friend.username,
          content: newMessage.trim() 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Add the new message to the conversation
        setMessages(prev => [...prev, data.message]);
        setNewMessage("");
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // WebSocket connection for real-time messages
  useEffect(() => {
    if (!user || !friend) return;

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const socket = new WebSocket(`${websocketURL}/ws/friend-requests/?username=${user.username}&token=${token}`);

    socket.onopen = () => {
      console.log('[MessageFriend] WebSocket connected for real-time messages');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[MessageFriend] Received WebSocket message:', data);
        
        if (data && data.type === 'new_message') {
          const message = data.message;
          // Only add message if it's from the current friend and not already in the list
          if (message.sender_username === friend.username) {
            setMessages(prev => {
              // Check if message already exists (by id or content + timestamp)
              const messageExists = prev.some(existingMsg => 
                existingMsg.id === message.id || 
                (existingMsg.content === message.content && 
                 existingMsg.timestamp === message.timestamp)
              );
              
              if (!messageExists) {
                // Mark the new message as read since user is actively viewing the conversation
                // Get conversation ID from the first message or fetch it
                const conversationId = prev[0]?.conversation_id || data.conversation_id;
                if (conversationId) {
                  console.log('[MessageFriend] Marking message as read:', conversationId);
                  markMessageAsRead(conversationId);
                  // Set flag to clear unread count in useEffect
                  setShouldClearUnread(true);
                }
                return [...prev, message];
              }
              return prev;
            });
          }
        }
      } catch (error) {
        console.log('[MessageFriend] Error parsing message:', error);
      }
    };

    socket.onerror = (error) => {
      console.log('[MessageFriend] WebSocket error:', error);
    };

    socket.onclose = (event) => {
      console.log('[MessageFriend] WebSocket closed with code:', event.code, 'reason:', event.reason);
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [user, friend, websocketURL, markMessageAsRead]);

  // Fetch messages when component mounts
  useEffect(() => {
    if (user && friend) {
      fetchMessages();
    }
  }, [user, friend, fetchMessages]);

  // Scroll to bottom when messages load or new messages are added
  useEffect(() => {
    if (messages.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 2);
    }
  }, [messages]);

  // Handle clearing unread counts when messages are marked as read
  useEffect(() => {
    if (shouldClearUnread) {
      setUnreadFriendMessages(prev => ({
        ...prev,
        [friend.username]: 0
      }));
      setShouldClearUnread(false);
    }
  }, [shouldClearUnread, friend.username, setUnreadFriendMessages]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold drop-shadow-2xl text-black">
          Message {friend.firstname}
        </h2>
        <div className="relative flex items-center">
          <button
            onClick={onBack}
            className="text-indigo-300 hover:text-white transition"
          >
            <HiArrowLeft
              size={26}
              className="mt-[6px] cursor-pointer text-indigo-200 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-200"
            />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-[-7px] h-full">
        <div className="bg-blue-200/50 rounded-lg border-2 border-blue-400/30 h-[83vh] flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 pl-4 pt-4 pb-4 messages-container">
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length > 0 ? (
                <>
                  {messages.map((message, index) => (
                    <div key={index} className={`flex flex-col ${message.sender_username === user.username ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-black">
                          {message.sender_username === user.username ? user.firstname : friend.firstname}
                        </span>
                        <span className="text-xs text-black">
                          {new Date(message.timestamp).toLocaleTimeString('en-US', { 
                            hour: 'numeric', 
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                      </div>
                      <div className={`rounded-lg p-3 max-w-[80%] ${
                        message.sender_username === user.username
                          ? 'bg-purple-600 text-white' 
                          : 'bg-blue-600 text-white'
                      }`}>
                        <p className="text-sm">{message.content}</p>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="flex justify-center items-center h-full">
                  <div className="text-center text-gray-600">
                    <div className="text-4xl mb-2">💬</div>
                    <p>No messages yet</p>
                    <p className="text-sm">Start a conversation with {friend.firstname}!</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
            className="flex-1 rounded-lg px-3 py-2 text-black border-2 border-blue-500/30 bg-blue-200/50 placeholder-black focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:bg-blue-200 transition-all duration-200"
            disabled={isSendingMessage}
          />
          <button 
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            className="bg-blue-900 hover:bg-blue-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold"
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}
