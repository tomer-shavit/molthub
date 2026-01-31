import {
  DeploymentTargetType,
  CloudflareWorkersConfig,
  DeploymentTargetConfig,
} from "../../../interface/deployment-target";
import {
  mapEnvironment,
  isSecretKey,
  rewriteAiGatewayUrl,
  getSecretEntries,
} from "../env-mapper";
import {
  generateWranglerConfig,
  generateWorkerEntryPoint,
} from "../wrangler-generator";
import { R2StateSync } from "../r2-state-sync";
import { CloudflareWorkersTarget } from "../cloudflare-workers-target";
import { DeploymentTargetFactory } from "../../factory";

// ── Test Fixtures ──

function makeConfig(overrides?: Partial<CloudflareWorkersConfig>): CloudflareWorkersConfig {
  return {
    accountId: "test-account-123",
    workerName: "openclaw-test-worker",
    gatewayToken: "test-gateway-token-abc",
    gatewayPort: 18789,
    ...overrides,
  };
}

function makeFullConfig(): CloudflareWorkersConfig {
  return makeConfig({
    r2BucketName: "openclaw-state-bucket",
    r2AccessKeyId: "r2-access-key",
    r2SecretAccessKey: "r2-secret-key",
    aiGatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/acct/gw",
    aiGatewayApiKey: "ai-gw-api-key",
    sandboxInstanceType: "performance-8",
    customDomain: "bot.example.com",
  });
}

// ── Env Mapper Tests ──

describe("env-mapper", () => {
  describe("mapEnvironment", () => {
    it("maps minimal config to container env, secrets, and vars", () => {
      const config = makeConfig();
      const result = mapEnvironment(config);

      // Container env
      expect(result.containerEnv.OPENCLAW_GATEWAY_TOKEN).toBe("test-gateway-token-abc");
      expect(result.containerEnv.OPENCLAW_GATEWAY_PORT).toBe("18789");
      expect(result.containerEnv.OPENCLAW_CONFIG_PATH).toBe("/app/config/openclaw.json");
      expect(result.containerEnv.OPENCLAW_STATE_DIR).toBe("/app/state");

      // Worker secrets
      expect(result.workerSecrets.OPENCLAW_GATEWAY_TOKEN).toBe("test-gateway-token-abc");

      // Worker vars
      expect(result.workerVars.WORKER_NAME).toBe("openclaw-test-worker");
      expect(result.workerVars.GATEWAY_PORT).toBe("18789");
      expect(result.workerVars.SANDBOX_INSTANCE_TYPE).toBe("standard-4");
    });

    it("maps R2 config to secrets and vars", () => {
      const config = makeFullConfig();
      const result = mapEnvironment(config);

      expect(result.workerSecrets.R2_ACCESS_KEY_ID).toBe("r2-access-key");
      expect(result.workerSecrets.R2_SECRET_ACCESS_KEY).toBe("r2-secret-key");
      expect(result.workerVars.R2_BUCKET_NAME).toBe("openclaw-state-bucket");
    });

    it("maps AI Gateway config", () => {
      const config = makeFullConfig();
      const result = mapEnvironment(config);

      expect(result.workerVars.AI_GATEWAY_BASE_URL).toBe(
        "https://gateway.ai.cloudflare.com/v1/acct/gw"
      );
      expect(result.workerSecrets.AI_GATEWAY_API_KEY).toBe("ai-gw-api-key");
    });

    it("maps custom domain", () => {
      const config = makeFullConfig();
      const result = mapEnvironment(config);

      expect(result.workerVars.CUSTOM_DOMAIN).toBe("bot.example.com");
    });

    it("separates additional env into secrets vs vars by key name", () => {
      const config = makeConfig();
      const additionalEnv = {
        ANTHROPIC_API_KEY: "sk-ant-12345",
        NODE_ENV: "production",
        DATABASE_PASSWORD: "dbpass",
        LOG_LEVEL: "info",
      };

      const result = mapEnvironment(config, additionalEnv);

      // Secret keys go to workerSecrets
      expect(result.workerSecrets.ANTHROPIC_API_KEY).toBe("sk-ant-12345");
      expect(result.workerSecrets.DATABASE_PASSWORD).toBe("dbpass");

      // Non-secret keys go to workerVars
      expect(result.workerVars.NODE_ENV).toBe("production");
      expect(result.workerVars.LOG_LEVEL).toBe("info");

      // All additional env goes to containerEnv
      expect(result.containerEnv.ANTHROPIC_API_KEY).toBe("sk-ant-12345");
      expect(result.containerEnv.NODE_ENV).toBe("production");
    });

    it("uses default sandbox instance type when not specified", () => {
      const config = makeConfig();
      const result = mapEnvironment(config);

      expect(result.workerVars.SANDBOX_INSTANCE_TYPE).toBe("standard-4");
    });

    it("uses custom sandbox instance type when specified", () => {
      const config = makeConfig({ sandboxInstanceType: "performance-8" });
      const result = mapEnvironment(config);

      expect(result.workerVars.SANDBOX_INSTANCE_TYPE).toBe("performance-8");
    });
  });

  describe("isSecretKey", () => {
    it("identifies secret keys correctly", () => {
      expect(isSecretKey("ANTHROPIC_API_KEY")).toBe(true);
      expect(isSecretKey("DATABASE_PASSWORD")).toBe(true);
      expect(isSecretKey("OPENCLAW_GATEWAY_TOKEN")).toBe(true);
      expect(isSecretKey("R2_SECRET_ACCESS_KEY")).toBe(true);
      expect(isSecretKey("AWS_CREDENTIAL")).toBe(true);
      expect(isSecretKey("SSH_PRIVATE_KEY")).toBe(true);
    });

    it("identifies non-secret keys correctly", () => {
      expect(isSecretKey("NODE_ENV")).toBe(false);
      expect(isSecretKey("LOG_LEVEL")).toBe(false);
      expect(isSecretKey("WORKER_NAME")).toBe(false);
      expect(isSecretKey("GATEWAY_PORT")).toBe(false);
    });
  });

  describe("rewriteAiGatewayUrl", () => {
    it("returns Cloudflare AI Gateway URLs unchanged", () => {
      const url = "https://gateway.ai.cloudflare.com/v1/acct/gw";
      expect(rewriteAiGatewayUrl(url)).toBe(url);
    });

    it("returns non-Cloudflare URLs unchanged", () => {
      const url = "https://my-proxy.example.com/ai-gateway";
      expect(rewriteAiGatewayUrl(url)).toBe(url);
    });
  });

  describe("getSecretEntries", () => {
    it("returns entries for defined secrets only", () => {
      const entries = getSecretEntries({
        OPENCLAW_GATEWAY_TOKEN: "token",
        R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: undefined,
      });

      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual(["OPENCLAW_GATEWAY_TOKEN", "token"]);
      expect(entries).toContainEqual(["R2_ACCESS_KEY_ID", "key"]);
    });
  });
});

// ── Wrangler Generator Tests ──

describe("wrangler-generator", () => {
  describe("generateWranglerConfig", () => {
    it("generates wrangler.jsonc with correct worker name and account", () => {
      const config = makeConfig();
      const vars = { WORKER_NAME: "openclaw-test-worker", GATEWAY_PORT: "18789" };
      const output = generateWranglerConfig(config, vars);

      expect(output.wranglerJsonc).toContain("openclaw-test-worker");
      expect(output.wranglerJsonc).toContain("test-account-123");
      expect(output.wranglerJsonc).toContain("Generated by Molthub");
    });

    it("generates wrangler.jsonc with R2 binding when configured", () => {
      const config = makeConfig({ r2BucketName: "my-state-bucket" });
      const vars = {};
      const output = generateWranglerConfig(config, vars);

      expect(output.wranglerJsonc).toContain("STATE_BUCKET");
      expect(output.wranglerJsonc).toContain("my-state-bucket");
    });

    it("generates wrangler.jsonc without R2 when not configured", () => {
      const config = makeConfig();
      const vars = {};
      const output = generateWranglerConfig(config, vars);

      expect(output.wranglerJsonc).not.toContain("STATE_BUCKET");
    });

    it("includes custom domain route when configured", () => {
      const config = makeConfig({ customDomain: "bot.example.com" });
      const vars = {};
      const output = generateWranglerConfig(config, vars);

      expect(output.wranglerJsonc).toContain("bot.example.com");
      expect(output.wranglerJsonc).toContain("custom_domain");
    });

    it("includes container/sandbox configuration", () => {
      const config = makeConfig({ sandboxInstanceType: "performance-8" });
      const vars = {};
      const output = generateWranglerConfig(config, vars);

      expect(output.wranglerJsonc).toContain("containers");
      expect(output.wranglerJsonc).toContain("openclaw-gateway");
      expect(output.wranglerJsonc).toContain("performance-8");
    });

    it("includes vars section when worker vars are provided", () => {
      const config = makeConfig();
      const vars = { FOO: "bar", BAZ: "qux" };
      const output = generateWranglerConfig(config, vars);

      expect(output.wranglerJsonc).toContain('"FOO"');
      expect(output.wranglerJsonc).toContain('"bar"');
    });

    it("generates a valid Dockerfile", () => {
      const config = makeConfig();
      const vars = {};
      const output = generateWranglerConfig(config, vars);

      expect(output.dockerfile).toContain("FROM ghcr.io/openclaw/openclaw:latest");
      expect(output.dockerfile).toContain("EXPOSE 18789");
      expect(output.dockerfile).toContain("start-openclaw.sh");
      expect(output.dockerfile).toContain("OPENCLAW_CONFIG_PATH");
      expect(output.dockerfile).toContain("OPENCLAW_STATE_DIR");
    });

    it("generates a valid start script", () => {
      const config = makeConfig();
      const vars = {};
      const output = generateWranglerConfig(config, vars);

      expect(output.startScript).toContain("#!/bin/bash");
      expect(output.startScript).toContain("set -euo pipefail");
      expect(output.startScript).toContain("openclaw gateway --port 18789");
      expect(output.startScript).toContain("SIGTERM");
      expect(output.startScript).toContain("OPENCLAW_CONFIG_JSON");
    });
  });

  describe("generateWorkerEntryPoint", () => {
    it("generates entry point with proxy to gateway port", () => {
      const config = makeConfig();
      const entryPoint = generateWorkerEntryPoint(config);

      expect(entryPoint).toContain("export default");
      expect(entryPoint).toContain("fetch");
      expect(entryPoint).toContain("18789");
      expect(entryPoint).toContain("Gateway unavailable");
    });

    it("includes scheduled handler when R2 is configured", () => {
      const config = makeConfig({ r2BucketName: "my-bucket" });
      const entryPoint = generateWorkerEntryPoint(config);

      expect(entryPoint).toContain("scheduled");
      expect(entryPoint).toContain("Scheduled state backup");
    });

    it("omits scheduled handler when R2 is not configured", () => {
      const config = makeConfig();
      const entryPoint = generateWorkerEntryPoint(config);

      expect(entryPoint).not.toContain("scheduled");
    });
  });
});

// ── R2 State Sync Tests ──

describe("r2-state-sync", () => {
  describe("R2StateSync", () => {
    it("returns failure when R2 bucket is not configured for backup", async () => {
      const config = makeConfig(); // no r2BucketName
      const sync = new R2StateSync(config);

      const result = await sync.backupToR2();
      expect(result.success).toBe(false);
      expect(result.message).toContain("R2 bucket not configured");
    });

    it("returns failure when R2 bucket is not configured for restore", async () => {
      const config = makeConfig();
      const sync = new R2StateSync(config);

      const result = await sync.restoreFromR2();
      expect(result.success).toBe(false);
      expect(result.message).toContain("R2 bucket not configured");
    });

    it("shouldRestore returns false when R2 is not configured", async () => {
      const config = makeConfig();
      const sync = new R2StateSync(config);

      const result = await sync.shouldRestore();
      expect(result.shouldRestore).toBe(false);
      expect(result.reason).toContain("R2 bucket not configured");
    });

    it("validates state directory with missing critical files", async () => {
      const config = makeConfig({ r2BucketName: "test-bucket" });
      const sync = new R2StateSync(config, "/nonexistent/path");

      const result = await sync.validateBeforeSync("/nonexistent/path");
      expect(result.valid).toBe(false);
      expect(result.missingFiles.length).toBeGreaterThan(0);
      expect(result.message).toContain("Missing critical files");
    });
  });
});

// ── Factory Tests ──

describe("DeploymentTargetFactory", () => {
  it("creates CloudflareWorkersTarget from config", () => {
    const config: DeploymentTargetConfig = {
      type: "cloudflare-workers",
      cloudflare: makeConfig(),
    };

    const target = DeploymentTargetFactory.create(config);
    expect(target).toBeInstanceOf(CloudflareWorkersTarget);
    expect(target.type).toBe(DeploymentTargetType.CLOUDFLARE_WORKERS);
  });

  it("throws when cloudflare config is missing", () => {
    const config = { type: "cloudflare-workers" } as DeploymentTargetConfig;

    expect(() => DeploymentTargetFactory.create(config)).toThrow(
      "Cloudflare Workers target requires 'cloudflare' configuration"
    );
  });

  it("includes Cloudflare Workers in available targets", () => {
    const targets = DeploymentTargetFactory.getAvailableTargets();
    const cfTarget = targets.find(
      (t) => t.type === DeploymentTargetType.CLOUDFLARE_WORKERS
    );

    expect(cfTarget).toBeDefined();
    expect(cfTarget!.name).toBe("Cloudflare Workers");
    expect(cfTarget!.status).toBe("ready");
  });

  it("reports Cloudflare Workers as supported", () => {
    expect(
      DeploymentTargetFactory.isTargetSupported(DeploymentTargetType.CLOUDFLARE_WORKERS)
    ).toBe(true);
  });

  it("uses createByType correctly for cloudflare-workers", () => {
    const config: DeploymentTargetConfig = {
      type: "cloudflare-workers",
      cloudflare: makeConfig(),
    };

    const target = DeploymentTargetFactory.createByType(
      DeploymentTargetType.CLOUDFLARE_WORKERS,
      config
    );
    expect(target).toBeInstanceOf(CloudflareWorkersTarget);
  });
});

// ── CloudflareWorkersTarget Unit Tests ──

describe("CloudflareWorkersTarget", () => {
  it("has correct type", () => {
    const target = new CloudflareWorkersTarget(makeConfig());
    expect(target.type).toBe(DeploymentTargetType.CLOUDFLARE_WORKERS);
  });

  it("returns correct endpoint for custom domain", async () => {
    const target = new CloudflareWorkersTarget(
      makeConfig({ customDomain: "bot.example.com" })
    );
    const endpoint = await target.getEndpoint();

    expect(endpoint.host).toBe("bot.example.com");
    expect(endpoint.port).toBe(18789);
    expect(endpoint.protocol).toBe("wss");
  });

  it("returns default workers.dev endpoint when no custom domain", async () => {
    const target = new CloudflareWorkersTarget(makeConfig());
    const endpoint = await target.getEndpoint();

    expect(endpoint.host).toContain("openclaw-test-worker");
    expect(endpoint.host).toContain("workers.dev");
    expect(endpoint.port).toBe(18789);
    expect(endpoint.protocol).toBe("wss");
  });

  it("exposes R2StateSync via getR2Sync()", () => {
    const target = new CloudflareWorkersTarget(makeConfig());
    const sync = target.getR2Sync();
    expect(sync).toBeInstanceOf(R2StateSync);
  });

  it("getStatus returns not-installed when not deployed", async () => {
    const target = new CloudflareWorkersTarget(makeConfig());
    const status = await target.getStatus();
    // Since curl will fail in test env, expect not-installed
    expect(["not-installed", "error"]).toContain(status.state);
  });
});
