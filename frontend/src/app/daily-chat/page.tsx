// app/dashboard/page.tsx   (frontend with "live mic" fix applied)

"use client";

import { useAuth } from "../components/AuthContext";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthNavbar from "../components/AuthNavbar";
import Chat from "./components/Chat";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const websocketURL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;

  /* auth guard */
  useEffect(() => { if (!loading && !user) router.push("/signin"); }, [loading, user, router]);

  if (loading) return <div>Loading…</div>;
  if (!user)   return null;

  /* UI */
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700 text-white font-sans">
      <AuthNavbar />

      <main className="flex-1 p-6 max-w-5xl mx-auto flex flex-col items-center">
        <h1 className="text-4xl font-extrabold mb-6 mt-10 drop-shadow-2xl">
          {user.firstname}&rsquo;s Daily Chat
        </h1>
    
        <Chat websocketURL={websocketURL || ''} />
      </main>

      <footer className="text-center py-6 text-sm text-white/70 bg-indigo-950 mt-auto">
        © {new Date().getFullYear()} Bondiver — Dive Deeper.
      </footer>
    </div>
  );
}
