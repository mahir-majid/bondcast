"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
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

  const refreshAccessToken = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        throw new Error("No refresh token found");
      }

      const response = await fetch(`${baseURL}/api/users/refresh-jwt/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });

      if (!response.ok) {
        throw new Error("Failed to refresh token");
      }

      const data = await response.json();
      localStorage.setItem("accessToken", data.access);
    } catch (error) {
      console.error("Error refreshing token:", error);
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setUser(null);
    }
  }, [baseURL]);

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      const response = await fetch(`${baseURL}/api/users/validate-jwt/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // throw new Error("Invalid token");
      }

      const userData = await response.json();
      setUser(userData);
    } catch {
      // console.error("Error fetching user:", error);
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [baseURL]);

  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      const token = localStorage.getItem("accessToken");
      if (token) {
        await refreshAccessToken();
      }
    }, 4 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [refreshAccessToken]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

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
