"use client";

import { useAuth } from "../components/AuthContext";
import { useRouter } from "next/navigation";
import AuthNavbar from "../components/AuthNavbar";
import LeftBar from "./components/leftbar";
import Chat from "../components/Chat";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();


  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null; // or redirecting...
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700 text-white font-sans">
      <div className="z-1">
        <AuthNavbar />
      </div>

      <main className="flex flex-1 w-full">
        <LeftBar user={user} />

        {/* Main dashboard content fills remaining space */}
        <section className="flex-1 p-6 max-w-full">
          <h1 className="text-4xl font-extrabold drop-shadow-2xl ml-10">
            {user.firstname}&apos;s Dashboard
          </h1>
          {/* Add any other dashboard content here */}
        </section>
      </main>
      <div className="absolute top-25 right-8">
        <Chat llmMode={"user_called"} />
      </div>

    </div>
  );
}
