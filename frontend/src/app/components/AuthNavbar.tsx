"use client";

import { useAuth } from "./AuthContext";
import Link from "next/link";

export default function AuthNavbar() {
  const { user, loading, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 sm:px-18 py-5 bg-gradient-to-b from-yellow-100 via-yellow-200 to-yellow-300 text-indigo-900 backdrop-blur-md shadow-lg font-serif">
      {/* Brand (non‑clickable when signed in) */}
      <span className="text-2xl sm:text-3xl font-extrabold tracking-tight cursor-default select-none text-amber-900">
        Bondiver
      </span>

      {/* Links shown when signed in */}
      <nav className="space-x-6 sm:space-x-10 text-xl sm:text-2xl font-semibold text-amber-800">
        
        <Link
          href="/daily-chat"
          className="hover:underline hover:text-amber-900 transition-colors"
        >
          Daily Chat
        </Link>
        <Link
          href="/dashboard"
          className="hover:underline hover:text-amber-900 transition-colors"
        >
          Dashboard
        </Link>
        <button
          onClick={logout}
          className="hover:underline cursor-pointer hover:text-amber-900 transition-colors"
        >
          Sign Out
        </button>
      </nav>
    </header>
  );
}
