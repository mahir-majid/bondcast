"use client";

import { useState, useRef, useEffect } from 'react';
import { HiRefresh } from 'react-icons/hi';

interface FancySendRecordingProps {
  audioSrc: string;
  className?: string;
}

export default function FancySendRecording({ audioSrc, className = '' }: FancySendRecordingProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio when URL is loaded
  useEffect(() => {
    if (!audioSrc) return;

    const audio = new Audio(audioSrc);
    audio.preload = 'auto';
    audioRef.current = audio;

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [audioSrc]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
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
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-400 flex items-center justify-center hover:from-amber-600 hover:to-orange-500 transition-all duration-200 hover:shadow-[0_0_15px_rgba(251,191,36,0.5)] active:scale-95 cursor-pointer"
          >
            {isPlaying ? (
              <div className="w-5 h-5 bg-white rounded-sm" />
            ) : (
              <div className="w-0 h-0 border-t-10 border-t-transparent border-l-16 border-l-white border-b-10 border-b-transparent ml-1" />
            )}
          </button>

          <button
            onClick={restart}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-400 flex items-center justify-center hover:from-amber-600 hover:to-orange-500 transition-all duration-200 hover:shadow-[0_0_15px_rgba(251,191,36,0.5)] active:scale-95 cursor-pointer"
          >
            <HiRefresh className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
