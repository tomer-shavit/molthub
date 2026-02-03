import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";
import { DockerContainerTarget, DockerTargetConfigExtended } from "../docker/docker-target";
import type { DockerTargetConfig } from "../../interface/deployment-target";
import {
  detectPlatform,
  detectSysboxCapability,
  isSysboxAvailable,
  getRecommendedRuntime,
} from "../../sysbox";
import {
  generateTestProfile,
  generateTestPort,
  buildTestConfig,
  cleanupTarget,
  describeIf,
  itIf,
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

describe("Sysbox Capability Detection", () => {
  it("should detect platform correctly", async () => {
    const platform = await detectPlatform();
    expect(["linux", "macos", "wsl2", "windows-native"]).toContain(platform);
  });

  it("should return valid SysboxCapability structure", async () => {
    const capability = await detectSysboxCapability();

    expect(capability).toBeDefined();
    expect(capability.available).toBeDefined();
    expect(["available", "not-installed", "unavailable", "unsupported"]).toContain(
      capability.available
    );

    // If available, version might be present
    if (capability.available === "available") {
      // Version is optional but if present should be a string
      if (capability.version !== undefined) {
        expect(typeof capability.version).toBe("string");
      }
    }

    // If not installed, might have install method
    if (capability.available === "not-installed") {
      if (capability.installMethod !== undefined) {
        expect(["apt", "rpm", "lima", "wsl2", "manual"]).toContain(
          capability.installMethod
        );
      }
    }
  });

  it("should return boolean from isSysboxAvailable", async () => {
    const available = await isSysboxAvailable();
    expect(typeof available).toBe("boolean");
  });

  it("should return valid runtime from getRecommendedRuntime", async () => {
    const runtime = await getRecommendedRuntime();
    expect(["runc", "sysbox-runc"]).toContain(runtime);
  });
});

describeIf(DOCKER_AVAILABLE)(
  "Docker Target Sysbox Integration",
  () => {
    let target: DockerContainerTarget;
    let profile: string;
    let port: number;
    let configDir: string;

    beforeAll(() => {
      profile = generateTestProfile();
      port = generateTestPort();
      configDir = path.join(os.tmpdir(), `clawster-sysbox-test-${profile}`);
      fs.mkdirSync(configDir, { recursive: true });

      // DREAM ARCHITECTURE: Sysbox is mandatory. For integration tests on machines
      // without Sysbox, we use allowInsecureWithoutSysbox: true as a dev/test escape hatch.
      const config: DockerTargetConfigExtended = {
        containerName: `clawster-sysbox-test-${profile}`,
        configPath: configDir,
        gatewayPort: port,
        allowInsecureWithoutSysbox: true, // Allow tests to run without Sysbox installed
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

    it("should auto-detect runtime during start", async () => {
      // Install first to get the image ready
      const installResult = await target.install({
        profileName: profile,
        port,
      });
      expect(installResult.success).toBe(true);

      // Configure
      const testConfig = buildTestConfig(profile, port);
      await target.configure(testConfig);

      // Start - this should trigger runtime detection
      await target.start();

      // Check that runtime was detected
      const runtime = target.getRuntime();
      expect(["runc", "sysbox-runc"]).toContain(runtime);

      // The isSysboxEnabled should match the runtime
      const sysboxEnabled = target.isSysboxEnabled();
      expect(sysboxEnabled).toBe(runtime === "sysbox-runc");

      // Stop for next tests
      await target.stop();
    });

    it("should include runtime info in status", async () => {
      // Start again
      await target.start();

      const status = await target.getStatus();
      expect(status.state).toBe("running");

      // Check if extended status properties are available
      const extendedStatus = status as typeof status & {
        runtime?: string;
        sysboxEnabled?: boolean;
      };

      if (extendedStatus.runtime !== undefined) {
        expect(["runc", "sysbox-runc"]).toContain(extendedStatus.runtime);
      }

      if (extendedStatus.sysboxEnabled !== undefined) {
        expect(typeof extendedStatus.sysboxEnabled).toBe("boolean");
      }

      await target.stop();
    });

    it("should use Sysbox when available, runc when allowInsecureWithoutSysbox is set", async () => {
      // DREAM ARCHITECTURE: Sysbox is mandatory by default.
      // allowInsecureWithoutSysbox is only for dev/test scenarios.
      const insecureConfig: DockerTargetConfigExtended = {
        containerName: `clawster-sysbox-insecure-${profile}`,
        configPath: configDir,
        gatewayPort: port + 1,
        allowInsecureWithoutSysbox: true,
      };

      const insecureTarget = new DockerContainerTarget(insecureConfig);

      // Before start(), runtime defaults to sysbox-runc (dream architecture default)
      // After start(), it will be sysbox-runc if available, runc if not (due to allowInsecureWithoutSysbox)
      expect(insecureTarget.isRunningInsecure()).toBe(false); // Not yet detected

      // Check if Sysbox is available
      const sysboxAvailable = await isSysboxAvailable();

      // After install and start, runtime should match Sysbox availability
      await insecureTarget.install({ profileName: `${profile}-insecure`, port: port + 1 });
      const testConfig = buildTestConfig(`${profile}-insecure`, port + 1);
      await insecureTarget.configure(testConfig);
      await insecureTarget.start();

      if (sysboxAvailable) {
        expect(insecureTarget.getRuntime()).toBe("sysbox-runc");
        expect(insecureTarget.isSysboxEnabled()).toBe(true);
      } else {
        // Without Sysbox, allowInsecureWithoutSysbox lets it fall back to runc
        expect(insecureTarget.getRuntime()).toBe("runc");
        expect(insecureTarget.isSysboxEnabled()).toBe(false);
        expect(insecureTarget.isRunningInsecure()).toBe(true);
      }

      await insecureTarget.destroy();
    });

    it("should BLOCK deployment when Sysbox unavailable and allowInsecureWithoutSysbox is false", async () => {
      // DREAM ARCHITECTURE: Security is not optional.
      // Without Sysbox AND without the escape hatch, deployment MUST fail.
      // There should be NO insecure fallback - either Sysbox works or deployment fails.
      const capability = await detectSysboxCapability();

      const strictConfig: DockerTargetConfigExtended = {
        containerName: `clawster-sysbox-strict-${profile}`,
        configPath: configDir,
        gatewayPort: port + 2,
        // allowInsecureWithoutSysbox is NOT set (or false)
      };

      const strictTarget = new DockerContainerTarget(strictConfig);

      await strictTarget.install({ profileName: `${profile}-strict`, port: port + 2 });
      const testConfig = buildTestConfig(`${profile}-strict`, port + 2);
      await strictTarget.configure(testConfig);

      // Try to start the strict target
      let startSucceeded = false;
      let startError: Error | null = null;

      try {
        await strictTarget.start();
        startSucceeded = true;
      } catch (error) {
        startError = error instanceof Error ? error : new Error(String(error));
      }

      if (capability.available !== "available") {
        // Detection says Sysbox is NOT available
        // Our code should throw "SYSBOX REQUIRED" before even trying docker run
        expect(startSucceeded).toBe(false);
        expect(startError).not.toBeNull();
        expect(startError!.message).toContain("SYSBOX REQUIRED");
        expect(startError!.message).toContain("clawster sysbox install");
      } else if (startSucceeded) {
        // Sysbox detection says "available" AND start succeeded
        // This means Sysbox actually works - verify secure mode
        expect(strictTarget.isSysboxEnabled()).toBe(true);
        expect(strictTarget.getRuntime()).toBe("sysbox-runc");
      } else {
        // Sysbox detection says "available" but start failed
        // This means detection is inaccurate (runtime in config but not functional)
        // The key assertion: deployment was BLOCKED (no insecure fallback to runc)
        expect(startError).not.toBeNull();
        const msg = startError!.message;
        // Either our code threw SYSBOX REQUIRED (if ensureSysboxAvailable detected the issue)
        // OR Docker rejected the runtime (if detection passed but docker run failed)
        const blockedByOurCode = msg.includes("SYSBOX REQUIRED");
        const blockedByDocker = msg.includes("unknown or invalid runtime") || msg.includes("sysbox-runc");
        expect(blockedByOurCode || blockedByDocker).toBe(true);

        if (blockedByDocker && !blockedByOurCode) {
          console.warn(
            "Sysbox detection inaccurate: reported available but runtime doesn't work. " +
            "Deployment was still blocked (no insecure fallback). Detection should be improved."
          );
        }
      }

      // Cleanup
      try {
        await strictTarget.destroy();
      } catch {
        // Container may not exist since start may have failed
      }
    });

    it("should continue working with allowInsecureWithoutSysbox escape hatch", async () => {
      // Target with escape hatch should be functional regardless of Sysbox availability
      await target.start();
      const status = await target.getStatus();
      expect(status.state).toBe("running");
      await target.stop();
    });

    it("should destroy cleanly", async () => {
      await expect(target.destroy()).resolves.not.toThrow();
    });
  }
);

describe("Sysbox Security Config Integration", () => {
  it("should report sandbox support correctly based on Sysbox", async () => {
    const { targetSupportsSandboxAsync } = await import("../../security/security-config");
    const { DeploymentTargetType } = await import("../../interface/deployment-target");

    // Check Docker target sandbox support
    const dockerSupport = await targetSupportsSandboxAsync(DeploymentTargetType.DOCKER);
    expect(dockerSupport).toBeDefined();
    expect(typeof dockerSupport.supported).toBe("boolean");

    // If Sysbox is available, Docker should support sandbox
    const sysboxAvailable = await isSysboxAvailable();
    expect(dockerSupport.supported).toBe(sysboxAvailable);

    // If not supported, should have a reason
    if (!dockerSupport.supported && dockerSupport.reason) {
      expect(typeof dockerSupport.reason).toBe("string");
    }
  });

  it("should provide async security defaults with runtime info", async () => {
    const { getSecurityDefaultsAsync } = await import("../../security/security-config");
    const { DeploymentTargetType } = await import("../../interface/deployment-target");

    const defaults = await getSecurityDefaultsAsync(DeploymentTargetType.DOCKER);
    expect(defaults).toBeDefined();
    expect(defaults.sandbox).toBeDefined();

    // Check if docker runtime is included
    if (defaults.sandbox.docker?.runtime) {
      expect(["runc", "sysbox-runc"]).toContain(defaults.sandbox.docker.runtime);
    }
  });

  it("should provide async security summary", async () => {
    const { getSecuritySummaryAsync } = await import("../../security/security-config");
    const { DeploymentTargetType } = await import("../../interface/deployment-target");

    const summary = await getSecuritySummaryAsync(DeploymentTargetType.DOCKER);
    expect(summary).toBeDefined();
    expect(typeof summary).toBe("string");

    // Summary should contain relevant security information
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("Security Tier:");
    expect(summary).toContain("Sandbox Mode:");
  });
});
