'use client';

import { WebSocketProvider } from '@/lib/websocket-context';

export function WebSocketProviderWrapper({ children }: { children: React.ReactNode }) {
  return <WebSocketProvider>{children}</WebSocketProvider>;
}
