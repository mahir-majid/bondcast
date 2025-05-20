"use client";

import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 sm:px-18 py-5 bg-gradient-to-b from-yellow-100 via-yellow-200 to-yellow-300 text-indigo-900 backdrop-blur-md shadow-lg font-serif">
      {/* Brand */}
      <Link
        href="/"
        className="text-2xl sm:text-3xl font-extrabold tracking-tight text-amber-900"
      >
        Bondiver
      </Link>

      {/* Links shown when NOT signed in */}
      <nav className="space-x-6 sm:space-x-10 text-xl sm:text-2xl font-semibold text-amber-800">
        <Link
          href="/signin"
          className="hover:underline hover:text-amber-900 transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/join"
          className="hover:underline hover:text-amber-900 transition-colors"
        >
          Join
        </Link>
      </nav>
    </header>
  );
}
