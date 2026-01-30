import { execFileSync } from "child_process";
import { CloudflareWorkersTarget } from "../cloudflare-workers/cloudflare-workers-target";
import type { CloudflareWorkersConfig } from "../../interface/deployment-target";
import {
  generateTestProfile,
  generateTestPort,
  buildTestConfig,
  cleanupTarget,
} from "./test-utils";

function isWranglerAvailable(): boolean {
  try {
    execFileSync("which", ["wrangler"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const HAS_CF_CREDS = !!(
  process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID
);
const CAN_RUN = isWranglerAvailable() && HAS_CF_CREDS;

(CAN_RUN ? describe : describe.skip)(
  "Cloudflare Workers Target Integration",
  () => {
    let target: CloudflareWorkersTarget;
    let profile: string;
    let port: number;

    beforeAll(() => {
      profile = generateTestProfile();
      port = generateTestPort();

      const config: CloudflareWorkersConfig = {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        workerName: `molthub-test-${profile}`,
        gatewayToken: `test-token-${profile}`,
        gatewayPort: port,
      };

      target = new CloudflareWorkersTarget(config);
    });

    afterAll(async () => {
      if (target) {
        await cleanupTarget(target);
      }
    });

    it("should install (generate wrangler config) successfully", async () => {
      const result = await target.install({
        profileName: profile,
        port,
      });

      expect(result.success).toBe(true);
    });

    it("should configure with test config", async () => {
      const testConfig = buildTestConfig(profile, port);
      const result = await target.configure(testConfig);

      expect(result.success).toBe(true);
    });

    it("should start (deploy worker)", async () => {
      await expect(target.start()).resolves.not.toThrow();
    });

    it("should report status", async () => {
      const status = await target.getStatus();
      expect(["running", "stopped", "error"]).toContain(status.state);
    });

    it("should provide endpoint", async () => {
      const endpoint = await target.getEndpoint();
      expect(endpoint.host).toBeTruthy();
    });

    it("should destroy (delete worker)", async () => {
      await expect(target.destroy()).resolves.not.toThrow();
    });
  },
);
