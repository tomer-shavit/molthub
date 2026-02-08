/**
 * Timed E2E test for Azure VM deployment with GHCR image pull.
 * Measures each step: install, configure, start, wait-for-health, websocket, destroy.
 *
 * Usage: npx ts-node --esm src/targets/__integration__/e2e-azure-timed.ts
 */
import { AzureVmTarget } from "../azure-vm/azure-vm-target";
import { WebSocket } from "ws";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const SUBSCRIPTION_ID = requireEnv("AZURE_SUBSCRIPTION_ID");
const RESOURCE_GROUP = requireEnv("AZURE_RESOURCE_GROUP");
const REGION = process.env.AZURE_REGION || "eastus2";
const TENANT_ID = process.env.AZURE_TENANT_ID;
const VM_SIZE = process.env.AZURE_VM_SIZE || "Standard_D2s_v3";
const SSH_PUBLIC_KEY = process.env.AZURE_SSH_PUBLIC_KEY || "";
const PROFILE = `e2e-azure-${Date.now().toString(36)}`;
const PORT = 18789;

interface TimedStep {
  name: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

const steps: TimedStep[] = [];

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  console.log(`\n[${name}] Starting...`);
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    steps.push({ name, durationMs, success: true });
    console.log(`[${name}] Done in ${(durationMs / 1000).toFixed(1)}s`);
    return result;
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ name, durationMs, success: false, error: msg });
    console.log(`[${name}] Failed after ${(durationMs / 1000).toFixed(1)}s: ${msg}`);
    throw err;
  }
}

function waitForWebSocket(url: string, timeoutMs: number = 180_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      reject(new Error(`WebSocket connection timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const tryConnect = () => {
      const ws = new WebSocket(url);
      ws.on("open", () => {
        clearTimeout(deadline);
        ws.close();
        resolve();
      });
      ws.on("error", () => {
        ws.terminate();
        setTimeout(tryConnect, 5000);
      });
    };

    tryConnect();
  });
}

async function main() {
  const totalStart = Date.now();
  console.log("=== Azure VM E2E Timed Test ===");
  console.log(`Profile: ${PROFILE}`);
  console.log(`Region: ${REGION}`);
  console.log(`Resource Group: ${RESOURCE_GROUP}`);

  console.log(`VM Size: ${VM_SIZE}`);

  const target = new AzureVmTarget({
    subscriptionId: SUBSCRIPTION_ID,
    resourceGroup: RESOURCE_GROUP,
    region: REGION,
    tenantId: TENANT_ID,
    vmSize: VM_SIZE,
    sshPublicKey: SSH_PUBLIC_KEY || undefined,
  });

  try {
    // Step 1: Install (creates network infra + shared infra + VM)
    const installResult = await timed("install", () =>
      target.install({ profileName: PROFILE, port: PORT }),
    );
    if (!installResult.success) throw new Error(`Install failed: ${installResult.message}`);

    // Step 2: Wait for instance to be running
    await timed("wait-for-running", async () => {
      for (let i = 0; i < 60; i++) {
        const status = await target.getStatus();
        if (status.state === "running") return;
        await new Promise((r) => setTimeout(r, 5000));
      }
      throw new Error("VM never reached running state");
    });

    // Step 3: Get endpoint
    const endpoint = await timed("get-endpoint", () => target.getEndpoint());
    console.log(`   Endpoint: ${endpoint.host}:${endpoint.port}`);

    // Step 4: Wait for OpenClaw to respond (cloud-init + container startup)
    await timed("wait-for-health", async () => {
      const url = `http://${endpoint.host}:${endpoint.port}/health`;
      for (let i = 0; i < 90; i++) {
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(url, { signal: controller.signal });
          clearTimeout(t);
          if (resp.ok) return;
        } catch {
          // keep polling
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
      throw new Error("OpenClaw health endpoint never responded");
    });

    // Step 5: Configure (push config to Key Vault + Azure Files after cloud-init done)
    const token = `test-token-${PROFILE}`;
    await timed("configure", () =>
      target.configure({
        profileName: PROFILE,
        gatewayPort: PORT,
        config: {
          gateway: {
            port: PORT,
            auth: { mode: "token", token },
          },
        },
      }),
    );

    // Step 6: WebSocket connectivity
    const wsUrl = `ws://${endpoint.host}:${endpoint.port}`;
    await timed("websocket-connect", () => waitForWebSocket(wsUrl, 60_000));

    console.log("\nOpenClaw is fully operational on Azure!");

  } finally {
    // Step 7: Destroy
    await timed("destroy", async () => {
      try { await target.stop(); } catch { /* ignore */ }
      await target.destroy();
    });

    // Print summary
    const totalMs = Date.now() - totalStart;
    console.log("\n" + "=".repeat(60));
    console.log("TIMING SUMMARY");
    console.log("=".repeat(60));
    for (const step of steps) {
      const icon = step.success ? "OK" : "FAIL";
      const time = (step.durationMs / 1000).toFixed(1).padStart(7);
      console.log(`${icon.padEnd(5)} ${step.name.padEnd(25)} ${time}s`);
    }
    console.log("-".repeat(60));
    console.log(`      ${"TOTAL".padEnd(25)} ${(totalMs / 1000).toFixed(1).padStart(7)}s`);
    console.log("=".repeat(60));
  }
}

main().catch((err) => {
  console.error("E2E test failed:", err);
  process.exit(1);
});
