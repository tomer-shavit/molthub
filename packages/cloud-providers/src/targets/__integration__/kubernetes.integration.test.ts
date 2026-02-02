import { execFileSync } from "child_process";
import { KubernetesTarget } from "../kubernetes/kubernetes-target";
import type { KubernetesTargetConfig } from "../../interface/deployment-target";
import {
  generateTestProfile,
  generateTestPort,
  buildTestConfig,
  cleanupTarget,
  runCommand,
} from "./test-utils";

function hasKubeCluster(): boolean {
  try {
    execFileSync("which", ["kubectl"], { stdio: "ignore" });
    execFileSync("kubectl", ["cluster-info", "--request-timeout=5s"], {
      stdio: "ignore",
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

const CLUSTER_AVAILABLE = hasKubeCluster();

(CLUSTER_AVAILABLE ? describe : describe.skip)(
  "Kubernetes Target Integration",
  () => {
    let target: KubernetesTarget;
    let profile: string;
    let port: number;
    let namespace: string;

    beforeAll(async () => {
      profile = generateTestProfile();
      port = generateTestPort();
      namespace = `clawster-test-${profile}`;

      await runCommand("kubectl", ["create", "namespace", namespace]).catch(
        () => {
          // namespace may already exist
        },
      );

      const config: KubernetesTargetConfig = {
        namespace,
        deploymentName: `openclaw-${profile}`,
        gatewayPort: port,
        replicas: 1,
      };

      target = new KubernetesTarget(config);
    });

    afterAll(async () => {
      if (target) {
        await cleanupTarget(target);
      }
      if (namespace) {
        await runCommand("kubectl", [
          "delete",
          "namespace",
          namespace,
          "--ignore-not-found",
        ]).catch(() => {});
      }
    });

    it("should install (apply manifests) successfully", async () => {
      const result = await target.install({
        profileName: profile,
        port,
      });

      expect(result.success).toBe(true);
    });

    it("should configure successfully", async () => {
      const testConfig = buildTestConfig(profile, port);
      const result = await target.configure(testConfig);

      expect(result.success).toBe(true);
    });

    it("should start (scale up)", async () => {
      await expect(target.start()).resolves.not.toThrow();
    });

    it("should report running status", async () => {
      // Give pod time to start
      await new Promise((r) => setTimeout(r, 10_000));

      const status = await target.getStatus();
      expect(["running", "stopped"]).toContain(status.state);
    });

    it("should provide endpoint", async () => {
      const endpoint = await target.getEndpoint();
      expect(endpoint.port).toBe(port);
    });

    it("should stop (scale down)", async () => {
      await expect(target.stop()).resolves.not.toThrow();
    });

    it("should destroy cleanly", async () => {
      await expect(target.destroy()).resolves.not.toThrow();
    });
  },
);
