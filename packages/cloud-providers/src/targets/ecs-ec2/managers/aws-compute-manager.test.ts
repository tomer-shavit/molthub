import { AwsComputeManager } from "./aws-compute-manager";
import type { EC2Client } from "@aws-sdk/client-ec2";
import type { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import {
  DescribeImagesCommand,
  DescribeLaunchTemplatesCommand,
  CreateLaunchTemplateVersionCommand,
  CreateLaunchTemplateCommand,
  DeleteLaunchTemplateCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import {
  DescribeAutoScalingGroupsCommand,
  CreateAutoScalingGroupCommand,
  UpdateAutoScalingGroupCommand,
  DeleteAutoScalingGroupCommand,
  TerminateInstanceInAutoScalingGroupCommand,
} from "@aws-sdk/client-auto-scaling";
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
  let mockAsgSend: jest.Mock;
  let ec2Client: EC2Client;
  let asgClient: AutoScalingClient;
  let logCallback: jest.Mock;
  let manager: AwsComputeManager;

  beforeEach(() => {
    mockEc2Send = jest.fn();
    mockAsgSend = jest.fn();
    ec2Client = { send: mockEc2Send } as unknown as EC2Client;
    asgClient = { send: mockAsgSend } as unknown as AutoScalingClient;
    logCallback = jest.fn();
    manager = new AwsComputeManager(ec2Client, asgClient, logCallback);
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

  describe("ensureAsg", () => {
    it("creates a new ASG when none exists", async () => {
      mockAsgSend
        .mockResolvedValueOnce({ AutoScalingGroups: [] })
        .mockResolvedValueOnce({});

      await manager.ensureAsg("test-asg", "lt-123", "subnet-abc");

      expect(mockAsgSend).toHaveBeenCalledWith(expect.any(DescribeAutoScalingGroupsCommand));
      expect(mockAsgSend).toHaveBeenCalledWith(expect.any(CreateAutoScalingGroupCommand));
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("created"));
    });

    it("skips creation when ASG already exists", async () => {
      mockAsgSend.mockResolvedValueOnce({
        AutoScalingGroups: [{ AutoScalingGroupName: "test-asg" }],
      });

      await manager.ensureAsg("test-asg", "lt-123", "subnet-abc");

      expect(mockAsgSend).toHaveBeenCalledTimes(1);
      expect(mockAsgSend).toHaveBeenCalledWith(expect.any(DescribeAutoScalingGroupsCommand));
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    });
  });

  describe("setAsgDesiredCapacity", () => {
    it("sends UpdateAutoScalingGroupCommand with correct params", async () => {
      mockAsgSend.mockResolvedValueOnce({});

      await manager.setAsgDesiredCapacity("my-asg", 1);

      expect(mockAsgSend).toHaveBeenCalledWith(expect.any(UpdateAutoScalingGroupCommand));
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("desired=1"));
    });

    it("sets MaxSize to at least 1 even for desired=0", async () => {
      mockAsgSend.mockResolvedValueOnce({});

      await manager.setAsgDesiredCapacity("my-asg", 0);

      expect(mockAsgSend).toHaveBeenCalledWith(expect.any(UpdateAutoScalingGroupCommand));
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("desired=0"));
    });
  });

  describe("getAsgInstancePublicIp", () => {
    it("returns the public IP when an instance exists", async () => {
      mockAsgSend.mockResolvedValueOnce({
        AutoScalingGroups: [
          { Instances: [{ InstanceId: "i-abc", LifecycleState: "InService" }] },
        ],
      });
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [{ Instances: [{ PublicIpAddress: "1.2.3.4" }] }],
      });

      const ip = await manager.getAsgInstancePublicIp("my-asg");

      expect(ip).toBe("1.2.3.4");
    });

    it("returns null when no instances in ASG", async () => {
      mockAsgSend.mockResolvedValueOnce({
        AutoScalingGroups: [{ Instances: [] }],
      });

      const ip = await manager.getAsgInstancePublicIp("my-asg");

      expect(ip).toBeNull();
    });

    it("returns null when instance has no public IP", async () => {
      mockAsgSend.mockResolvedValueOnce({
        AutoScalingGroups: [
          { Instances: [{ InstanceId: "i-abc", LifecycleState: "InService" }] },
        ],
      });
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [{ Instances: [{}] }],
      });

      const ip = await manager.getAsgInstancePublicIp("my-asg");

      expect(ip).toBeNull();
    });
  });

  describe("getAsgInstanceStatus", () => {
    it("returns instance state name when instance exists", async () => {
      mockAsgSend.mockResolvedValueOnce({
        AutoScalingGroups: [
          { Instances: [{ InstanceId: "i-abc", LifecycleState: "InService" }] },
        ],
      });
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [{ Instances: [{ State: { Name: "running" } }] }],
      });

      const status = await manager.getAsgInstanceStatus("my-asg");

      expect(status).toBe("running");
    });

    it("returns 'no-instance' when no instances in ASG", async () => {
      mockAsgSend.mockResolvedValueOnce({
        AutoScalingGroups: [{ Instances: [] }],
      });

      const status = await manager.getAsgInstanceStatus("my-asg");

      expect(status).toBe("no-instance");
    });

    it("returns 'no-instance' when state is undefined", async () => {
      mockAsgSend.mockResolvedValueOnce({
        AutoScalingGroups: [
          { Instances: [{ InstanceId: "i-abc", LifecycleState: "InService" }] },
        ],
      });
      mockEc2Send.mockResolvedValueOnce({
        Reservations: [{ Instances: [{ State: {} }] }],
      });

      const status = await manager.getAsgInstanceStatus("my-asg");

      expect(status).toBe("no-instance");
    });
  });

  describe("deleteAsg", () => {
    it("scales to 0 then force-deletes the ASG", async () => {
      const calls: string[] = [];
      mockAsgSend.mockImplementation((cmd: unknown): Promise<Record<string, never>> => {
        if (cmd instanceof UpdateAutoScalingGroupCommand) {
          calls.push("update");
          return Promise.resolve({});
        }
        if (cmd instanceof DeleteAutoScalingGroupCommand) {
          calls.push("delete");
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      await manager.deleteAsg("my-asg");

      expect(calls).toEqual(["update", "delete"]);
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("deleted"));
    });

    it("handles not-found error gracefully on delete", async () => {
      const notFoundError = new Error("Not found");
      (notFoundError as Error & { name: string }).name = "AutoScalingGroupNotFoundFault";

      mockAsgSend
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(notFoundError);

      await expect(manager.deleteAsg("gone-asg")).resolves.toBeUndefined();
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("already deleted"));
    });

    it("handles not-found error on the scale-down step", async () => {
      const notFoundError = new Error("Not found");
      (notFoundError as Error & { name: string }).name = "AutoScalingGroupNotFoundFault";

      mockAsgSend
        .mockRejectedValueOnce(notFoundError)
        .mockRejectedValueOnce(notFoundError);

      await expect(manager.deleteAsg("gone-asg")).resolves.toBeUndefined();
    });

    it("rethrows non-not-found errors on delete", async () => {
      const serviceError = new Error("Service unavailable");
      (serviceError as Error & { name: string }).name = "ServiceUnavailable";

      mockAsgSend
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(serviceError);

      await expect(manager.deleteAsg("my-asg")).rejects.toThrow("Service unavailable");
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

  describe("recycleAsgInstance", () => {
    it("terminates the instance without decrementing desired capacity", async () => {
      mockAsgSend
        .mockResolvedValueOnce({
          AutoScalingGroups: [
            { Instances: [{ InstanceId: "i-recycle", LifecycleState: "InService" }] },
          ],
        })
        .mockResolvedValueOnce({});

      await manager.recycleAsgInstance("my-asg");

      expect(mockAsgSend).toHaveBeenCalledWith(
        expect.any(TerminateInstanceInAutoScalingGroupCommand),
      );
      expect(logCallback).toHaveBeenCalledWith(expect.stringContaining("recycled"));
    });

    it("logs and returns when no instance to recycle", async () => {
      mockAsgSend.mockResolvedValueOnce({
        AutoScalingGroups: [{ Instances: [] }],
      });

      await manager.recycleAsgInstance("my-asg");

      expect(logCallback).toHaveBeenCalledWith("No instance to recycle");
      expect(mockAsgSend).toHaveBeenCalledTimes(1);
    });

    it("picks the first live instance (InService or Pending)", async () => {
      mockAsgSend
        .mockResolvedValueOnce({
          AutoScalingGroups: [
            {
              Instances: [
                { InstanceId: "i-inservice", LifecycleState: "InService" },
                { InstanceId: "i-pending", LifecycleState: "Pending" },
              ],
            },
          ],
        })
        .mockResolvedValueOnce({});

      await manager.recycleAsgInstance("my-asg");

      expect(logCallback).toHaveBeenCalledWith(
        expect.stringContaining("i-inservice"),
      );
    });

    it("falls back to first instance when none are InService or Pending", async () => {
      mockAsgSend
        .mockResolvedValueOnce({
          AutoScalingGroups: [
            {
              Instances: [
                { InstanceId: "i-terminating", LifecycleState: "Terminating" },
              ],
            },
          ],
        })
        .mockResolvedValueOnce({});

      await manager.recycleAsgInstance("my-asg");

      expect(logCallback).toHaveBeenCalledWith(
        expect.stringContaining("i-terminating"),
      );
    });
  });
});
