"use client";

import { useEffect, useState, useCallback } from "react";
import { HiArrowLeft } from "react-icons/hi";

interface MessageBondiProps {
  user: {
    username: string;
    firstname: string;
  };
  onBack: () => void;
  onUnreadCountUpdate: (count: number) => void;
}

interface AIMessage {
  id: number;
  content: string;
  message_type: 'user' | 'ai';
  timestamp: string;
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

export default function MessageBondi({ 
  user, 
  onBack, 
  onUnreadCountUpdate 
}: MessageBondiProps) {
  const baseURL = process.env.NEXT_PUBLIC_URL;
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  const fetchAiMessages = useCallback(async () => {
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
        setAiMessages(data.messages || []);
        onUnreadCountUpdate(data.unread_count || 0);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching AI messages:', error);
      setIsLoading(false);
    }
  }, [baseURL, onUnreadCountUpdate]);

  const makeAIMessagesAsRead = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      await fetch(`${baseURL}/api/ai-messages/mark-read/`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      // Reset unread count to 0
      onUnreadCountUpdate(0);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [baseURL, onUnreadCountUpdate]);

  const sendMessageToBondi = async () => {
    if (!newMessage.trim()) return;
    
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    setIsSendingMessage(true);
    
    try {
      const response = await fetch(`${baseURL}/api/ai-messages/send/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content: newMessage.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        // Add the new messages to the conversation
        setAiMessages(prev => [...prev, data.user_message, data.ai_response]);
        setNewMessage("");
        
        // Mark the AI response as read since user is actively viewing it
        await makeAIMessagesAsRead();
      }
    } catch (error) {
      console.error('Error sending message to Bondi:', error);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Fetch messages when component mounts
  useEffect(() => {
    if (user) {
      makeAIMessagesAsRead(); // Mark messages as read when entering chat
      fetchAiMessages(); // Fetch messages when entering chat
    }
  }, [user, makeAIMessagesAsRead, fetchAiMessages]);

  // Scroll to bottom when messages load or new messages are added
  useEffect(() => {
    if (aiMessages.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 2);
    }
  }, [aiMessages]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold drop-shadow-2xl text-black">
          Message Bondi
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
              ) : aiMessages.length > 0 ? (
                <>
                  {aiMessages.map((message, index) => (
                    <div key={index} className={`flex flex-col ${message.message_type === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-black">
                          {message.message_type === 'user' ? user.firstname : 'Bondi'}
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
                        message.message_type === 'user' 
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
                    <div className="text-4xl mb-2">🤖</div>
                    <p>No messages yet</p>
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
            onKeyPress={(e) => e.key === 'Enter' && sendMessageToBondi()}
            placeholder="Type your message..."
            className="flex-1 rounded-lg px-3 py-2 text-black border-2 border-blue-500/30 bg-blue-200/50 placeholder-black focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:bg-blue-200 transition-all duration-200"
            disabled={isSendingMessage}
          />
          <button 
            onClick={sendMessageToBondi}
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
