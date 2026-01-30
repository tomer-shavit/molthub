'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocketContext, type ConnectionState } from '@/lib/websocket-context';
import type { LogEntry, LogLevel } from '@/components/moltbot/log-viewer';

interface UseLogStreamOptions {
  minLevel?: LogLevel;
  maxLines?: number;
}

interface UseLogStreamResult {
  logs: LogEntry[];
  isStreaming: boolean;
  status: ConnectionState;
  clearLogs: () => void;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let logIdCounter = 0;

export function useLogStream(instanceId: string, options?: UseLogStreamOptions): UseLogStreamResult {
  const { minLevel = 'debug', maxLines = 500 } = options ?? {};
  const ctx = useWebSocketContext();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const minLevelOrder = LOG_LEVEL_ORDER[minLevel];
  const status: ConnectionState = ctx.connectionStatus[instanceId] || 'disconnected';
  const isStreaming = status === 'connected';
  const maxLinesRef = useRef(maxLines);
  maxLinesRef.current = maxLines;
  const minLevelRef = useRef(minLevelOrder);
  minLevelRef.current = minLevelOrder;

  useEffect(() => {
    if (!instanceId) return;
    const handleLog = (data: unknown) => {
      const entry = data as { level?: LogLevel; message?: string; timestamp?: string; source?: string };
      const level = entry.level || 'info';
      if ((LOG_LEVEL_ORDER[level] ?? 1) < minLevelRef.current) return;
      const logEntry: LogEntry = {
        id: `ws-${++logIdCounter}`,
        timestamp: entry.timestamp || new Date().toISOString(),
        level,
        message: entry.message || JSON.stringify(data),
        source: entry.source,
      };
      setLogs((prev) => {
        const next = [...prev, logEntry];
        return next.length > maxLinesRef.current ? next.slice(next.length - maxLinesRef.current) : next;
      });
    };
    const unsubLog = ctx.subscribe(instanceId, 'log', handleLog);
    const unsubAgent = ctx.subscribe(instanceId, 'agentOutput', handleLog);
    return () => { unsubLog(); unsubAgent(); };
  }, [instanceId, ctx]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, isStreaming, status, clearLogs };
}
