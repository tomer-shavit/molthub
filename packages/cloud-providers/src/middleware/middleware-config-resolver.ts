/**
 * Middleware Config Resolver
 *
 * Pure functions for resolving middleware configuration from bot instance
 * metadata into proxy container environment variables and naming conventions.
 */

import type { MiddlewareAssignment } from "../interface/deployment-target";

/** Internal proxy port (fixed — the proxy always listens/forwards on this) */
const PROXY_PORT = 18789;

/**
 * Checks whether a bot instance has any active (enabled) middleware assignments.
 */
export function hasActiveMiddleware(
  metadata: Record<string, unknown> | string | null | undefined,
): boolean {
  const parsed = typeof metadata === "string" ? safeParse(metadata) : metadata;
  const mwConfig = (parsed as Record<string, unknown> | undefined)?.middlewareConfig as
    | { middlewares?: MiddlewareAssignment[] }
    | undefined;
  const middlewares = mwConfig?.middlewares ?? [];
  return middlewares.some((m) => m.enabled);
}

/**
 * Extracts enabled middleware assignments from instance metadata.
 */
export function getEnabledMiddlewares(
  metadata: Record<string, unknown> | string | null | undefined,
): MiddlewareAssignment[] {
  const parsed = typeof metadata === "string" ? safeParse(metadata) : metadata;
  const mwConfig = (parsed as Record<string, unknown> | undefined)?.middlewareConfig as
    | { middlewares?: MiddlewareAssignment[] }
    | undefined;
  return (mwConfig?.middlewares ?? []).filter((m) => m.enabled);
}

/**
 * Builds the CLAWSTER_MIDDLEWARE_CONFIG JSON string for the proxy container.
 */
export function buildProxyEnvConfig(opts: {
  internalHost: string;
  internalPort?: number;
  externalPort?: number;
  middlewares: MiddlewareAssignment[];
}): string {
  return JSON.stringify({
    externalPort: opts.externalPort ?? PROXY_PORT,
    internalPort: opts.internalPort ?? PROXY_PORT,
    internalHost: opts.internalHost,
    middlewares: opts.middlewares.map((m) => ({
      package: m.package,
      enabled: m.enabled,
      config: m.config,
    })),
  });
}

/** Returns the proxy container name for a given bot container name */
export function getProxyContainerName(botContainerName: string): string {
  return `proxy-${botContainerName}`;
}

/** Returns the Docker network name for middleware isolation */
export function getNetworkName(botContainerName: string): string {
  return `clawster-mw-${botContainerName}`;
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
