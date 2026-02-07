/** Middleware metadata from the registry */
export interface MiddlewareRegistryEntry {
  id: string;
  displayName: string;
  version: string;
  description: string;
  hooks: Array<"onRequest" | "onResponse" | "onHttpRequest" | "onHttpResponse">;
  configSchema?: Record<string, unknown>;
  emoji?: string;
}

/** A middleware assignment on a bot instance */
export interface BotMiddlewareAssignment {
  package: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

/** Payload for assigning a middleware to a bot */
export interface AssignMiddlewarePayload {
  package: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

/** Payload for updating a middleware assignment */
export interface UpdateMiddlewareAssignmentPayload {
  enabled?: boolean;
  config?: Record<string, unknown>;
}
