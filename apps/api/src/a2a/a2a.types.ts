// A2A Protocol Types — Agent Card, JSON-RPC 2.0, and Task types

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

// --- JSON-RPC 2.0 ---

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

// --- A2A Message Parts ---

export interface TextPart {
  text: string;
  mediaType?: string;
}

export interface FilePart {
  url: string;
  mediaType?: string;
  filename?: string;
}

export interface DataPart {
  data: Record<string, unknown>;
  mediaType?: string;
}

export type Part = TextPart | FilePart | DataPart;

// --- A2A Message ---

export interface A2aMessage {
  messageId: string;
  role: "user" | "agent";
  parts: Part[];
  contextId?: string;
  taskId?: string;
  referenceTaskIds?: string[];
  metadata?: Record<string, unknown>;
}

// --- A2A SendMessage Params ---

export interface SendMessageConfiguration {
  acceptedOutputModes?: string[];
  blocking?: boolean;
  historyLength?: number;
}

export interface SendMessageParams {
  message: A2aMessage;
  configuration?: SendMessageConfiguration;
  metadata?: Record<string, unknown>;
}

// --- A2A Task ---

export type TaskState =
  | "submitted"
  | "working"
  | "input_required"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected";

export interface TaskStatus {
  state: TaskState;
  message?: A2aMessage;
  timestamp?: string;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

export interface A2aTask {
  id: string;
  contextId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: A2aMessage[];
  metadata?: Record<string, unknown>;
}
