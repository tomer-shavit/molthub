import { execFileSync } from "node:child_process";
import type { IMiddleware } from "@clawster/middleware-sdk";
import type { ProxyConfig } from "./proxy-config";

/**
 * Ensures a middleware package is available for import.
 * Tries dynamic import first; if the package is missing, installs it via npm.
 * This is the Grafana GF_INSTALL_PLUGINS pattern for Node.js — the proxy
 * auto-installs community middleware packages at startup.
 */
async function ensureInstalled(packageName: string): Promise<void> {
  try {
    await import(packageName);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") {
      throw err;
    }
    console.log(`[MiddlewareLoader] Package "${packageName}" not found, installing...`);
    execFileSync("npm", ["install", "--no-save", packageName], { stdio: "inherit" });
    console.log(`[MiddlewareLoader] Package "${packageName}" installed successfully`);
  }
}

export async function loadMiddlewares(config: ProxyConfig): Promise<IMiddleware[]> {
  const middlewares: IMiddleware[] = [];

  for (const entry of config.middlewares) {
    if (!entry.enabled) {
      console.log(`[MiddlewareLoader] Skipping disabled middleware: ${entry.package}`);
      continue;
    }

    console.log(`[MiddlewareLoader] Loading middleware: ${entry.package}`);

    await ensureInstalled(entry.package);

    const mod = await import(entry.package);
    // Handle CJS interop: dynamic import() of CJS wraps module.exports as mod.default
    // If the CJS module uses __esModule + named "default" export, the factory is at mod.default.default
    const raw = mod.default ?? mod;
    const factory = typeof raw === "function" ? raw : (raw.default ?? raw);

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
