import { useState, useEffect, useRef } from "react";
import { HiArrowLeft, HiMicrophone } from "react-icons/hi";

interface Friend {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
}

interface Topic {
  id: number;
  title: string;
  description: string;
}

interface GeneralBondcastRequestProps {
  allFriends: Friend[];
  currentUser: {
    firstname: string;
  };
  onBack: () => void;
  onNavigateToTopics: () => void;
  selectedTopic: Topic | null;
  onHideBrowseTopics: () => void;
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

export default function GeneralBondcastRequest({
  allFriends,
  onBack,
  onNavigateToTopics,
  selectedTopic,
  onHideBrowseTopics
}: GeneralBondcastRequestProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);
  const [sendMode, setSendMode] = useState<'all' | 'selected'>('all');
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);
  const [showFriendSelection, setShowFriendSelection] = useState(false);
  const baseURL = process.env.NEXT_PUBLIC_URL;

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = scrollbarStyles;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Handle selectedTopic changes
  useEffect(() => {
    if (selectedTopic) {
      setTitle(selectedTopic.title);
      setDescription(selectedTopic.description);
    }
  }, [selectedTopic]);

  // Automatically navigate to topics when component mounts, but only if no topic is selected and only once
  const hasNavigated = useRef(false);
  useEffect(() => {
    if (!hasNavigated.current && !selectedTopic) {
      onNavigateToTopics();
      hasNavigated.current = true;
    }
  }, [onNavigateToTopics, selectedTopic]);

  const handleBack = () => {
    setTitle("");
    setDescription("");
    setMessage("");
    setIsSuccess(null);
    setSendMode('all');
    setSelectedFriendIds([]);
    setShowFriendSelection(false);
    onBack();
    onHideBrowseTopics();
  };

  const handleSendModeChange = (mode: 'all' | 'selected') => {
    setSendMode(mode);
    if (mode === 'selected') {
      setShowFriendSelection(true);
    } else {
      setShowFriendSelection(false);
      setSelectedFriendIds([]);
    }
  };

  const getButtonText = () => {
    if (sendMode === 'all') {
      return `Send to All Friends`;
    } else {
      return selectedFriendIds.length === 0 
        ? 'Send to Selected Friends'
        : `Send to ${selectedFriendIds.length} Selected Friend${selectedFriendIds.length === 1 ? '' : 's'}`;
    }
  };

  const handleSendRequest = async () => {
    if (!title.trim() || !description.trim()) {
      setMessage("Please fill in both title and description");
      setIsSuccess(false);
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setMessage("You must be logged in to send a bondcast request");
      setIsSuccess(false);
      return;
    }

    setIsSending(true);
    try {
      // Determine recipients based on send mode
      let recipients: string[] = [];
      if (sendMode === 'all') {
        recipients = allFriends.map(f => f.username);
      } else {
        recipients = allFriends
          .filter(f => selectedFriendIds.includes(f.id))
          .map(f => f.username);
      }

      // Send to each recipient
      for (const recipientUsername of recipients) {
        const response = await fetch(`${baseURL}/api/bondcast-requests/create/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            recipient_username: recipientUsername,
            title: title.trim(),
            request_body: description.trim(),
            sender_type: 'user'
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Failed to send bondcast request to ${recipientUsername}`);
        }
      }

      setMessage("Bondcast request sent!");
      setIsSuccess(true);
      setTitle("");
      setDescription("");
      // Clear success message after 2 seconds and go back
      setTimeout(() => {
        onBack();
      }, 2000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "An error occurred while sending the request");
      setIsSuccess(false);
      // Clear error message after 3 seconds
      setTimeout(() => {
        setMessage("");
        setIsSuccess(null);
      }, 3000);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold drop-shadow-2xl text-black">
            BondCast Request
        </h2>
        <div className="relative flex items-center">
          <button
            onClick={handleBack}
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
        {/* Request Form */}
        <div className="flex-1 bg-blue-200/50 rounded-lg p-6 border-2 border-blue-400/30">
          <div className="space-y-4">
            <div>
              <label className="block text-blue-800 font-semibold mb-2">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title for your bondcast request"
                className="w-full px-4 py-3 rounded-lg border-2 border-blue-400/50 bg-white text-black placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all duration-200"
                maxLength={200}
              />
              <div className="text-right text-sm text-black mt-1">
                {title.length}/200
              </div>
            </div>

            <div>
              <label className="block text-blue-800 font-semibold mb-2">Description *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what kind of bondcast you'd like your friends to create..."
                rows={6}
                className="w-full px-4 py-3 rounded-lg border-2 border-blue-400/50 bg-white text-black placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all duration-200 resize-none"
                maxLength={1000}
              />
              <div className="text-right text-sm text-black mt-1">
                {description.length}/1000
              </div>
            </div>

            {/* Send Button */}
            <button
              onClick={handleSendRequest}
              disabled={isSending || (!title.trim() || !description.trim()) && !message}
              className={`w-full py-4 rounded-lg font-semibold text-lg transition-all duration-200 flex items-center justify-center gap-2 ${
                isSuccess
                  ? 'bg-green-600 hover:bg-green-600 text-white'
                  : message && !isSuccess
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : isSending || !title.trim() || !description.trim()
                  ? 'bg-purple-300 cursor-not-allowed text-gray-600'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white hover:shadow-xl hover:scale-105 transform active:scale-95'
              }`}
            >
              {isSuccess ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {message}
                </>
              ) : message && !isSuccess ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {message}
                </>
              ) : (
                <>
                  <HiMicrophone size={20} />
                  {getButtonText()}
                </>
              )}
            </button>

            {/* Send Mode Selection */}
            <div className="flex justify-center items-center space-x-8">
              {sendMode === 'all' ? (
                <button
                  onClick={() => handleSendModeChange('selected')}
                  className="text-blue-800 hover:text-blue-900 hover:underline transition-all duration-200 font-bold cursor-pointer text-xs"
                >
                  Select Friends to Send To
                </button>
              ) : (
                <button
                  onClick={() => handleSendModeChange('all')}
                  className="text-blue-800 hover:text-blue-900 hover:underline transition-all duration-200 font-bold cursor-pointer text-xs"
                >
                  Send to All Friends
                </button>
              )}
            </div>

            {/* Friend Selection Checklist */}
            {showFriendSelection && (
              <div className="max-h-[18vh] overflow-y-auto custom-scrollbar pr-4">
                <div className="flex flex-col gap-3">
                  {allFriends.map((friendItem) => (
                    <div
                      key={friendItem.id}
                      className="bg-blue-100/80 rounded-lg p-4 border-2 border-transparent hover:border-blue-400/50 hover:bg-blue-200/90 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all duration-200 cursor-pointer group flex items-center justify-between"
                      onClick={() => {
                        const selectedFriends = new Set(selectedFriendIds);
                        if (selectedFriends.has(friendItem.id)) {
                          selectedFriends.delete(friendItem.id);
                        } else {
                          selectedFriends.add(friendItem.id);
                        }
                        setSelectedFriendIds(Array.from(selectedFriends));
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-400 flex items-center justify-center text-lg font-bold text-white group-hover:bg-blue-500 group-hover:shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all duration-200">
                          {friendItem.firstname[0]}{friendItem.lastname[0]}
                        </div>
                        <div>
                          <h3 className="font-semibold text-blue-800 group-hover:text-blue-700 transition-colors duration-200">{friendItem.firstname} {friendItem.lastname}</h3>
                          <p className="text-sm text-black group-hover:text-black transition-colors duration-200">@{friendItem.username}</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200
                        ${selectedFriendIds.includes(friendItem.id) 
                          ? 'bg-blue-500 border-blue-500 group-hover:shadow-[0_0_10px_rgba(59,130,246,0.3)]' 
                          : 'border-blue-400 group-hover:border-blue-500'}`}
                      >
                        {selectedFriendIds.includes(friendItem.id) && (
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
      </div>
    </>
  );
}
