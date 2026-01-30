"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { api } from "./api";

type UserStage = "empty" | "getting-started" | "fleet";

interface UserStageContextValue {
  stage: UserStage;
  agentCount: number;
  hasFleets: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const UserStageContext = createContext<UserStageContextValue | null>(null);

export function UserStageProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<UserStage>("getting-started");
  const [agentCount, setAgentCount] = useState(0);
  const [hasFleets, setHasFleets] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const ctx = await api.getUserContext();
      setStage(ctx.stage);
      setAgentCount(ctx.agentCount);
      setHasFleets(ctx.hasFleets);
    } catch {
      // Default to getting-started on error (safe fallback - shows sidebar)
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <UserStageContext.Provider value={{ stage, agentCount, hasFleets, isLoading, refresh }}>
      {children}
    </UserStageContext.Provider>
  );
}

export function useUserStage(): UserStageContextValue {
  const ctx = useContext(UserStageContext);
  if (!ctx) {
    throw new Error("useUserStage must be used within a <UserStageProvider>");
  }
  return ctx;
}
