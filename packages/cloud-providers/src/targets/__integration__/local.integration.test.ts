import * as os from "os";
import { execFileSync } from "child_process";
import { LocalMachineTarget } from "../local/local-target";
import {
  generateTestProfile,
  generateTestPort,
  buildTestConfig,
  cleanupTarget,
} from "./test-utils";

const IS_SUPPORTED_OS = ["linux", "darwin"].includes(os.platform());

function isMoltbotAvailable(): boolean {
  try {
    execFileSync("which", ["moltbot"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const CAN_RUN = IS_SUPPORTED_OS && isMoltbotAvailable();

(CAN_RUN ? describe : describe.skip)(
  "Local Machine Target Integration",
  () => {
    let target: LocalMachineTarget;
    let profile: string;
    let port: number;

    beforeAll(() => {
      profile = generateTestProfile();
      port = generateTestPort();
      target = new LocalMachineTarget();
    });

    afterAll(async () => {
      if (target) {
        await cleanupTarget(target);
      }
    });

    it("should install gateway service", async () => {
      const result = await target.install({
        profileName: profile,
        port,
        installMethod: "curl",
      });

      expect(result.success).toBe(true);
      expect(result.instanceId).toBeTruthy();
    });

    it("should configure with test config", async () => {
      const testConfig = buildTestConfig(profile, port);
      const result = await target.configure(testConfig);

      expect(result.success).toBe(true);
    });

    it("should start the service", async () => {
      await expect(target.start()).resolves.not.toThrow();
    });

    it("should report running status", async () => {
      const status = await target.getStatus();
      expect(status.state).toBe("running");
    });

    it("should provide gateway endpoint", async () => {
      const endpoint = await target.getEndpoint();
      expect(endpoint.host).toBeTruthy();
      expect(endpoint.port).toBe(port);
    });

    it("should stop gracefully", async () => {
      await expect(target.stop()).resolves.not.toThrow();
    });

    it("should destroy cleanly", async () => {
      await expect(target.destroy()).resolves.not.toThrow();
    });
  },
);
