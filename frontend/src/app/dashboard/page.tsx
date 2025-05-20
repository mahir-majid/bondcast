"use client";

import { useAuth } from "../components/AuthContext";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthNavbar from "../components/AuthNavbar";

export default function Dashboard() {
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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700 text-white font-sans">
      <AuthNavbar />

      <main className="flex-1 p-6 max-w-5xl mx-auto text-white relative">
        <h1 className="text-4xl font-extrabold drop-shadow-2xl mt-10">
          {user.firstname}'s Dashboard
        </h1>
      </main>

      <footer className="text-center py-6 text-sm text-white/70 bg-indigo-950 mt-auto">
        © {new Date().getFullYear()} Bondiver — Dive Deeper.
      </footer>
    </div>
  );
}
