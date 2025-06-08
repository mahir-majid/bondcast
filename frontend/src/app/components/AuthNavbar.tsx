"use client";

import { useAuth } from "./AuthContext";
import { useState } from "react";

export default function AuthNavbar() {
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
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 sm:px-18 py-4 bg-gradient-to-b from-yellow-100 via-yellow-200 to-yellow-300 text-indigo-900 backdrop-blur-md shadow-lg font-serif">
      {/* Brand (non‑clickable when signed in) */}
      <span className="text-2xl sm:text-3xl font-extrabold tracking-tight cursor-default select-none text-amber-900">
        Bondiver
      </span>

      {/* Links shown when signed in */}
      <nav className="flex items-center space-x-6 sm:space-x-10 text-xl sm:text-2xl font-semibold text-amber-800">
        
        {/* Profile Icon and Card */}
        <div className="relative">
          <button
            onClick={() => setShowProfileCard(!showProfileCard)}
            className="w-12 h-12 cursor-pointer rounded-full bg-amber-800 text-yellow-100 flex items-center justify-center hover:bg-amber-900 transition-colors text-[18px]"
          >
            {user?.firstname?.[0]?.toUpperCase()}{user?.lastname?.[0]?.toUpperCase() || ''}
          </button>

          {/* Profile Card */}
          {showProfileCard && (
            <div className="absolute right-0 mt-3 w-80 bg-white rounded-xl shadow-2xl p-6 border border-amber-100">
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">
                    {user?.firstname} {user?.lastname}
                  </h3>
                  <p className="text-base text-gray-500">@{user?.username}</p>
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-base font-semibold">Email:</span>
                    <span className="text-gray-800 text-base">{user?.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-base font-semibold">Birth Date:</span>
                    <span className="text-gray-800 text-base">{user?.dob ? formatDate(user.dob) : 'N/A'}</span>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <button
                    onClick={logout}
                    className="w-full py-3 px-4 bg-amber-800 text-white rounded-lg hover:bg-amber-900 transition-colors font-semibold text-base shadow-sm cursor-pointer"
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