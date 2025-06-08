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
  const baseURL = process.env.NEXT_PUBLIC_URL;

  // ------------ Helpers ------------

  /**
   * Refresh the access token using the refresh token
   */
  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${baseURL}/api/users/refresh-jwt/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: refreshToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to refresh token");
      }

      const data = await res.json();
      localStorage.setItem("accessToken", data.access);
      if (data.refresh) {  // If a new refresh token is provided
        localStorage.setItem("refreshToken", data.refresh);
      }
      return data.access;
    } catch {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      return null;
    }
  };

  /**
   * Validate existing access token (if any) with Django and set the user.
   * If token is expired, try to refresh it.
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
        // Token might be expired, try to refresh it
        const newToken = await refreshAccessToken();
        if (!newToken) {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          setUser(null);
          setLoading(false);
          return;
        }

        // Retry the request with the new token
        const retryRes = await fetch(`${baseURL}/api/users/validate-jwt/`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${newToken}`,
          },
        });

        if (!retryRes.ok) {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          setUser(null);
          setLoading(false);
          return;
        }

        const data = await retryRes.json();
        setUser(data);
      } else {
        const data = await res.json();
        setUser(data);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Set up an interval to refresh the token before it expires
  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      const token = localStorage.getItem("accessToken");
      if (token) {
        await refreshAccessToken();
      }
    }, 4 * 60 * 1000); // Refresh every 4 minutes

    return () => clearInterval(refreshInterval);
  }, []);

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
