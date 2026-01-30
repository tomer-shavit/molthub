'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useWebSocketContext, type ConnectionState } from '@/lib/websocket-context';
import type { HealthSnapshotData } from '@/components/moltbot/health-snapshot';
import { api } from '@/lib/api';

interface UseHealthStreamResult {
  health: HealthSnapshotData | null;
  lastUpdated: Date | null;
  isConnected: boolean;
  status: ConnectionState;
}

const POLL_INTERVAL_MS = 30_000;

export function useHealthStream(instanceId: string): UseHealthStreamResult {
  const ctx = useWebSocketContext();
  const [health, setHealth] = useState<HealthSnapshotData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const status: ConnectionState = ctx.connectionStatus[instanceId] || 'disconnected';
  const isConnected = status === 'connected';
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!instanceId) return;
    return ctx.subscribe(instanceId, 'health', (data) => {
      const snapshot = data as HealthSnapshotData;
      if (snapshot && snapshot.overall) { setHealth(snapshot); setLastUpdated(new Date()); }
    });
  }, [instanceId, ctx]);

  const fetchHealth = useCallback(async () => {
    try {
      const result = await api.getInstanceHealth(instanceId);
      if (result) {
        setHealth({ overall: result.overall, components: result.components, lastChecked: result.lastChecked });
        setLastUpdated(new Date());
      }
    } catch { /* polling failure */ }
  }, [instanceId]);

  useEffect(() => {
    if (!instanceId) return;
    fetchHealth();
    if (!isConnected) { pollTimerRef.current = setInterval(fetchHealth, POLL_INTERVAL_MS); }
    return () => { if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; } };
  }, [instanceId, isConnected, fetchHealth]);

  return { health, lastUpdated, isConnected, status };
}
