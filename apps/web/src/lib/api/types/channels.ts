/**
 * Channel types.
 */

export interface ChannelBotBinding {
  id: string;
  botId: string;
  channelId: string;
  purpose: string;
  isActive: boolean;
  settings: Record<string, unknown> | null;
  targetDestination: Record<string, unknown> | null;
  healthStatus: string | null;
  lastHealthCheck: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  name: string;
  workspaceId: string;
  type: string;
  config: string;
  defaults: string | null;
  isShared: boolean;
  tags: string | null;
  status: string;
  statusMessage: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
  errorCount: number;
  messagesSent: number;
  messagesFailed: number;
  lastMessageAt: string | null;
  lastActivityAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  botBindings: ChannelBotBinding[];
}

export interface ChannelTypeInfo {
  type: string;
  label: string;
  requiresNodeRuntime: boolean;
  authMethod: 'qr-pairing' | 'token' | 'credentials' | 'service-account';
  requiredSecrets: string[];
  optionalSecrets: string[];
  defaultConfig: Record<string, unknown>;
}

export interface CreateChannelPayload {
  name: string;
  workspaceId: string;
  openclawType: string;
  enabled?: boolean;
  policies?: {
    dmPolicy?: string;
    groupPolicy?: string;
    allowFrom?: string[];
    groupAllowFrom?: string[];
    historyLimit?: number;
    mediaMaxMb?: number;
  };
  typeConfig?: Record<string, unknown>;
  secrets?: Record<string, string>;
  isShared?: boolean;
}

export interface ChannelBinding {
  id: string;
  channelType: string;
  status: "active" | "inactive" | "error";
  config?: Record<string, unknown>;
}

export interface ChannelAuthStatus {
  channelId: string;
  state: 'paired' | 'pending' | 'expired' | 'error' | 'not_started';
  qrCodeUrl?: string;
  errorMessage?: string;
}
