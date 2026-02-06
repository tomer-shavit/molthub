"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Types (mirrors backend ProvisioningProgress)
// ---------------------------------------------------------------------------

export interface ProvisioningStep {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "error" | "skipped";
  message?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface ProvisioningProgress {
  instanceId: string;
  status: "in_progress" | "completed" | "error" | "timeout";
  currentStep: string;
  steps: ProvisioningStep[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface ProvisioningLogEntry {
  instanceId: string;
  stepId: string;
  stream: "stdout" | "stderr";
  line: string;
  timestamp: string;
}

interface UseProvisioningEventsResult {
  progress: ProvisioningProgress | null;
  isConnected: boolean;
  logs: ProvisioningLogEntry[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_CLIENT_LOG_LINES = 1000;
const POLL_INTERVAL_MS = 3000;

export function useProvisioningEvents(
  instanceId: string | null | undefined,
): UseProvisioningEventsResult {
  const [progress, setProgress] = useState<ProvisioningProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<ProvisioningLogEntry[]>([]);

  // Early return if no instanceId - don't subscribe to anything
  const shouldSubscribe = !!instanceId;
  const socketRef = useRef<unknown>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);

  // ---- Polling fallback ----
  const pollFailCountRef = useRef(0);
  const MAX_POLL_FAILURES = 10;

  const startPolling = useCallback(() => {
    if (!instanceId || pollIntervalRef.current) return;

    const poll = async () => {
      try {
        const res = await api.getProvisioningStatus(instanceId);
        if (!mountedRef.current) return;
        pollFailCountRef.current = 0;
        if (res && res.status !== "unknown") {
          setProgress(res as unknown as ProvisioningProgress);
          if (
            res.status === "completed" ||
            res.status === "error" ||
            res.status === "timeout"
          ) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        }
      } catch {
        pollFailCountRef.current++;
        if (pollFailCountRef.current >= MAX_POLL_FAILURES && mountedRef.current) {
          setProgress({
            instanceId: instanceId,
            status: "error",
            currentStep: "",
            steps: [],
            startedAt: new Date().toISOString(),
            error: "Lost connection to provisioning service. Check API logs and try again.",
          });
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }, [instanceId]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // ---- WebSocket connection ----
  useEffect(() => {
    // Don't subscribe if no instanceId
    if (!shouldSubscribe || !instanceId) {
      return;
    }

    mountedRef.current = true;
    let socket: { on: Function; emit: Function; disconnect: Function; connected: boolean } | null = null;

    // Start polling immediately for instant feedback
    startPolling();

    const connectWebSocket = async () => {
      try {
        const { io } = await import("socket.io-client");

        const newSocket = io(`${API_URL}/provisioning`, {
          transports: ["websocket", "polling"],
          reconnection: false, // We handle reconnection manually
        });
        socket = newSocket as any;
        socketRef.current = socket;

        newSocket.on("connect", () => {
          if (!mountedRef.current) return;
          setIsConnected(true);
          reconnectAttempts.current = 0;
          // Stop polling when WebSocket is connected
          stopPolling();
          // Subscribe to instance events
          newSocket.emit("subscribe", { instanceId });
        });

        newSocket.on("progress", (data: ProvisioningProgress) => {
          if (!mountedRef.current) return;
          setProgress(data);
          // Stop on terminal state
          if (
            data.status === "completed" ||
            data.status === "error" ||
            data.status === "timeout"
          ) {
            setTimeout(() => {
              newSocket.disconnect();
            }, 1000);
          }
        });

        newSocket.on("provisioning-log", (entry: ProvisioningLogEntry) => {
          if (!mountedRef.current) return;
          setLogs((prev) => {
            const next = [...prev, entry];
            return next.length > MAX_CLIENT_LOG_LINES
              ? next.slice(next.length - MAX_CLIENT_LOG_LINES)
              : next;
          });
        });

        newSocket.on("provisioning-logs-buffer", (buffer: ProvisioningLogEntry[]) => {
          if (!mountedRef.current) return;
          setLogs((prev) => {
            const merged = [...prev, ...buffer];
            return merged.length > MAX_CLIENT_LOG_LINES
              ? merged.slice(merged.length - MAX_CLIENT_LOG_LINES)
              : merged;
          });
        });

        newSocket.on("disconnect", () => {
          if (!mountedRef.current) return;
          setIsConnected(false);
          // Resume polling
          startPolling();
          // Try reconnect with exponential backoff
          if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(
              1000 * Math.pow(2, reconnectAttempts.current),
              30000,
            );
            reconnectAttempts.current++;
            setTimeout(() => {
              if (mountedRef.current) {
                connectWebSocket();
              }
            }, delay);
          }
        });

        newSocket.on("connect_error", () => {
          if (!mountedRef.current) return;
          setIsConnected(false);
          // Fall back to polling
          startPolling();
        });
      } catch {
        // socket.io-client not available — stay with polling
        startPolling();
      }
    };

    connectWebSocket();

    return () => {
      mountedRef.current = false;
      stopPolling();
      if (socket) {
        socket.emit("unsubscribe", { instanceId });
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [instanceId, shouldSubscribe, startPolling, stopPolling]);

  // Reset state when instanceId becomes null
  useEffect(() => {
    if (!shouldSubscribe) {
      setProgress(null);
      setIsConnected(false);
      // Don't clear logs - keep them visible after operation completes
    }
  }, [shouldSubscribe]);

  return { progress, isConnected, logs };
}
