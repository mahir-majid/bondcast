"use client";

import { useAuth } from "./AuthContext";
import { useState } from "react";

export default function ProfileCard() {
  const { user, logout } = useAuth();
  const [showProfileCard, setShowProfileCard] = useState(false);

  // Function to format date
  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const localDate = new Date(year, month - 1, day); // months are 0-indexed
    return localDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed top-6 right-8 z-50">
      <div className="relative">
        <button
          onClick={() => setShowProfileCard(!showProfileCard)}
          className="flex items-center space-x-3 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 border border-white/30 hover:bg-white/30 transition-all duration-300 group shadow-lg"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-lg">
            {user?.firstname?.[0]?.toUpperCase()}{user?.lastname?.[0]?.toUpperCase() || ''}
          </div>
          <span className="text-black font-medium text-sm hidden sm:block">
            {user?.firstname} {user?.lastname}
          </span>
          <svg className={`w-4 h-4 text-white/70 transition-transform duration-300 ${showProfileCard ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Profile Card */}
        {showProfileCard && (
          <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl p-6 border-2 border-gray-200">
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                  <span className="text-white font-bold text-xl">
                    {user?.firstname?.[0]?.toUpperCase()}{user?.lastname?.[0]?.toUpperCase() || ''}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-1">
                  {user?.firstname} {user?.lastname}
                </h3>
                <p className="text-gray-600 text-sm">@{user?.username}</p>
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-gray-600 text-sm font-medium">Email:</span>
                  <span className="text-gray-800 text-sm">{user?.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-gray-600 text-sm font-medium">Birth Date:</span>
                  <span className="text-gray-800 text-sm">{user?.dob ? formatDate(user.dob) : 'N/A'}</span>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <button
                  onClick={logout}
                  className="w-full py-3 px-4 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white rounded-xl transition-all duration-300 font-semibold text-sm shadow-lg hover:shadow-xl hover:shadow-red-500/25 transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 