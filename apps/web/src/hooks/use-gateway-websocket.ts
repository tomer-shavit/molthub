'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocketContext, type ConnectionState } from '@/lib/websocket-context';

interface GatewayWebSocketResult {
  status: ConnectionState;
  lastEvent: unknown;
  subscribe: (event: string, callback: (data: unknown) => void) => () => void;
  send: (event: string, data: unknown) => void;
}

export function useGatewayWebSocket(instanceId: string): GatewayWebSocketResult {
  const ctx = useWebSocketContext();
  const [lastEvent, setLastEvent] = useState<unknown>(null);
  const status: ConnectionState = ctx.connectionStatus[instanceId] || 'disconnected';

  useEffect(() => {
    if (!instanceId) return;
    return ctx.subscribe(instanceId, 'message', (data) => setLastEvent(data));
  }, [instanceId, ctx]);

  const subscribe = useCallback(
    (event: string, callback: (data: unknown) => void) => ctx.subscribe(instanceId, event, callback),
    [instanceId, ctx],
  );

  const send = useCallback(
    (event: string, data: unknown) => ctx.send(instanceId, event, data),
    [instanceId, ctx],
  );

  return { status, lastEvent, subscribe, send };
}
