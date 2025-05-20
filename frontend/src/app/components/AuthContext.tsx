"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ----------------- Types -----------------

type User = {
  id: number;
  email: string;
  username: string;
  firstname: string;
  lastname: string;
  dob: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

// --------------- Context -----------------

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

// --------------- Provider ----------------

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Read the Django backend URL from env (defaults to localhost if missing)
  const baseURL =
    process.env.NEXT_PUBLIC_URL

  // ------------ Helpers ------------

  /**
   * Validate existing access token (if any) with Django and set the user.
   */
  const fetchUser = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${baseURL}/api/users/validate-jwt/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        setUser(null);
        return;
      }

      const data = await res.json();
      setUser(data.user);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  /**
   * Obtain JWT pair + user details from Django.
   */
  const login = async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${baseURL}/api/users/get-jwt/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || "Login failed");

      localStorage.setItem("accessToken", data.access);
      localStorage.setItem("refreshToken", data.refresh);
      setUser(data.user ?? null);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Clear tokens and user state.
   */
  const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setUser(null);
    router.push("/signin");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// ------------- Hook -------------

export const useAuth = () => useContext(AuthContext);
