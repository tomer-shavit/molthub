import * as http from "node:http";
import { MiddlewareChain } from "./middleware-chain";
import { loadMiddlewares } from "./middleware-loader";
import { ProxyConfigSchema } from "./proxy-config";
import { ProxyServer } from "./proxy-server";

async function waitForUpstream(
  host: string,
  port: number,
  maxAttempts = 60,
  intervalMs = 1000
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://${host}:${port}/health`, (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else {
            reject(new Error(`Health check returned ${res.statusCode}`));
          }
        });
        req.on("error", reject);
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error("Health check timeout"));
        });
      });
      console.log(
        `[MiddlewareProxy] Upstream healthy at ${host}:${port} (attempt ${attempt})`
      );
      return;
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(
          `Upstream not healthy after ${maxAttempts} attempts at ${host}:${port}`
        );
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

async function main(): Promise<void> {
  const configEnv = process.env.CLAWSTER_MIDDLEWARE_CONFIG;
  if (!configEnv) {
    console.error("[MiddlewareProxy] CLAWSTER_MIDDLEWARE_CONFIG env var not set");
    process.exit(1);
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(configEnv);
  } catch {
    console.error("[MiddlewareProxy] Failed to parse CLAWSTER_MIDDLEWARE_CONFIG as JSON");
    process.exit(1);
  }

  const config = ProxyConfigSchema.parse(rawConfig);
  console.log(
    `[MiddlewareProxy] Config: external=${config.externalPort}, internal=${config.internalHost}:${config.internalPort}, middlewares=${config.middlewares.length}`
  );

  const middlewares = await loadMiddlewares(config);
  const chain = new MiddlewareChain(middlewares);

  await waitForUpstream(config.internalHost, config.internalPort);

  await chain.initializeAll({
    botName: process.env.BOT_NAME ?? "unknown",
    externalPort: config.externalPort,
    internalPort: config.internalPort,
    middlewareConfig: {},
    logger: {
      info: (msg, ...args) => console.log(`[MiddlewareProxy]`, msg, ...args),
      warn: (msg, ...args) => console.warn(`[MiddlewareProxy]`, msg, ...args),
      error: (msg, ...args) => console.error(`[MiddlewareProxy]`, msg, ...args),
      debug: (msg, ...args) => console.debug(`[MiddlewareProxy]`, msg, ...args),
    },
  });

  const proxy = new ProxyServer({
    chain,
    externalPort: config.externalPort,
    internalPort: config.internalPort,
    internalHost: config.internalHost,
  });

  await proxy.start();
  console.log(
    `[MiddlewareProxy] Ready on port ${config.externalPort}, forwarding to ${config.internalPort}`
  );

  const shutdown = async () => {
    console.log("[MiddlewareProxy] Shutting down...");
    await proxy.stop();
    await chain.destroyAll();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[MiddlewareProxy] Fatal:", err);
  process.exit(1);
});
