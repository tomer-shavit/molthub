import type { IMiddlewareContext } from "./middleware-context.interface";
import type { HttpRequest, HttpResponse, MiddlewareAction, WsFrame } from "./types";

/** Core middleware interface — all hooks are optional */
export interface IMiddleware {
  readonly name: string;

  initialize?(context: IMiddlewareContext): Promise<void>;
  destroy?(): Promise<void>;

  onRequest?(frame: Readonly<WsFrame>): Promise<MiddlewareAction<WsFrame>>;
  onResponse?(frame: Readonly<WsFrame>): Promise<MiddlewareAction<WsFrame>>;
  onHttpRequest?(req: Readonly<HttpRequest>): Promise<MiddlewareAction<HttpRequest>>;
  onHttpResponse?(res: Readonly<HttpResponse>): Promise<MiddlewareAction<HttpResponse>>;
}

/** Middleware metadata for self-describing middlewares */
export interface MiddlewareMetadata {
  readonly displayName: string;
  readonly version: string;
  readonly description: string;
  readonly hooks: ReadonlyArray<"onRequest" | "onResponse" | "onHttpRequest" | "onHttpResponse">;
  readonly configSchema?: Record<string, unknown>;
}

/** Extended middleware interface that provides metadata */
export interface ISelfDescribingMiddleware extends IMiddleware {
  getMetadata(): MiddlewareMetadata;
}

/** Type guard for self-describing middlewares */
export function isSelfDescribing(
  middleware: IMiddleware
): middleware is ISelfDescribingMiddleware {
  return (
    "getMetadata" in middleware &&
    typeof (middleware as ISelfDescribingMiddleware).getMetadata === "function"
  );
}
