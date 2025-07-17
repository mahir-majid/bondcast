"use client";

import { HiCheck, HiSparkles } from "react-icons/hi";
import { useState } from "react";

interface Topic {
  id: number;
  title: string;
  description: string;
}

interface BrowseTopicProps {
  isLoading: boolean;
  onTopicSelect: (topic: Topic) => void;
}

const sampleTopics: Topic[] = [
  {
    id: 1,
    title: "Time Travel",
    description: "Would you rather travel 100 years into the past or 100 years into the future? What would you do first and why?"
  },
  {
    id: 2,
    title: "Superpower Dilemma",
    description: "Would you rather be able to fly but only 2 feet off the ground, or be invisible but only when no one is looking at you?"
  },
  {
    id: 3,
    title: "Food for Thought",
    description: "Would you rather eat your favorite food for every meal but it's always cold, or eat food you hate but it's always perfectly cooked?"
  },
  {
    id: 4,
    title: "Money vs. Time",
    description: "Would you rather have unlimited money but only 24 hours to live, or live forever but be broke? What would you do with your choice?"
  },
  {
    id: 5,
    title: "Animal Transformation",
    description: "If you had to spend a day as any animal, which would you choose and what would be the first thing you'd do?"
  },
  {
    id: 6,
    title: "Dream Job Reality",
    description: "If you could have any job in the world but had to work 80 hours a week, would you take it? What would that job be?"
  },
  {
    id: 8,
    title: "Celebrity Swap",
    description: "If you had to switch lives with any celebrity for a week, who would you choose and what would be the most interesting part?"
  },
  {
    id: 9,
    title: "Weather Control",
    description: "If you could control the weather but only in your city, what would you do? Would you make it always sunny or mix it up?"
  },
  {
    id: 10,
    title: "Language Superpower",
    description: "Would you rather speak every language fluently but sound like a robot, or speak only your native language but have the most beautiful voice in the world?"
  },
];

export default function BrowseTopic({ isLoading, onTopicSelect }: BrowseTopicProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [topics, setTopics] = useState(sampleTopics);

  const handleGenerateMoreTopics = async () => {
    setIsGeneratingTopics(true);
    const token = localStorage.getItem("accessToken");
    const baseURL = process.env.NEXT_PUBLIC_URL;
    
    try {
      const response = await fetch(`${baseURL}/api/bondcast-requests/generate-topics/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTopics(data.topics);
      } else {
        console.error('Failed to generate topics');
      }
    } catch (error) {
      console.error('Error generating topics:', error);
    } finally {
      setIsGeneratingTopics(false);
    }
  };

  const handleSearchTopics = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchError("");
    const token = localStorage.getItem("accessToken");
    const baseURL = process.env.NEXT_PUBLIC_URL;
    
    try {
      const response = await fetch(`${baseURL}/api/bondcast-requests/generate-user-topics/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          search_query: searchQuery.trim()
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTopics(data.topics);
        setSearchQuery(""); // Clear search after successful search
      } else {
        const errorData = await response.json();
        setSearchError(errorData.error || 'Search failed');
      }
    } catch (error) {
      console.error('Error searching topics:', error);
      setSearchError('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchTopics();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2 mt-[-8]">Select a topic to get started with your BondCast request</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {topics.map((topic) => (
          <div
            key={topic.id}
            onClick={() => onTopicSelect(topic)}
            className="bg-white rounded-lg p-6 shadow-lg border-2 border-gray-200 hover:border-blue-400 hover:shadow-xl transition-all duration-200 cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors duration-200">
                {topic.title}
              </h3>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <HiCheck className="text-blue-600 w-5 h-5" />
              </div>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              {topic.description}
            </p>
          </div>
        ))}
      </div>

      {/* Bottom Section */}
      <div className="mt-8 flex flex-col items-center space-y-6">
        {/* Generate More Topics Button */}
        <button 
          onClick={handleGenerateMoreTopics}
          disabled={isGeneratingTopics}
          className={`mt-[10] flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg transition-all duration-200 hover:shadow-lg hover:scale-105 transform active:scale-95 ${
            isGeneratingTopics ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isGeneratingTopics ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <HiSparkles className="w-5 h-5" />
          )}
          {isGeneratingTopics ? 'Generating...' : 'Surprise Me with More Topics'}
        </button>

        {/* AI Search Section */}
        <div className="w-full max-w-md">
          <div className="flex gap-4 justify-center">
            <div className="flex gap-4 items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchError(""); // Clear error when user types
                }}
                onKeyPress={handleKeyPress}
                placeholder={searchError || "AI Powered Search"}
                className={`w-64 px-4 py-3 rounded-lg border-2 bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 text-cyan-100 placeholder-pink-300 placeholder-opacity-70 font-mono tracking-wider font-bold text-shadow-[0_0_8px_rgba(236,72,153,0.6)] text-center focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:shadow-[0_0_20px_rgba(251,191,36,0.3)] transition-all duration-300 backdrop-blur-sm ${
                  searchError 
                    ? 'border-red-400 placeholder-red-400' 
                    : 'border-amber-300 focus:border-amber-400'
                }`}
              />
              <button 
                onClick={handleSearchTopics}
                disabled={isSearching || !searchQuery.trim()}
                className={`px-4 py-3 rounded-lg font-semibold text-base transition-all duration-200 flex items-center gap-2 ${
                  !searchQuery.trim()
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed min-w-[80px]'
                    : isSearching
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white min-w-[120px]'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white hover:shadow-lg hover:scale-105 shadow-[0_0_15px_rgba(16,185,129,0.3)] min-w-[80px]'
                }`}
              >
              {isSearching ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <HiSparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
            </div>
          </div>
          <p className="text-center text-white text-xs mt-3 font-bold">
            {searchError ? 'Please write something appropriate' : 'Looking for something specific?'}
          </p>
        </div>
      </div>
    </div>
  );
}
