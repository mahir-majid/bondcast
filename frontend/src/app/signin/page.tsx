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
          <form onSubmit={handleRequestResetCode} className="flex flex-col gap-[1.5rem] w-full max-w-[24rem] bg-white/10 backdrop-blur-xl p-[2rem] rounded-[1rem] shadow-2xl border border-white/20">
            <div className="text-center">
              <h2 className="text-[1.875rem] font-bold mb-[0.5rem] bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Reset Password</h2>
              <p className="text-white/80">Enter your email address to receive a reset code.</p>
            </div>
            <input
              type="email"
              placeholder="Email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
              className="p-[1rem] rounded-[0.75rem] bg-white/10 border border-white/20 placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
            />
            {error && <p className="text-red-300 text-[0.875rem] text-center">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white py-[1rem] cursor-pointer rounded-[0.75rem] font-semibold text-[1.125rem] transition-all duration-300 disabled:opacity-60 shadow-lg hover:shadow-xl hover:shadow-cyan-500/25 transform hover:-translate-y-0.5"
            >
              {isLoading ? "Sending..." : "Send Reset Code"}
            </button>
            <button
              type="button"
              onClick={() => setResetStep(null)}
              className="text-white/80 hover:text-white transition-colors duration-300"
            >
              Back to Sign In
            </button>
          </form>
        );

      case "verify":
        return (
          <form onSubmit={handleVerifyResetCode} className="flex flex-col gap-[1.5rem] w-full max-w-[24rem] bg-white/10 backdrop-blur-xl p-[2rem] rounded-[1rem] shadow-2xl border border-white/20">
            <div className="text-center">
              <h2 className="text-[1.875rem] font-bold mb-[0.5rem] bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Enter Reset Code</h2>
              <p className="text-white/80">Enter the 6-digit code sent to your email.</p>
            </div>
            <input
              type="text"
              placeholder="6-digit code"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              required
              pattern="\d{6}"
              maxLength={6}
              className="p-[1rem] rounded-[0.75rem] bg-white/10 border border-white/20 placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 text-center text-[1.25rem] tracking-widest"
            />
            {error && <p className="text-red-300 text-[0.875rem] text-center">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white py-[1rem] cursor-pointer rounded-[0.75rem] font-semibold text-[1.125rem] transition-all duration-300 disabled:opacity-60 shadow-lg hover:shadow-xl hover:shadow-cyan-500/25 transform hover:-translate-y-0.5"
            >
              {isLoading ? "Verifying..." : "Verify Code"}
            </button>
            <button
              type="button"
              onClick={() => setResetStep("request")}
              className="text-white/80 hover:text-white transition-colors duration-300"
            >
              Back to Request
            </button>
          </form>
        );

      case "change":
        return (
          <form onSubmit={handleChangePassword} className="flex flex-col gap-[1.5rem] w-full max-w-[24rem] bg-white/10 backdrop-blur-xl p-[2rem] rounded-[1rem] shadow-2xl border border-white/20">
            <div className="text-center">
              <h2 className="text-[1.875rem] font-bold mb-[0.5rem] bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">New Password</h2>
              <p className="text-white/80">Enter your new password.</p>
            </div>
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="p-[1rem] rounded-[0.75rem] bg-white/10 border border-white/20 placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
            />
            {error && <p className="text-red-300 text-[0.875rem] text-center">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white py-[1rem] cursor-pointer rounded-[0.75rem] font-semibold text-[1.125rem] transition-all duration-300 disabled:opacity-60 shadow-lg hover:shadow-xl hover:shadow-cyan-500/25 transform hover:-translate-y-0.5"
            >
              {isLoading ? "Changing..." : "Change Password"}
            </button>
            <button
              type="button"
              onClick={() => setResetStep("verify")}
              className="text-white/80 hover:text-white transition-colors duration-300"
            >
              Back to Verification
            </button>
          </form>
        );

      case "success":
        return (
          <div className="flex flex-col gap-[1.5rem] w-full max-w-[24rem] bg-white/10 backdrop-blur-xl p-[2rem] rounded-[1rem] shadow-2xl border border-white/20 text-center">
            <div className="w-[4rem] h-[4rem] bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-[1rem]">
              <svg className="w-[2rem] h-[2rem] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-[1.875rem] font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Password Changed!</h2>
            <p className="text-white/80">Your password has been successfully updated.</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white font-sans">
      <Navbar />

      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-[3vw] sm:px-[4vw]">
        <div className="w-full max-w-[24rem]">
          <div className="text-center mb-[1rem]">
            <h1 className="text-[2.5rem] sm:text-[3rem] font-bold mb-[0.5rem] bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Welcome Back
            </h1>
            <p className="text-white/80 text-[1.125rem]">
              Sign in to continue your journey with Bondiver
            </p>
          </div>

          {resetStep ? (
            renderResetForm()
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-[1.5rem] w-full bg-white/10 backdrop-blur-xl p-[2rem] rounded-[1rem] shadow-2xl border border-white/20">
              <input
                type="text"
                name="username"
                placeholder="Username or Email"
                value={form.username}
                onChange={handleChange}
                required
                className="p-[1rem] rounded-[0.75rem] bg-white/10 border border-white/20 placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={form.password}
                onChange={handleChange}
                required
                className="p-[1rem] rounded-[0.75rem] bg-white/10 border border-white/20 placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
              />
              {error && <p className="text-red-300 text-[0.875rem] text-center">{error}</p>}
              <button
                type="submit"
                disabled={isLoading}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white py-[1rem] cursor-pointer rounded-[0.75rem] font-semibold text-[1.125rem] transition-all duration-300 disabled:opacity-60 shadow-lg hover:shadow-xl hover:shadow-cyan-500/25 transform hover:-translate-y-0.5"
              >
                {isLoading ? "Signing In..." : "Sign In"}
              </button>
              <button
                type="button"
                onClick={() => setResetStep("request")}
                className="text-white/80 hover:text-white transition-colors duration-300"
              >
                Forgot Password?
              </button>
            </form>
          )}

          <div className="text-center mt-[2rem]">
            <p className="text-white/60">
              Don&apos;t have an account?{" "}
              <a href="/join" className="text-cyan-400 hover:text-cyan-300 transition-colors duration-300 font-semibold">
                Sign up here
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}