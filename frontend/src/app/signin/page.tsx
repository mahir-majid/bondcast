"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import { useAuth } from "../components/AuthContext";

type PasswordResetStep = "request" | "verify" | "change" | "success";

export default function SignIn() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetStep, setResetStep] = useState<PasswordResetStep | null>(null);
  const baseURL = process.env.NEXT_PUBLIC_URL;

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
    } catch (error: unknown) {
      let msg = "";
    
      if (error instanceof Error) {
        msg = error.message?.toLowerCase() || "";
      }
    
      if (msg.includes("incorrect password")) {
        setError("Incorrect password.");
      } else if (msg.includes("username not found")) {
        setError("Username not found.");
      } else if (msg.includes("email not found")) {
        setError("Email not found.");
      } else if (msg.includes("required")) {
        setError("Username and password are required.");
      } else {
        setError("Login failed. Please try again.");
      }
      setIsLoading(false);
    }
  }

  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${baseURL}/api/users/send-password-reset-code/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resetEmail }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset code');
      }

      setResetStep("verify");
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send reset code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${baseURL}/api/users/verify-password-reset-code/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: resetEmail,
          code: resetCode
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Invalid verification code');
      }

      setResetStep("change");
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${baseURL}/api/users/change-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: resetEmail,
          new_password: newPassword
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      setResetStep("success");
      setTimeout(() => {
        setResetStep(null);
        setResetEmail("");
        setResetCode("");
        setNewPassword("");
      }, 2000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const renderResetForm = () => {
    switch (resetStep) {
      case "request":
        return (
          <form onSubmit={handleRequestResetCode} className="flex flex-col gap-4 w-[28rem] bg-purple-950/60 backdrop-blur-sm p-10 rounded-xl shadow-xl border border-white/20">
            <h2 className="text-2xl font-bold mb-2">Reset Password</h2>
            <p className="text-white/80 mb-4">Enter your email address to receive a reset code.</p>
            <input
              type="email"
              placeholder="Email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
              className="p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white"
            />
            {error && <p className="text-red-200 text-sm text-left">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 cursor-pointer rounded font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition disabled:opacity-60"
            >
              {isLoading ? "Sending..." : "Send Reset Code"}
            </button>
            <button
              type="button"
              onClick={() => setResetStep(null)}
              className="text-white/80 hover:text-white transition"
            >
              Back to Sign In
            </button>
          </form>
        );

      case "verify":
        return (
          <form onSubmit={handleVerifyResetCode} className="flex flex-col gap-4 w-[28rem] bg-purple-950/60 backdrop-blur-sm p-10 rounded-xl shadow-xl border border-white/20">
            <h2 className="text-2xl font-bold mb-2">Enter Reset Code</h2>
            <p className="text-white/80 mb-4">Enter the 6-digit code sent to your email.</p>
            <input
              type="text"
              placeholder="6-digit code"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              required
              pattern="\d{6}"
              maxLength={6}
              className="p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white"
            />
            {error && <p className="text-red-200 text-sm text-left">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 cursor-pointer rounded font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition disabled:opacity-60"
            >
              {isLoading ? "Verifying..." : "Verify Code"}
            </button>
            <button
              type="button"
              onClick={() => setResetStep("request")}
              className="text-white/80 hover:text-white transition"
            >
              Back
            </button>
          </form>
        );

      case "change":
        return (
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4 w-[28rem] bg-purple-950/60 backdrop-blur-sm p-10 rounded-xl shadow-xl border border-white/20">
            <h2 className="text-2xl font-bold mb-2">New Password</h2>
            <p className="text-white/80 mb-4">Enter your new password.</p>
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white"
            />
            {error && <p className="text-red-200 text-sm text-left">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 cursor-pointer rounded font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition disabled:opacity-60"
            >
              {isLoading ? "Changing..." : "Change Password"}
            </button>
            <button
              type="button"
              onClick={() => setResetStep("verify")}
              className="text-white/80 hover:text-white transition"
            >
              Back
            </button>
          </form>
        );

      case "success":
        return (
          <div className="flex flex-col gap-4 w-[28rem] bg-purple-950/60 backdrop-blur-sm p-10 rounded-xl shadow-xl border border-white/20">
            <h2 className="text-2xl font-bold mb-2">Success!</h2>
            <p className="text-white/80">Your password has been changed successfully.</p>
            <button
              onClick={() => setResetStep(null)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 cursor-pointer rounded font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition"
            >
              Back to Sign In
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-300 via-blue-500 to-blue-700 text-white flex flex-col">
      <Navbar />

      <main className="flex flex-col flex-1 items-center justify-center px-6 sm:px-12 text-center gap-8 max-w-lg mx-auto">
        <h1 className="text-5xl font-extrabold drop-shadow-lg whitespace-nowrap">Welcome Back</h1>

        {resetStep ? (
          renderResetForm()
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-[28rem] bg-purple-950/60 backdrop-blur-sm p-10 rounded-xl shadow-xl border border-white/20">
          <input
            type="text"
            name="username"
            placeholder="Username or Email"
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
              <button type="button" onClick={() => setResetStep("request")} className="text-sm text-white/80 hover:underline cursor-pointer">
              Forgot your password?
            </button>
          </div>

          {error && <p className="text-red-200 text-sm text-left">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 cursor-pointer rounded font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition disabled:opacity-60"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        )}

        {!resetStep && (
        <p className="text-base text-white/80 max-w-xs">
          Don&apos;t have an account? <a href="/join" className="underline hover:text-white">Sign up here</a>.
        </p>
        )}
      </main>
    </div>
  );
}