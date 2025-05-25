"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import { useAuth } from "../components/AuthContext";

function forgotPassword() {
  // dummy function
}

export default function SignIn() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(form.username, form.password);
      router.push("/dashboard");
    } catch (error: any) {
      const msg = error.message?.toLowerCase() || "";

      if (msg.includes("incorrect password")) {
        setError("Incorrect password.");
      } else if (msg.includes("username not found")) {
        setError("Username not found.");
      } else if (msg.includes("required")) {
        setError("Username and password are required.");
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-300 via-blue-500 to-blue-700 text-white flex flex-col">
      <Navbar />

      <main className="flex flex-col flex-1 items-center justify-center px-6 sm:px-12 text-center gap-8 max-w-lg mx-auto">
        <h1 className="text-5xl font-extrabold drop-shadow-lg whitespace-nowrap">Welcome Back</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-[28rem] bg-white/10 p-10 rounded-xl shadow-xl">
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={form.username}
            onChange={handleChange}
            required
            className="p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white"
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            required
            className="p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white"
          />

          <div className="text-left">
            <button type="button" onClick={forgotPassword} className="text-sm text-white/80 hover:underline cursor-pointer">
              Forgot your password?
            </button>
          </div>

          {error && <p className="text-red-200 text-sm text-left">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="bg-white text-blue-700 py-3 cursor-pointer rounded font-semibold text-lg hover:bg-blue-100 transition disabled:opacity-60"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-base text-white/80 max-w-xs">
          Don&apos;t have an account? <a href="/join" className="underline hover:text-white">Sign up here</a>.
        </p>
      </main>
    </div>
  );
}