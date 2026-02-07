import type {
  HttpRequest,
  HttpResponse,
  IMiddleware,
  IMiddlewareContext,
  MiddlewareAction,
  WsFrame,
} from "@clawster/middleware-sdk";

type HookName = "onRequest" | "onResponse" | "onHttpRequest" | "onHttpResponse";

export class MiddlewareChain {
  private readonly middlewares: IMiddleware[];

  constructor(middlewares: IMiddleware[]) {
    this.middlewares = middlewares;
  }

  async processRequest(frame: WsFrame): Promise<WsFrame | null> {
    return this.processHook("onRequest", frame);
  }

  async processResponse(frame: WsFrame): Promise<WsFrame | null> {
    return this.processHook("onResponse", frame);
  }

  async processHttpRequest(req: HttpRequest): Promise<HttpRequest | null> {
    return this.processHook("onHttpRequest", req);
  }

  async processHttpResponse(res: HttpResponse): Promise<HttpResponse | null> {
    return this.processHook("onHttpResponse", res);
  }

  async initializeAll(context: IMiddlewareContext): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.initialize) {
        await mw.initialize(context);
      }
    }
  }

  async destroyAll(): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.destroy) {
        try {
          await mw.destroy();
        } catch {
          // Swallow errors during teardown — best effort
        }
      }
    }
  }

  private async processHook<T>(hook: HookName, data: T): Promise<T | null> {
    let current = data;

    for (const mw of this.middlewares) {
      const hookFn = mw[hook] as
        | ((data: Readonly<T>) => Promise<MiddlewareAction<T>>)
        | undefined;

      if (!hookFn) continue;

      try {
        const result = await hookFn.call(mw, current);

        switch (result.action) {
          case "pass":
            break;
          case "modify":
            current = result.data;
            break;
          case "block":
            return null;
        }
      } catch (err) {
        console.error(
          `[MiddlewareChain] Middleware "${mw.name}" threw in ${hook}:`,
          err
        );
      }
    }

    return current;
  }
}
