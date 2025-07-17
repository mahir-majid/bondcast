"use client";

import { useState, useEffect, useCallback } from "react";
import { HiArrowLeft, HiMicrophone } from "react-icons/hi";

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

interface Friend {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
}

interface BondcastRequest {
  id: number;
  sender_type: 'user' | 'ai';
  sender_name: string;
  display_sender_name: string;
  title: string;
  request_body: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  created_at: string;
}

interface BondcastStudioProps {
  friends: Friend[];
  onBack: () => void;
  onRecordingComplete: (url: string) => void;
  onRecordingCancel: () => void;
  onStartRecording: (bondcastData?: { title: string; description: string; requestId: number }) => void;
  onClearBondcastCount?: () => void;
}

export default function BondcastStudio({  
  onBack, 
  onStartRecording,
  onClearBondcastCount
}: BondcastStudioProps) {
  const [pendingRequests, setPendingRequests] = useState<BondcastRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [isConfiguringIntro, setIsConfiguringIntro] = useState(false);
  const baseURL = process.env.NEXT_PUBLIC_URL;
  const websocketURL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = scrollbarStyles;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Mark bondcast requests as seen
  const markRequestsAsSeen = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      await fetch(`${baseURL}/api/bondcast-requests/mark-seen/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
    } catch (error) {
      console.error('Error marking bondcast requests as seen:', error);
      console.error('Pending Count:', pendingCount);
    }
  }, [baseURL, pendingCount]);

  // Configure Bondi intro based on selected bondcast request
  const configureBondiIntro = async () => {
    if (!selectedRequestId) return;
    
    const selectedRequest = pendingRequests.find(req => req.id === selectedRequestId);
    if (!selectedRequest) return;

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      setIsConfiguringIntro(true);
      const response = await fetch(`${baseURL}/api/bondcast-convos/generate-greeting/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          podcast_description: selectedRequest.request_body
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Bondi intro configured successfully:', data.greeting);
        // The intro is now cached and ready for the recording session
      } else {
        console.error('Error configuring Bondi intro:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error configuring Bondi intro:', error);
    } finally {
      setIsConfiguringIntro(false);
    }
  };

  // Handle Make BondCast button click
  const handleMakeBondCast = async () => {
    if (selectedRequestId === null) return;
    
    // First configure Bondi's intro based on the selected request
    await configureBondiIntro();
    
    // Get the selected request data
    const selectedRequest = pendingRequests.find(req => req.id === selectedRequestId);
    
    // Then start the recording process with bondcast data
    onStartRecording(selectedRequest ? { 
      title: selectedRequest.title, 
      description: selectedRequest.request_body,
      requestId: selectedRequest.id
    } : undefined);
  };

  // Reject bondcast request
  const rejectBondcastRequest = async (requestId: number) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const response = await fetch(`${baseURL}/api/bondcast-requests/${requestId}/reject/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Remove the rejected request from the frontend
        setPendingRequests(prev => prev.filter(request => request.id !== requestId));
        
        // If this was the selected request, clear the selection
        if (selectedRequestId === requestId) {
          setSelectedRequestId(null);
        }
        
        console.log('Bondcast request rejected successfully');
      } else {
        console.error('Error rejecting bondcast request:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error rejecting bondcast request:', error);
    }
  };

  // Fetch pending bondcast requests
  const fetchPendingRequests = useCallback(async () => {
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
        console.log('[BondcastStudio] Fetched pending requests:', data);
        setPendingRequests(data.requests || []);
        setPendingCount(data.pending_count || 0); // This is for notifications
      } else {
        console.error('Error fetching pending requests:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching pending bondcast requests:', error);
    } finally {
      setIsLoading(false);
    }
  }, [baseURL]);

  // WebSocket connection for real-time bondcast requests
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    // Get the current user's username from localStorage or use a default
    const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
    const username = currentUser.username || 'user';

    const socket = new WebSocket(`${websocketURL}/ws/bondcast-requests/${username}/${token}/`);

    socket.onopen = () => {
      console.log('[BondcastStudio] WebSocket connected for bondcast requests');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[BondcastStudio] Received WebSocket message:', data);
        
        if (data && data.type === 'new_bondcast_request') {
          // Add new request to the list
          setPendingRequests(prev => [data.request, ...prev]);
          setPendingCount(prev => prev + 1);
          // Mark the new request as seen since user is actively viewing the studio (like messageFriend does for new messages)
          markRequestsAsSeen();
        } else if (data && data.type === 'connection_established') {
          // Don't override the count from API fetch - just use it as backup
          if (pendingRequests.length === 0) {
            setPendingCount(data.pending_count || 0);
          }
        }
      } catch (error) {
        console.log('[BondcastStudio] Error parsing message:', error);
      }
    };

    socket.onerror = (error) => {
      console.log('[BondcastStudio] WebSocket error:', error);
    };

    socket.onclose = (event) => {
      console.log('[BondcastStudio] WebSocket closed with code:', event.code, 'reason:', event.reason);
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [websocketURL, markRequestsAsSeen, pendingRequests.length]);

  // Fetch initial pending requests
  useEffect(() => {
    // Small delay to ensure WebSocket connection is established first
    const timer = setTimeout(() => {
      fetchPendingRequests();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [fetchPendingRequests]);

  // Mark requests as seen when entering studio (similar to messageFriend marking messages as read)
  useEffect(() => {
    // Mark requests as seen when component mounts (like messageFriend does when opening conversation)
    // Only mark as seen after we've fetched the initial data to avoid race conditions
    if (!isLoading && pendingRequests.length > 0) {
      markRequestsAsSeen();
    }
  }, [isLoading, pendingRequests.length, markRequestsAsSeen]); // Run when loading completes and we have requests

  // Clear bondcast request count when entering studio (similar to messageFriend)
  useEffect(() => {
    if (onClearBondcastCount) {
      onClearBondcastCount();
    }
  }, [onClearBondcastCount]);

  // No need for interval refetching - WebSocket handles real-time updates

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold drop-shadow-2xl text-black">
          BondCast Studio
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
        {/* Make BondCast Button */}
        <div className="bg-blue-200/50 rounded-lg p-4 border-2 border-blue-400/30">
          <button
            onClick={handleMakeBondCast}
            disabled={selectedRequestId === null || isConfiguringIntro}
            className={`w-full px-6 py-3 rounded-lg font-semibold text-lg transition-all duration-200 ${
              selectedRequestId === null || isConfiguringIntro
                ? 'bg-purple-300 cursor-not-allowed text-gray-600'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white hover:shadow-xl hover:scale-105 transform active:scale-95'
            }`}
          >
            {isConfiguringIntro ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Configuring BondCast...</span>
              </div>
            ) : (
              "Make BondCast"
            )}
          </button>
        </div>

        {/* Pending Requests List */}
        {isLoading ? (
          <div className="flex-1 bg-blue-200/50 rounded-lg p-8 border-2 border-blue-400/30 max-h-[79vh] flex flex-col items-center justify-center">
            <div className="text-center flex flex-col items-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <h3 className="text-xl font-bold text-blue-800">Loading requests...</h3>
            </div>
          </div>
        ) : pendingRequests.length > 0 ? (
          <div className="flex-1 bg-blue-200/50 rounded-lg p-4 border-2 border-blue-400/30 max-h-[79vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-xl font-bold text-blue-800 mb-4">Pending BondCast Requests</h3>
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <div key={request.id} className="bg-white rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-blue-800">{request.title}</h4>
                    <span className="text-sm text-gray-500">
                      {new Date(request.created_at).toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit',
                        hour12: true
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{request.request_body}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        From: {request.display_sender_name}
                      </span>
                      <button
                        onClick={() => rejectBondcastRequest(request.id)}
                        className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedRequestId(selectedRequestId === request.id ? null : request.id)}
                        className="px-3 py-1 bg-green-500 text-black text-xs rounded hover:bg-green-600 transition-colors"
                      >
                        Select
                      </button>
                      <div 
                        onClick={() => setSelectedRequestId(selectedRequestId === request.id ? null : request.id)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all duration-200 ${
                          selectedRequestId === request.id 
                            ? 'bg-blue-500 border-blue-500' 
                            : 'border-blue-400 hover:border-blue-500'
                        }`}
                      >
                        {selectedRequestId === request.id && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-blue-200/50 rounded-lg p-8 border-2 border-blue-400/30 max-h-[80vh] flex flex-col items-center justify-center">
            <div className="text-center">
              <div className="mb-6">
                <HiMicrophone 
                  size={64} 
                  className="mx-auto text-gray-500 mb-4"
                />
                <h3 className="text-2xl font-bold text-gray-600 mb-2">
                  No Incoming Requests
                </h3>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
