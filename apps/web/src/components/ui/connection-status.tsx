'use client';

import { cn } from '@/lib/utils';
import type { ConnectionState } from '@/lib/websocket-context';

interface ConnectionStatusProps {
  status: ConnectionState;
  className?: string;
  showLabel?: boolean;
}

const statusConfig: Record<ConnectionState, { dotColor: string; label: string }> = {
  connected: { dotColor: 'bg-green-500', label: 'Live' },
  reconnecting: { dotColor: 'bg-yellow-500', label: 'Reconnecting...' },
  disconnected: { dotColor: 'bg-red-500', label: 'Disconnected' },
  connecting: { dotColor: 'bg-gray-400', label: 'Connecting...' },
};

export function ConnectionStatus({ status, className, showLabel = true }: ConnectionStatusProps) {
  const config = statusConfig[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', config.dotColor, status === 'connected' && 'animate-pulse')} />
      {showLabel && <span className="text-xs text-muted-foreground font-medium">{config.label}</span>}
    </span>
  );
}
