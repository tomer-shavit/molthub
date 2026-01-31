"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, AuthUser } from "./api";

const TOKEN_KEY = "molthub_token";

const PUBLIC_PATHS = new Set(["/login", "/login/register"]);

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthLoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const isAuthenticated = user !== null;

  // On mount, restore token from localStorage and validate it
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      api.setToken(savedToken);
      api
        .getMe()
        .then((me) => setUser(me))
        .catch(() => {
          // Token invalid or expired — clear it
          localStorage.removeItem(TOKEN_KEY);
          api.setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // Client-side route protection
  useEffect(() => {
    if (isLoading) return;

    const isPublic = PUBLIC_PATHS.has(pathname);

    if (!isAuthenticated && !isPublic) {
      router.replace("/login");
    }

    if (isAuthenticated && isPublic) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    api.setToken(res.accessToken);
    setUser(res.user);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const res = await api.register(username, password);
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    api.setToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    api.setToken(null);
    setUser(null);
    router.replace("/login");
  }, [router]);

  const value = { user, isLoading, isAuthenticated, login, register, logout };

  // While loading, show nothing (prevents flash of protected content)
  if (isLoading) {
    return (
      <AuthContext.Provider value={value}>
        <AuthLoadingScreen />
      </AuthContext.Provider>
    );
  }

  // If not authenticated and not on a public path, don't render children (redirect will happen)
  if (!isAuthenticated && !PUBLIC_PATHS.has(pathname)) {
    return (
      <AuthContext.Provider value={value}>
        <AuthLoadingScreen />
      </AuthContext.Provider>
    );
  }

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
