"use client";

import {
  createContext,
  useContext,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AuthUser } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // AUTH DISABLED: Always provide a mock user, skip login/token validation
  const mockUser: AuthUser = { id: "00000000-0000-0000-0000-000000000000", username: "dev", role: "OWNER" };
  const router = useRouter();

  const login = useCallback(async () => {}, []);
  const register = useCallback(async () => {}, []);
  const logout = useCallback(() => { router.replace("/"); }, [router]);

  const value: AuthContextValue = {
    user: mockUser,
    isLoading: false,
    isAuthenticated: true,
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
