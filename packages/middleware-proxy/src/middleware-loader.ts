import type { IMiddleware } from "@clawster/middleware-sdk";
import type { ProxyConfig } from "./proxy-config";

export async function loadMiddlewares(config: ProxyConfig): Promise<IMiddleware[]> {
  const middlewares: IMiddleware[] = [];

  for (const entry of config.middlewares) {
    if (!entry.enabled) {
      console.log(`[MiddlewareLoader] Skipping disabled middleware: ${entry.package}`);
      continue;
    }

    console.log(`[MiddlewareLoader] Loading middleware: ${entry.package}`);

    const mod = await import(entry.package);
    const factory = mod.default ?? mod;

    if (typeof factory !== "function") {
      throw new Error(
        `Middleware "${entry.package}" does not export a factory function (default export)`
      );
    }

    const middleware = factory() as IMiddleware;

    if (!middleware.name || typeof middleware.name !== "string") {
      throw new Error(
        `Middleware from "${entry.package}" does not have a valid "name" property`
      );
    }

    console.log(`[MiddlewareLoader] Loaded middleware: ${middleware.name}`);
    middlewares.push(middleware);
  }

  return middlewares;
}
