"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import { useAuth } from "../components/AuthContext";

type FormErrors = {
  email?: string;
  username?: string;
  password?: string;
  verificationCode?: string;
};

export default function Join() {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState<"form" | "verifyCode" | "success">("form");
  const [form, setForm] = useState({ email: "", username: "", password: "", firstname: "", lastname: "", dob: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const baseURL = process.env.NEXT_PUBLIC_URL;

  const sendVerificationCode = async (email: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${baseURL}/api/users/send-verification-code/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      // Store the email in state for verification
      setForm(prev => ({ ...prev, email }));
      setStep("verifyCode");
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: undefined });
  };

  const checkUserExists = async () => {
    setIsLoading(true);
    setErrors({});
    try {
      const res = await fetch(`${baseURL}/api/users/check-exists/?email=${encodeURIComponent(form.email)}&username=${encodeURIComponent(form.username)}`);
      const data = await res.json();
      if (!res.ok) throw data;

      const newErrors: FormErrors = {};
      if (data.emailExists) newErrors.email = "Email already in use";
      if (data.usernameExists) newErrors.username = "Username already in use";

      setErrors(newErrors);

      return Object.keys(newErrors).length === 0;
    } catch (err) {
      alert(`Error checking user info: ${err} Try again.`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = await checkUserExists();
    if (!valid) return;

    await sendVerificationCode(form.email);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      // First verify the code with the backend
      const verifyResponse = await fetch(`${baseURL}/api/users/check-verification-code/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          code: verificationCode
        }),
      });

      const verifyData = await verifyResponse.json();
      
      if (!verifyResponse.ok) {
        setErrors({ verificationCode: verifyData.error || "Invalid verification code" });
        setIsLoading(false);
        return;
      }

      // If verification successful, proceed with registration
      const res = await fetch(`${baseURL}/api/users/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          dob: form.dob  // Just send the raw date string
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrors({ email: data.email?.[0], username: data.username?.[0], password: data.password?.[0] });
        setIsLoading(false);
        return;
      }

      await login(form.username, form.password);
      setStep("success");
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (error: unknown) {
      console.error('Registration error:', error);
      setErrors({ verificationCode: "Registration failed. Please try again." });
    } finally {
      setIsLoading(false);
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
              Join Bondiver
            </h1>
            <p className="text-white/80 text-[1.125rem]">
              Start your journey to effortless connections
            </p>
          </div>

        {step === "form" && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-[1rem] w-full bg-white/10 backdrop-blur-xl p-[1.5rem] rounded-[1rem] shadow-2xl border border-white/20">
              <div className="grid grid-cols-2 gap-[0.75rem]">
                <input 
                  type="text" 
                  name="firstname" 
                  placeholder="First Name" 
                  value={form.firstname} 
                  onChange={handleChange} 
                  required
                  className="p-[0.75rem] rounded-[0.75rem] bg-white/10 border border-white/20 placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 text-[0.875rem]" 
                />
                <input 
                  type="text" 
                  name="lastname" 
                  placeholder="Last Name" 
                  value={form.lastname} 
                  onChange={handleChange} 
                  required
                  className="p-[0.75rem] rounded-[0.75rem] bg-white/10 border border-white/20 placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 text-[0.875rem]" 
                />
            </div>

              <input 
                type="date" 
                name="dob" 
                placeholder="Date of Birth" 
                value={form.dob} 
                onChange={handleChange} 
                required
                className="p-[0.75rem] rounded-[0.75rem] bg-white/10 border border-white/20 placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 text-[0.875rem]" 
              />

              <input 
                type="email" 
                name="email" 
                placeholder="Email" 
                value={form.email} 
                onChange={handleChange} 
                required 
                className={`p-[0.75rem] rounded-[0.75rem] bg-white/10 border placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 text-[0.875rem] ${errors.email ? "border-red-400" : "border-white/20"}`} 
              />
              {errors.email && <p className="text-red-300 text-[0.75rem] text-center">{errors.email}</p>}

              <input 
                type="text" 
                name="username" 
                placeholder="Username" 
                value={form.username} 
                onChange={handleChange} 
                required 
                minLength={3} 
                className={`p-[0.75rem] rounded-[0.75rem] bg-white/10 border placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 text-[0.875rem] ${errors.username ? "border-red-400" : "border-white/20"}`} 
              />
              {errors.username && <p className="text-red-300 text-[0.75rem] text-center">{errors.username}</p>}

              <input 
                type="password" 
                name="password" 
                placeholder="Password" 
                value={form.password} 
                onChange={handleChange} 
                required 
                minLength={6} 
                className={`p-[0.75rem] rounded-[0.75rem] bg-white/10 border placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 text-[0.875rem] ${errors.password ? "border-red-400" : "border-white/20"}`} 
              />
              {errors.password && <p className="text-red-300 text-[0.75rem] text-center">{errors.password}</p>}

              <button 
                type="submit" 
                disabled={isLoading} 
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white cursor-pointer py-[0.75rem] rounded-[0.75rem] font-semibold text-[1rem] transition-all duration-300 disabled:opacity-60 shadow-lg hover:shadow-xl hover:shadow-cyan-500/25 transform hover:-translate-y-0.5"
              >
              {isLoading ? "Checking..." : "Create Account"}
            </button>
          </form>
        )}

        {step === "verifyCode" && (
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-[1rem] w-full bg-white/10 backdrop-blur-xl p-[1.5rem] rounded-[1rem] shadow-2xl border border-white/20">
              <div className="text-center">
                <h2 className="text-[1.5rem] font-bold mb-[0.5rem] bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Verify Your Email</h2>
                <p className="text-white/80 text-[0.875rem]">A verification code was sent to your email. Please enter it below:</p>
              </div>
              <input 
                type="text" 
                name="verificationCode" 
                placeholder="6-digit code" 
                value={verificationCode} 
                onChange={(e) => { setVerificationCode(e.target.value); setErrors({ ...errors, verificationCode: undefined }); }} 
                required 
                pattern="\d{6}" 
                maxLength={6} 
                className={`p-[0.75rem] rounded-[0.75rem] bg-white/10 border placeholder-white/60 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 text-center text-[1.25rem] tracking-widest ${errors.verificationCode ? "border-red-400" : "border-white/20"}`} 
              />
              {errors.verificationCode && <p className="text-red-300 text-[0.75rem] text-center">{errors.verificationCode}</p>}

              <button 
                type="submit" 
                disabled={isLoading} 
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white py-[0.75rem] rounded-[0.75rem] font-semibold text-[1rem] transition-all duration-300 disabled:opacity-60 shadow-lg hover:shadow-xl hover:shadow-cyan-500/25 transform hover:-translate-y-0.5 cursor-pointer"
              >
              {isLoading ? "Verifying..." : "Verify Code"}
            </button>
          </form>
        )}

        {step === "success" && (
            <div className="flex flex-col gap-[1rem] w-full bg-white/10 backdrop-blur-xl p-[1.5rem] rounded-[1rem] shadow-2xl border border-white/20 text-center">
              <div className="w-[3rem] h-[3rem] bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-[0.5rem]">
                <svg className="w-[1.5rem] h-[1.5rem] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-[1.5rem] font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Welcome to Bondiver!</h2>
              <p className="text-white/80 text-[0.875rem]">Registration successful! Redirecting to dashboard...</p>
          </div>
        )}

          <div className="text-center mt-[1.5rem]">
            <p className="text-white/60 text-[0.875rem]">
              Already have an account?{" "}
              <a href="/signin" className="text-cyan-400 hover:text-cyan-300 transition-colors duration-300 font-semibold">
                Sign in here
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
