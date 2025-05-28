"use client";

import { useAuth } from "./AuthContext";
import Link from "next/link";
import { useState } from "react";

export default function AuthNavbar() {
  const { user, loading, logout } = useAuth();
  const [showProfileCard, setShowProfileCard] = useState(false);

  // Function to format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 sm:px-18 py-5 bg-gradient-to-b from-yellow-100 via-yellow-200 to-yellow-300 text-indigo-900 backdrop-blur-md shadow-lg font-serif">
      {/* Brand (non‑clickable when signed in) */}
      <span className="text-2xl sm:text-3xl font-extrabold tracking-tight cursor-default select-none text-amber-900">
        Bondiver
      </span>

      {/* Links shown when signed in */}
      <nav className="flex items-center space-x-6 sm:space-x-10 text-xl sm:text-2xl font-semibold text-amber-800">
        <Link
          href="/daily-chat"
          className="hover:underline hover:text-amber-900 transition-colors"
        >
          Daily Chat
        </Link>
        <Link
          href="/dashboard"
          className="hover:underline hover:text-amber-900 transition-colors"
        >
          Dashboard
        </Link>
        
        {/* Profile Icon and Card */}
        <div className="relative">
          <button
            onClick={() => setShowProfileCard(!showProfileCard)}
            className="w-10 h-10 cursor-pointer rounded-full bg-amber-800 text-yellow-100 flex items-center justify-center hover:bg-amber-900 transition-colors"
          >
            {user?.firstname?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || '?'}
          </button>

          {/* Profile Card */}
          {showProfileCard && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl p-4 border border-amber-200">
              <div className="space-y-3">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-amber-800 text-yellow-100 flex items-center justify-center text-2xl mx-auto mb-2">
                    {user?.firstname?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    {user?.firstname} {user?.lastname}
                  </h3>
                  <p className="text-sm text-gray-600">@{user?.username}</p>
                </div>

                <div className="border-t border-gray-200 pt-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email:</span>
                    <span className="text-gray-800">{user?.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Birth Date:</span>
                    <span className="text-gray-800">{user?.dob ? formatDate(user.dob) : 'N/A'}</span>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-3">
                  <button
                    onClick={logout}
                    className="w-full cursor-pointer py-2 px-4 bg-amber-800 text-white rounded hover:bg-amber-900 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}