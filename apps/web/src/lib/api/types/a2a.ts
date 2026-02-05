/**
 * A2A (Agent-to-Agent) types.
 */

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
}

export interface AgentAuthentication {
  schemes: string[];
  credentials?: string;
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  skills: AgentSkill[];
  capabilities: AgentCapabilities;
  authentication: AgentAuthentication;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  provider?: {
    organization: string;
    url?: string;
  };
}

export interface A2aTaskStatus {
  state: string;
  message?: {
    messageId: string;
    role: string;
    parts: { text?: string }[];
  };
  timestamp?: string;
}

export interface A2aTask {
  id: string;
  contextId: string;
  status: A2aTaskStatus;
  artifacts?: unknown[];
}

export interface A2aJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: A2aTask;
  error?: { code: number; message: string };
}

export interface A2aApiKeyInfo {
  id: string;
  keyPrefix: string;
  label: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface A2aApiKeyCreateResponse {
  key: string;
  id: string;
}

export interface A2aTaskInfo {
  id: string;
  contextId: string;
  status: {
    state: string;
    message?: {
      messageId: string;
      role: string;
      parts: { text?: string }[];
    };
    timestamp?: string;
  };
  history?: {
    messageId: string;
    role: string;
    parts: { text?: string }[];
  }[];
  metadata?: {
    startedAt?: string;
    endedAt?: string | null;
    durationMs?: number | null;
    inputText?: string | null;
  };
}

export interface A2aStreamCallbacks {
  onChunk: (text: string) => void;
  onStatus: (state: string, taskId: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}
