import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";
import { DockerContainerTarget } from "../docker/docker-target";
import type { DockerTargetConfig } from "../../interface/deployment-target";
import {
  generateTestProfile,
  generateTestPort,
  buildTestConfig,
  cleanupTarget,
} from "./test-utils";

function isDockerAvailable(): boolean {
  try {
    execFileSync("which", ["docker"], { stdio: "ignore" });
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

const DOCKER_AVAILABLE = isDockerAvailable();

(DOCKER_AVAILABLE ? describe : describe.skip)(
  "Docker Container Target Integration",
  () => {
    let target: DockerContainerTarget;
    let profile: string;
    let port: number;
    let configDir: string;

    beforeAll(() => {
      profile = generateTestProfile();
      port = generateTestPort();
      configDir = path.join(os.tmpdir(), `clawster-docker-test-${profile}`);
      fs.mkdirSync(configDir, { recursive: true });

      const config: DockerTargetConfig = {
        containerName: `clawster-test-${profile}`,
        configPath: configDir,
        gatewayPort: port,
      };

      target = new DockerContainerTarget(config);
    });

    afterAll(async () => {
      if (target) {
        await cleanupTarget(target);
      }
      if (configDir && fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true });
      }
    });

    it("should install (pull image) successfully", async () => {
      const result = await target.install({
        profileName: profile,
        port,
      });

      expect(result.success).toBe(true);
      expect(result.instanceId).toBeTruthy();
    });

    it("should configure successfully", async () => {
      const testConfig = buildTestConfig(profile, port);
      const result = await target.configure(testConfig);

      expect(result.success).toBe(true);
    });

    it("should start the container", async () => {
      await expect(target.start()).resolves.not.toThrow();
    });

    it("should report running status", async () => {
      const status = await target.getStatus();
      expect(status.state).toBe("running");
    });

    it("should provide a gateway endpoint", async () => {
      const endpoint = await target.getEndpoint();
      expect(endpoint.host).toBeTruthy();
      expect(endpoint.port).toBe(port);
      expect(["ws", "wss"]).toContain(endpoint.protocol);
    });

    it("should return logs", async () => {
      const logs = await target.getLogs({ lines: 10 });
      expect(Array.isArray(logs)).toBe(true);
    });

    it("should stop gracefully", async () => {
      await expect(target.stop()).resolves.not.toThrow();

      const status = await target.getStatus();
      expect(status.state).toBe("stopped");
    });

    it("should destroy cleanly", async () => {
      await expect(target.destroy()).resolves.not.toThrow();
    });
  },
);
