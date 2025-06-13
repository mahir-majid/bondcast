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
  const [sentCode, setSentCode] = useState("");

  const baseURL = process.env.NEXT_PUBLIC_URL;

  const sendVerificationCode = async (email: string) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(code);
    alert(`Verification code sent to ${email}: ${code}`);
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
    setStep("verifyCode");
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode !== sentCode) {
      setErrors({ verificationCode: "Incorrect verification code" });
      return;
    }
    setErrors({});
    setIsLoading(true);

    try {
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
    } catch {
      alert("Registration failed. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-300 via-blue-500 to-blue-700 text-white flex flex-col">
      <Navbar />

      <main className="flex flex-col flex-1 items-center justify-center px-6 sm:px-12 text-center gap-8 max-w-3xl mx-auto">
        <h1 className="text-5xl font-extrabold drop-shadow-lg">Dive In</h1>

        {step === "form" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full bg-purple-950/60 backdrop-blur-sm p-8 rounded-xl shadow-xl border border-white/20">
            <div className="flex gap-4">
              <input type="text" name="firstname" placeholder="First Name" value={form.firstname} onChange={handleChange} className="w-1/2 p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white" />
              <input type="text" name="lastname" placeholder="Last Name" value={form.lastname} onChange={handleChange} className="w-1/2 p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white" />
            </div>

            <input type="date" name="dob" placeholder="Date of Birth" value={form.dob} onChange={handleChange} className="p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white" />

            <input type="email" name="email" placeholder="Email" value={form.email} onChange={handleChange} required className={`p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white ${errors.email ? "ring-red-500 ring-2" : ""}`} />
            {errors.email && <p className="text-red-300 text-sm text-left">{errors.email}</p>}

            <input type="text" name="username" placeholder="Username" value={form.username} onChange={handleChange} required minLength={3} className={`p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white ${errors.username ? "ring-red-500 ring-2" : ""}`} />
            {errors.username && <p className="text-red-300 text-sm text-left">{errors.username}</p>}

            <input type="password" name="password" placeholder="Password" value={form.password} onChange={handleChange} required minLength={6} className={`p-3 rounded bg-white/20 placeholder-white text-white focus:outline-none focus:ring-2 focus:ring-white ${errors.password ? "ring-red-500 ring-2" : ""}`} />
            {errors.password && <p className="text-red-300 text-sm text-left">{errors.password}</p>}

            <button type="submit" disabled={isLoading} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white cursor-pointer py-3 rounded font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition disabled:opacity-60">
              {isLoading ? "Checking..." : "Create Account"}
            </button>
          </form>
        )}

        {step === "verifyCode" && (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4 w-full bg-purple-950/60 backdrop-blur-sm p-6 rounded-xl shadow-xl border border-white/20">
            <p className="text-white/80">A verification code was sent to your email. Please enter it below:</p>
            <input type="text" name="verificationCode" placeholder="6-digit code" value={verificationCode} onChange={(e) => { setVerificationCode(e.target.value); setErrors({ ...errors, verificationCode: undefined }); }} required pattern="\d{6}" maxLength={6} className={`p-3 rounded bg-white/20 text-white placeholder-white focus:outline-none focus:ring-2 focus:ring-white ${errors.verificationCode ? "ring-red-500 ring-2" : ""}`} />
            {errors.verificationCode && <p className="text-red-300 text-sm text-left">{errors.verificationCode}</p>}

            <button type="submit" disabled={isLoading} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition disabled:opacity-60 cursor-pointer">
              {isLoading ? "Verifying..." : "Verify Code"}
            </button>
          </form>
        )}

        {step === "success" && (
          <div className="text-green-200 font-semibold text-xl">
            Registration successful! Redirecting to dashboard...
          </div>
        )}

        <p className="text-sm text-white/80 max-w-xs">
          Already have an account? <a href="/signin" className="underline hover:text-white">Sign in here</a>.
        </p>
      </main>
    </div>
  );
}
