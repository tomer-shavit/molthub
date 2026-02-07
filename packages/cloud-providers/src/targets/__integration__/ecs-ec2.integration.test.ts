import { AwsEc2Target } from "../ecs-ec2/aws-ec2-target";
import type { DeploymentTarget } from "../../interface/deployment-target";
import {
  generateTestProfile,
  generateTestPort,
  buildTestConfig,
  cleanupTarget,
} from "./test-utils";

const HAS_AWS_CREDS = !!(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
);

(HAS_AWS_CREDS ? describe : describe.skip)(
  "AWS EC2 Target Integration",
  () => {
    let target: DeploymentTarget;
    let profile: string;
    let port: number;

    beforeAll(() => {
      profile = generateTestProfile();
      port = generateTestPort();

      target = new AwsEc2Target({
        region: process.env.AWS_REGION || "us-east-1",
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      });
    });

    afterAll(async () => {
      if (target) {
        await cleanupTarget(target);
      }
    });

    it("should install (create ASG + launch template) successfully", async () => {
      const result = await target.install({
        profileName: profile,
        port,
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

    it("should report status", async () => {
      // EC2 instances take time to start
      await new Promise((r) => setTimeout(r, 30_000));

      const status = await target.getStatus();
      expect(["running", "stopped", "error"]).toContain(status.state);
    });

    it("should provide endpoint", async () => {
      const endpoint = await target.getEndpoint();
      expect(endpoint.port).toBeGreaterThan(0);
    });

    it("should stop gracefully", async () => {
      await expect(target.stop()).resolves.not.toThrow();
    });

    it("should destroy cleanly", async () => {
      await expect(target.destroy()).resolves.not.toThrow();
    });
  },
);
