/** WebSocket frame carrying both raw string and parsed JSON */
export interface WsFrame {
  readonly raw: string;
  readonly parsed: Record<string, unknown>;
}

/** HTTP request representation for middleware processing */
export interface HttpRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: Buffer;
  readonly query: Record<string, string>;
}

/** HTTP response representation for middleware processing */
export interface HttpResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: Buffer;
}

/** Discriminated union for middleware actions */
export type MiddlewareAction<T> =
  | { action: "pass" }
  | { action: "modify"; data: T }
  | { action: "block"; reason?: string };

/** Convenience factory for creating middleware actions */
export const MiddlewareActions = {
  pass: (): MiddlewareAction<never> => ({ action: "pass" }),
  modify: <T>(data: T): MiddlewareAction<T> => ({ action: "modify", data }),
  block: (reason?: string): MiddlewareAction<never> => ({ action: "block", reason }),
} as const;
