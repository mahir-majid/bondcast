"use client";

import { useAuth } from "../components/AuthContext";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthNavbar from "../components/AuthNavbar";

export default function Friends() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/signin");
    }
  }, [user, loading, router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null; // or redirecting...
  }

  const addFriend = () => {
    
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700 text-white font-sans">
      <AuthNavbar />

      <main className="flex-1 p-6 max-w-5xl mx-auto text-white relative">
        <h1 className="text-4xl font-extrabold drop-shadow-2xl mt-10 mb-8">
          Find New Friends
        </h1>
        <div className="w-full flex gap-4">
          <input
            type="text"
            placeholder="Search new friends..."
            className="flex-1 bg-white/20 placeholder-white/70 text-white rounded-full px-6 py-3 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-white/60 focus:bg-white/30 transition"
          />
          <button
            className="shrink-0 px-6 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition font-semibold shadow-lg backdrop-blur-md cursor-pointer"
            onClick={addFriend}
          >
            Add Friend
          </button>
        </div>
      </main>

      <footer className="text-center py-6 text-sm text-white/70 bg-indigo-950 mt-auto">
        © {new Date().getFullYear()} Bondiver — Dive Deeper.
      </footer>
    </div>
  );
}
