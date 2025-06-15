"use client";

import { useState, useRef, useEffect } from 'react';
import { HiRefresh } from 'react-icons/hi';

interface FancyRecordingProps {
  recordingId?: number;
  audioSrc?: string;
  sender?: {
    firstname: string;
    lastname: string;
    username: string;
  };
  title?: string;
  showSender?: boolean;
  className?: string;
  onPlay?: () => void;
}

export default function FancyRecording({ recordingId, audioSrc, sender, title, showSender = false, className = '', onPlay }: FancyRecordingProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const baseURL = process.env.NEXT_PUBLIC_URL;

  // Load audio URL when needed
  const loadAudio = async () => {
    if (audioUrl || audioSrc) return; // Already loaded or using direct URL
    
    setIsLoading(true);
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) return;

      const response = await fetch(`${baseURL}/api/recordings/get-audio/${recordingId}/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAudioUrl(data.audio_url);
        // Audio will automatically play once loaded due to the useEffect
      } else {
        console.error('Failed to load audio');
      }
    } catch (error) {
      console.error('Error loading audio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize audio when URL is loaded
  useEffect(() => {
    if (!audioUrl && !audioSrc) return;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = audioUrl || audioSrc || '';  // Ensure src is always a string
    audio.load();
    audioRef.current = audio;

    // Auto-play when audio is loaded
    if (audioUrl) {
      audio.play().catch(error => {
        console.error('Error auto-playing audio:', error);
      });
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [audioUrl, audioSrc]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => {
      setIsPlaying(true);
      onPlay?.();
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl, onPlay]);

  const togglePlay = async () => {
    if (!audioUrl) {
      await loadAudio();
    }
    
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  const restart = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  return (
    <div className={`relative group ${className}`}>
      <div className="flex flex-col items-center gap-2">
        {showSender && sender && (
          <div className="text-sm text-indigo-300">
            From: {sender.firstname} {sender.lastname} (@{sender.username})
          </div>
        )}
        <h3 className="text-lg font-semibold text-indigo-900 text-center">{title}</h3>
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className={`w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-400 flex items-center justify-center hover:from-amber-600 hover:to-orange-500 transition-all duration-200 hover:shadow-[0_0_15px_rgba(251,191,36,0.5)] active:scale-95 cursor-pointer ${
              isLoading ? 'opacity-50 cursor-wait' : ''
            }`}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <div className="w-5 h-5 bg-white rounded-sm" />
            ) : (
              <div className="w-0 h-0 border-t-10 border-t-transparent border-l-16 border-l-white border-b-10 border-b-transparent ml-1" />
            )}
          </button>

          <button
            onClick={restart}
            disabled={isLoading || (!audioUrl && !audioSrc)}
            className={`w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-400 flex items-center justify-center hover:from-amber-600 hover:to-orange-500 transition-all duration-200 hover:shadow-[0_0_15px_rgba(251,191,36,0.5)] active:scale-95 cursor-pointer ${
              (isLoading || (!audioUrl && !audioSrc)) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <HiRefresh className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}