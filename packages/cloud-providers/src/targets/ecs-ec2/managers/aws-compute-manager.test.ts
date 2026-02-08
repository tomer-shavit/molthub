import { AwsComputeManager } from "./aws-compute-manager";
import type { EC2Client } from "@aws-sdk/client-ec2";
import {
  DescribeImagesCommand,
  DescribeLaunchTemplatesCommand,
  CreateLaunchTemplateVersionCommand,
  CreateLaunchTemplateCommand,
  DeleteLaunchTemplateCommand,
  DescribeInstancesCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import type { LaunchTemplateConfig } from "../types";

const makeLtConfig = (overrides?: Partial<LaunchTemplateConfig>): LaunchTemplateConfig => ({
  instanceType: "t3.small",
  bootDiskSizeGb: 30,
  amiId: "ami-12345678",
  securityGroupId: "sg-abc",
  instanceProfileArn: "arn:aws:iam::123:instance-profile/test",
  userData: "dXNlcmRhdGE=",
  tags: { env: "test" },
  ...overrides,
});

describe("AwsComputeManager", () => {
  let mockEc2Send: jest.Mock;
  let ec2Client: EC2Client;
  let logCallback: jest.Mock;
  let manager: AwsComputeManager;

  beforeEach(() => {
    mockEc2Send = jest.fn();
    ec2Client = { send: mockEc2Send } as unknown as EC2Client;
    logCallback = jest.fn();
    manager = new AwsComputeManager(ec2Client, logCallback);
  });

  describe("resolveUbuntuAmi", () => {
    it("returns the most recent AMI ID", async () => {
      mockEc2Send.mockResolvedValue({
        Images: [
          { ImageId: "ami-older", Name: "ubuntu-older", CreationDate: "2025-01-01T00:00:00Z" },
          { ImageId: "ami-newest", Name: "ubuntu-newest", CreationDate: "2025-06-15T00:00:00Z" },
          { ImageId: "ami-middle", Name: "ubuntu-middle", CreationDate: "2025-03-10T00:00:00Z" },
        ],
      });

      const amiId = await manager.resolveUbuntuAmi();

      expect(amiId).toBe("ami-newest");
      expect(mockEc2Send).toHaveBeenCalledTimes(1);
      expect(mockEc2Send).toHaveBeenCalledWith(expect.any(DescribeImagesCommand));
    });

    it("throws when no AMI is found", async () => {
      mockEc2Send.mockResolvedValue({ Images: [] });

      await expect(manager.resolveUbuntuAmi()).rejects.toThrow(
        "No Ubuntu 22.04 AMI found in region",
      );
    });

    it("throws when Images is undefined", async () => {
      mockEc2Send.mockResolvedValue({});

      await expect(manager.resolveUbuntuAmi()).rejects.toThrow(
        "No Ubuntu 22.04 AMI found in region",
      );
    });
  });

  describe("ensureLaunchTemplate", () => {
    it("creates a new launch template when none exists", async () => {
      const ltId = "lt-new123";
      const notFoundError = new Error("Not found");
      (notFoundError as Error & { name: string }).name = "InvalidLaunchTemplateNameNotFoundFault";

      mockEc2Send
        .mockRejectedValueOnce(notFoundError)
        .mockResolvedValueOnce({ LaunchTemplate: { LaunchTemplateId: ltId } });

      const result = await manager.ensureLaunchTemplate("test-lt", makeLtConfig());

      expect(result).toBe(ltId);
      expect(mockEc2Send).toHaveBeenCalledWith(expect.any(DescribeLaunchTemplatesCommand));
      expect(mockEc2Send).toHaveBeenCalledWith(expect.any(CreateLaunchTemplateCommand));
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("created"));
    });

    it("updates existing launch template with a new version", async () => {
      const ltId = "lt-existing456";

      mockEc2Send
        .mockResolvedValueOnce({ LaunchTemplates: [{ LaunchTemplateId: ltId }] })
        .mockResolvedValueOnce({});

      const result = await manager.ensureLaunchTemplate("test-lt", makeLtConfig());

      expect(result).toBe(ltId);
      expect(mockEc2Send).toHaveBeenCalledWith(expect.any(DescribeLaunchTemplatesCommand));
      expect(mockEc2Send).toHaveBeenCalledWith(expect.any(CreateLaunchTemplateVersionCommand));
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("updated"));
    });
  });

  describe("deleteLaunchTemplate", () => {
    it("deletes the launch template successfully", async () => {
      mockEc2Send.mockResolvedValueOnce({});

      await manager.deleteLaunchTemplate("my-lt");

      expect(mockEc2Send).toHaveBeenCalledWith(expect.any(DeleteLaunchTemplateCommand));
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("deleted"));
    });

    it("handles not-found error gracefully", async () => {
      const notFoundError = new Error("Not found");
      (notFoundError as Error & { name: string }).name = "InvalidLaunchTemplateNameNotFoundFault";

      mockEc2Send.mockRejectedValueOnce(notFoundError);

      await expect(manager.deleteLaunchTemplate("gone-lt")).resolves.toBeUndefined();
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("already deleted"));
    });

    it("rethrows non-not-found errors", async () => {
      const authError = new Error("Access denied");
      (authError as Error & { name: string }).name = "UnauthorizedOperation";

      mockEc2Send.mockRejectedValueOnce(authError);

      await expect(manager.deleteLaunchTemplate("my-lt")).rejects.toThrow("Access denied");
    });
  });

  describe("runInstance", () => {
    it("launches an instance and returns the instance ID", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Instances: [{ InstanceId: "i-new123" }],
      });

      const instanceId = await manager.runInstance("my-lt", "subnet-abc", "test-bot");

      expect(instanceId).toBe("i-new123");
      expect(mockEc2Send).toHaveBeenCalledWith(expect.any(RunInstancesCommand));
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("launched"));
    });

    it("throws when RunInstances returns no instance", async () => {
      mockEc2Send.mockResolvedValueOnce({ Instances: [] });

      await expect(manager.runInstance("my-lt", "subnet-abc", "test-bot")).rejects.toThrow(
        "RunInstances did not return an instance ID",
      );
    });

    it("tags the instance with clawster:bot and Name", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Instances: [{ InstanceId: "i-tagged" }],
      });

      await manager.runInstance("my-lt", "subnet-abc", "my-bot");

      const cmd = mockEc2Send.mock.calls[0][0] as RunInstancesCommand;
      const input = cmd.input;
      const tags = input.TagSpecifications?.[0]?.Tags;
      expect(tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Key: "clawster:bot", Value: "my-bot" }),
          expect.objectContaining({ Key: "Name", Value: "clawster-my-bot" }),
          expect.objectContaining({ Key: "clawster:managed", Value: "true" }),
        ]),
      );
    });

    it("passes launch template name and subnet", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Instances: [{ InstanceId: "i-lt" }],
      });

      await manager.runInstance("clawster-lt-bot", "subnet-xyz", "bot");

      const cmd = mockEc2Send.mock.calls[0][0] as RunInstancesCommand;
      const input = cmd.input;
      expect(input.LaunchTemplate?.LaunchTemplateName).toBe("clawster-lt-bot");
      expect(input.LaunchTemplate?.Version).toBe("$Latest");
      expect(input.SubnetId).toBe("subnet-xyz");
      expect(input.MinCount).toBe(1);
      expect(input.MaxCount).toBe(1);
    });
  });

  describe("terminateInstance", () => {
    it("terminates the instance successfully", async () => {
      mockEc2Send.mockResolvedValueOnce({});

      await manager.terminateInstance("i-abc");

      expect(mockEc2Send).toHaveBeenCalledWith(expect.any(TerminateInstancesCommand));
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("terminated"));
    });

    it("handles not-found error gracefully", async () => {
      const notFoundError = new Error("Instance not found");
      (notFoundError as Error & { name: string }).name = "InvalidInstanceIDNotFound";

      mockEc2Send.mockRejectedValueOnce(notFoundError);

      await expect(manager.terminateInstance("i-gone")).resolves.toBeUndefined();
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("already terminated"));
    });

    it("rethrows non-not-found errors", async () => {
      const serviceError = new Error("Service unavailable");
      (serviceError as Error & { name: string }).name = "ServiceUnavailable";

      mockEc2Send.mockRejectedValueOnce(serviceError);

      await expect(manager.terminateInstance("i-abc")).rejects.toThrow("Service unavailable");
    });
  });

  describe("findInstanceByTag", () => {
    it("returns instance ID when a running instance is found", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [
          {
            Instances: [
              { InstanceId: "i-running", State: { Name: "running" } },
            ],
          },
        ],
      });

      const id = await manager.findInstanceByTag("test-bot");

      expect(id).toBe("i-running");
      expect(mockEc2Send).toHaveBeenCalledWith(expect.any(DescribeInstancesCommand));
    });

    it("returns null when no instances match", async () => {
      mockEc2Send.mockResolvedValueOnce({ Reservations: [] });

      const id = await manager.findInstanceByTag("no-bot");

      expect(id).toBeNull();
    });

    it("prefers running over stopped instances", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [
          {
            Instances: [
              { InstanceId: "i-stopped", State: { Name: "stopped" } },
              { InstanceId: "i-running", State: { Name: "running" } },
            ],
          },
        ],
      });

      const id = await manager.findInstanceByTag("test-bot");

      expect(id).toBe("i-running");
    });

    it("prefers pending over stopped instances", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [
          {
            Instances: [
              { InstanceId: "i-stopped", State: { Name: "stopped" } },
              { InstanceId: "i-pending", State: { Name: "pending" } },
            ],
          },
        ],
      });

      const id = await manager.findInstanceByTag("test-bot");

      expect(id).toBe("i-pending");
    });

    it("falls back to first instance when none are running/pending", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [
          {
            Instances: [
              { InstanceId: "i-stopped", State: { Name: "stopped" } },
            ],
          },
        ],
      });

      const id = await manager.findInstanceByTag("test-bot");

      expect(id).toBe("i-stopped");
    });

    it("filters by clawster:bot and clawster:managed tags", async () => {
      mockEc2Send.mockResolvedValueOnce({ Reservations: [] });

      await manager.findInstanceByTag("my-bot");

      const cmd = mockEc2Send.mock.calls[0][0] as DescribeInstancesCommand;
      const filters = cmd.input.Filters;
      expect(filters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Name: "tag:clawster:bot", Values: ["my-bot"] }),
          expect.objectContaining({ Name: "tag:clawster:managed", Values: ["true"] }),
          expect.objectContaining({
            Name: "instance-state-name",
            Values: ["pending", "running", "stopping", "stopped"],
          }),
        ]),
      );
    });
  });

  describe("getInstancePublicIp", () => {
    it("returns the public IP when instance has one", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [{ Instances: [{ PublicIpAddress: "1.2.3.4" }] }],
      });

      const ip = await manager.getInstancePublicIp("i-abc");

      expect(ip).toBe("1.2.3.4");
    });

    it("returns null when instance has no public IP", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [{ Instances: [{}] }],
      });

      const ip = await manager.getInstancePublicIp("i-abc");

      expect(ip).toBeNull();
    });

    it("returns null when no reservations returned", async () => {
      mockEc2Send.mockResolvedValueOnce({ Reservations: [] });

      const ip = await manager.getInstancePublicIp("i-abc");

      expect(ip).toBeNull();
    });
  });

  describe("getInstanceStatus", () => {
    it("returns instance state name", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [{ Instances: [{ State: { Name: "running" } }] }],
      });

      const status = await manager.getInstanceStatus("i-abc");

      expect(status).toBe("running");
    });

    it("returns 'no-instance' when state is undefined", async () => {
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [{ Instances: [{ State: {} }] }],
      });

      const status = await manager.getInstanceStatus("i-abc");

      expect(status).toBe("no-instance");
    });

    it("returns 'no-instance' when describe throws not-found", async () => {
      const notFoundError = new Error("Instance not found");
      (notFoundError as Error & { name: string }).name = "InvalidInstanceID.NotFound";
      mockEc2Send.mockRejectedValueOnce(notFoundError);

      const status = await manager.getInstanceStatus("i-gone");

      expect(status).toBe("no-instance");
    });

    it("rethrows non-not-found errors", async () => {
      const serviceError = new Error("Service unavailable");
      (serviceError as Error & { name: string }).name = "ServiceUnavailable";
      mockEc2Send.mockRejectedValueOnce(serviceError);

      await expect(manager.getInstanceStatus("i-abc")).rejects.toThrow("Service unavailable");
    });

    it("returns 'no-instance' when no reservations returned", async () => {
      mockEc2Send.mockResolvedValueOnce({ Reservations: [] });

      const status = await manager.getInstanceStatus("i-abc");

      expect(status).toBe("no-instance");
    });
  });
});
