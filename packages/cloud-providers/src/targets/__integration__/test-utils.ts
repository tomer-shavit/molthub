import { execFile } from "child_process";
import type {
  DeploymentTarget,
  OpenClawConfigPayload,
  GatewayEndpoint,
} from "../../interface/deployment-target";

/**
 * Generate a unique test profile name to avoid conflicts between test runs.
 */
export function generateTestProfile(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `test-${timestamp}-${random}`;
}

/**
 * Generate a test port that's unlikely to conflict.
 * Uses range 19000-19900 with random offset.
 */
export function generateTestPort(): number {
  return 19000 + Math.floor(Math.random() * 900);
}

/**
 * Build a minimal valid OpenClawConfigPayload for testing.
 */
export function buildTestConfig(
  profileName: string,
  port: number,
): OpenClawConfigPayload {
  return {
    profileName,
    gatewayPort: port,
    environment: {
      OPENCLAW_PROFILE: profileName,
    },
    config: {
      gateway: {
        port,
        auth: {
          mode: "token",
          token: `test-token-${profileName}`,
        },
      },
      agents: {
        defaults: {
          workspace: `/tmp/clawster-test-${profileName}`,
        },
      },
    },
  };
}

/**
 * Wait for a Gateway health endpoint to respond successfully.
 * Polls every 5 seconds up to the specified timeout.
 */
export async function waitForHealth(
  endpoint: GatewayEndpoint,
  timeoutMs: number = 120_000,
): Promise<boolean> {
  const startTime = Date.now();
  const pollIntervalMs = 5_000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const url = `http://${endpoint.host}:${endpoint.port}/health`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        return true;
      }
    } catch {
      // Connection refused or timeout — keep polling
    }

    await sleep(pollIntervalMs);
  }

  return false;
}

/**
 * Execute a shell command and return stdout.
 */
export function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `${cmd} ${args.join(" ")} failed: ${stderr || error.message}`,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Best-effort cleanup of a deployment target.
 * Logs but does not throw on failure.
 */
export async function cleanupTarget(target: DeploymentTarget): Promise<void> {
  try {
    await target.stop();
  } catch {
    // ignore stop errors during cleanup
  }
  try {
    await target.destroy();
  } catch {
    // ignore destroy errors during cleanup
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Conditionally run a test — if the condition is false, the test is skipped
 * (marked as pending/skipped in the Jest output) rather than silently passing.
 */
export function itIf(condition: boolean | (() => boolean)) {
  const shouldRun = typeof condition === "function" ? condition() : condition;
  return shouldRun ? it : it.skip;
}

/**
 * Conditionally run a describe block — if the condition is false, all tests
 * within are skipped (marked as pending in Jest output).
 */
export function describeIf(condition: boolean | (() => boolean)) {
  const shouldRun = typeof condition === "function" ? condition() : condition;
  return shouldRun ? describe : describe.skip;
}
