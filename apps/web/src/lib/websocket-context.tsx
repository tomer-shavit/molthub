'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

type EventCallback = (data: unknown) => void;

interface WebSocketContextValue {
  getConnection(instanceId: string): WebSocket | null;
  subscribe(instanceId: string, event: string, callback: EventCallback): () => void;
  send(instanceId: string, event: string, data: unknown): void;
  connectionStatus: Record<string, ConnectionState>;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
const HEARTBEAT_INTERVAL_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

interface InstanceConnection {
  ws: WebSocket | null;
  status: ConnectionState;
  subscribers: Map<string, Set<EventCallback>>;
  reconnectAttempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  refCount: number;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function useWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error('useWebSocketContext must be used within a <WebSocketProvider>');
  }
  return ctx;
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const connectionsRef = useRef<Map<string, InstanceConnection>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionState>>({});

  const updateStatus = useCallback((instanceId: string, status: ConnectionState) => {
    const conn = connectionsRef.current.get(instanceId);
    if (conn) conn.status = status;
    setConnectionStatus((prev) => ({ ...prev, [instanceId]: status }));
  }, []);

  const dispatch = useCallback((instanceId: string, event: string, data: unknown) => {
    const conn = connectionsRef.current.get(instanceId);
    if (!conn) return;
    const callbacks = conn.subscribers.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => { try { cb(data); } catch { /* swallow */ } });
    }
  }, []);

  const cleanupTimers = (conn: InstanceConnection) => {
    if (conn.heartbeatTimer) { clearInterval(conn.heartbeatTimer); conn.heartbeatTimer = null; }
    if (conn.reconnectTimer) { clearTimeout(conn.reconnectTimer); conn.reconnectTimer = null; }
  };

  const scheduleReconnect = useCallback((instanceId: string) => {
    const conn = connectionsRef.current.get(instanceId);
    if (!conn || conn.refCount <= 0) return;
    const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * Math.pow(2, conn.reconnectAttempt), MAX_RECONNECT_DELAY_MS);
    conn.reconnectAttempt += 1;
    updateStatus(instanceId, 'reconnecting');
    conn.reconnectTimer = setTimeout(() => { connectWs(instanceId); }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStatus]);

  const connectWs = useCallback((instanceId: string) => {
    const conn = connectionsRef.current.get(instanceId);
    if (!conn) return;
    const url = `${WS_URL}/logs?instanceId=${encodeURIComponent(instanceId)}`;
    updateStatus(instanceId, conn.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { scheduleReconnect(instanceId); return; }
    conn.ws = ws;

    ws.onopen = () => {
      conn.reconnectAttempt = 0;
      updateStatus(instanceId, 'connected');
      if (conn.heartbeatTimer) clearInterval(conn.heartbeatTimer);
      conn.heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'ping' }));
      }, HEARTBEAT_INTERVAL_MS);
      ws.send(JSON.stringify({ event: 'subscribe-logs', data: { instanceId } }));
    };

    ws.onmessage = (msgEvent) => {
      try {
        const parsed = JSON.parse(msgEvent.data as string);
        const eventName = parsed.event || 'message';
        const eventData = parsed.data ?? parsed;
        dispatch(instanceId, eventName, eventData);
      } catch {
        dispatch(instanceId, 'message', msgEvent.data);
      }
    };

    ws.onclose = () => {
      cleanupTimers(conn);
      conn.ws = null;
      // Don't update status or reconnect if the connection was already removed (intentional cleanup)
      if (!connectionsRef.current.has(instanceId)) return;
      updateStatus(instanceId, 'disconnected');
      scheduleReconnect(instanceId);
    };

    ws.onerror = () => {
      dispatch(instanceId, 'error', { message: 'WebSocket error' });
    };
  }, [dispatch, updateStatus, scheduleReconnect]);

  const ensureConnection = useCallback((instanceId: string): InstanceConnection => {
    let conn = connectionsRef.current.get(instanceId);
    if (!conn) {
      conn = { ws: null, status: 'disconnected', subscribers: new Map(), reconnectAttempt: 0, reconnectTimer: null, heartbeatTimer: null, refCount: 0 };
      connectionsRef.current.set(instanceId, conn);
    }
    return conn;
  }, []);

  const getConnection = useCallback((instanceId: string): WebSocket | null => {
    return connectionsRef.current.get(instanceId)?.ws ?? null;
  }, []);

  const subscribe = useCallback((instanceId: string, event: string, callback: EventCallback): (() => void) => {
    const conn = ensureConnection(instanceId);
    let eventSet = conn.subscribers.get(event);
    if (!eventSet) { eventSet = new Set(); conn.subscribers.set(event, eventSet); }
    eventSet.add(callback);
    conn.refCount += 1;
    if (!conn.ws || conn.ws.readyState === WebSocket.CLOSED) connectWs(instanceId);
    return () => {
      const existing = conn.subscribers.get(event);
      if (existing) { existing.delete(callback); if (existing.size === 0) conn.subscribers.delete(event); }
      conn.refCount -= 1;
      if (conn.refCount <= 0) {
        conn.refCount = 0;
        cleanupTimers(conn);
        if (conn.ws) { conn.ws.close(); conn.ws = null; }
        connectionsRef.current.delete(instanceId);
        setConnectionStatus((prev) => { const next = { ...prev }; delete next[instanceId]; return next; });
      }
    };
  }, [ensureConnection, connectWs]);

  const send = useCallback((instanceId: string, event: string, data: unknown) => {
    const conn = connectionsRef.current.get(instanceId);
    if (conn?.ws && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify({ event, data }));
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const [, conn] of connectionsRef.current) {
        cleanupTimers(conn);
        if (conn.ws) conn.ws.close();
      }
      connectionsRef.current.clear();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ getConnection, subscribe, send, connectionStatus }}>
      {children}
    </WebSocketContext.Provider>
  );
}
