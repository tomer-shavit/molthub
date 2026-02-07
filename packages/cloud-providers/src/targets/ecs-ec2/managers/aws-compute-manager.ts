/**
 * AWS Compute Manager — manages per-bot Launch Templates, ASGs, and instances.
 *
 * Uses ASG(max=1) for auto-healing, matching the GCE MIG and Azure VMSS patterns.
 */

import {
  type EC2Client,
  type _InstanceType,
  DescribeImagesCommand,
  CreateLaunchTemplateCommand,
  DescribeLaunchTemplatesCommand,
  DeleteLaunchTemplateCommand,
  CreateLaunchTemplateVersionCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import {
  type AutoScalingClient,
  CreateAutoScalingGroupCommand,
  DescribeAutoScalingGroupsCommand,
  DeleteAutoScalingGroupCommand,
  UpdateAutoScalingGroupCommand,
  TerminateInstanceInAutoScalingGroupCommand,
} from "@aws-sdk/client-auto-scaling";
import type { IAwsComputeManager } from "./interfaces";
import type { LaunchTemplateConfig, Ec2InstanceState, AwsLogCallback } from "../types";

/** Canonical's AWS account (official Ubuntu AMI publisher) */
const UBUNTU_OWNER = "099720109477";
const AMI_NAME_FILTER = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*";

export class AwsComputeManager implements IAwsComputeManager {
  constructor(
    private readonly ec2: EC2Client,
    private readonly asg: AutoScalingClient,
    private readonly log: AwsLogCallback,
  ) {}

  async resolveUbuntuAmi(): Promise<string> {
    const result = await this.ec2.send(
      new DescribeImagesCommand({
        Owners: [UBUNTU_OWNER],
        Filters: [
          { Name: "name", Values: [AMI_NAME_FILTER] },
          { Name: "state", Values: ["available"] },
          { Name: "architecture", Values: ["x86_64"] },
        ],
      }),
    );

    const images = (result.Images ?? []).sort(
      (a, b) => (b.CreationDate ?? "").localeCompare(a.CreationDate ?? ""),
    );
    if (images.length === 0) {
      throw new Error("No Ubuntu 22.04 AMI found in region");
    }

    this.log(`Resolved AMI: ${images[0].ImageId} (${images[0].Name})`);
    return images[0].ImageId!;
  }

  async ensureLaunchTemplate(name: string, config: LaunchTemplateConfig): Promise<string> {
    const data = this.buildLaunchTemplateData(config);

    try {
      const existing = await this.ec2.send(
        new DescribeLaunchTemplatesCommand({ LaunchTemplateNames: [name] }),
      );
      const lt = existing.LaunchTemplates?.[0];
      if (lt) {
        await this.ec2.send(
          new CreateLaunchTemplateVersionCommand({
            LaunchTemplateName: name,
            LaunchTemplateData: data,
          }),
        );
        this.log(`Launch template updated: ${name}`);
        return lt.LaunchTemplateId!;
      }
    } catch {
      // Not found — create below
    }

    const result = await this.ec2.send(
      new CreateLaunchTemplateCommand({
        LaunchTemplateName: name,
        LaunchTemplateData: data,
        TagSpecifications: [
          {
            ResourceType: "launch-template",
            Tags: [
              { Key: "clawster:managed", Value: "true" },
              ...Object.entries(config.tags).map(([Key, Value]) => ({ Key, Value })),
            ],
          },
        ],
      }),
    );
    this.log(`Launch template created: ${name}`);
    return result.LaunchTemplate!.LaunchTemplateId!;
  }

  async ensureAsg(name: string, launchTemplateId: string, subnetId: string): Promise<void> {
    const existing = await this.asg.send(
      new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [name] }),
    );
    if ((existing.AutoScalingGroups ?? []).length > 0) {
      this.log(`ASG already exists: ${name}`);
      return;
    }

    await this.asg.send(
      new CreateAutoScalingGroupCommand({
        AutoScalingGroupName: name,
        LaunchTemplate: { LaunchTemplateId: launchTemplateId, Version: "$Latest" },
        MinSize: 0,
        MaxSize: 1,
        DesiredCapacity: 0,
        VPCZoneIdentifier: subnetId,
        HealthCheckType: "EC2",
        HealthCheckGracePeriod: 600,
        Tags: [
          { Key: "clawster:managed", Value: "true", PropagateAtLaunch: true },
          { Key: "Name", Value: name, PropagateAtLaunch: true },
        ],
      }),
    );
    this.log(`ASG created: ${name} (desired=0)`);
  }

  async setAsgDesiredCapacity(asgName: string, desired: number): Promise<void> {
    await this.asg.send(
      new UpdateAutoScalingGroupCommand({
        AutoScalingGroupName: asgName,
        DesiredCapacity: desired,
        MinSize: 0,
        MaxSize: Math.max(1, desired),
      }),
    );
    this.log(`ASG ${asgName} → desired=${desired}`);
  }

  async getAsgInstancePublicIp(asgName: string): Promise<string | null> {
    const instanceId = await this.getAsgInstanceId(asgName);
    if (!instanceId) return null;

    const result = await this.ec2.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
    );
    return result.Reservations?.[0]?.Instances?.[0]?.PublicIpAddress ?? null;
  }

  async getAsgInstanceStatus(asgName: string): Promise<Ec2InstanceState | "no-instance"> {
    const instanceId = await this.getAsgInstanceId(asgName);
    if (!instanceId) return "no-instance";

    const result = await this.ec2.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
    );
    const state = result.Reservations?.[0]?.Instances?.[0]?.State?.Name;
    return (state as Ec2InstanceState) ?? "no-instance";
  }

  async deleteAsg(name: string): Promise<void> {
    try {
      await this.asg.send(
        new UpdateAutoScalingGroupCommand({
          AutoScalingGroupName: name,
          MinSize: 0,
          MaxSize: 0,
          DesiredCapacity: 0,
        }),
      );
    } catch {
      // ASG might not exist — continue to delete attempt
    }

    try {
      await this.asg.send(
        new DeleteAutoScalingGroupCommand({ AutoScalingGroupName: name, ForceDelete: true }),
      );
      this.log(`ASG deleted: ${name}`);
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
      this.log(`ASG already deleted: ${name}`);
    }
  }

  async deleteLaunchTemplate(name: string): Promise<void> {
    try {
      await this.ec2.send(new DeleteLaunchTemplateCommand({ LaunchTemplateName: name }));
      this.log(`Launch template deleted: ${name}`);
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
      this.log(`Launch template already deleted: ${name}`);
    }
  }

  async recycleAsgInstance(asgName: string): Promise<void> {
    const instanceId = await this.getAsgInstanceId(asgName);
    if (!instanceId) {
      this.log("No instance to recycle");
      return;
    }

    await this.asg.send(
      new TerminateInstanceInAutoScalingGroupCommand({
        InstanceId: instanceId,
        ShouldDecrementDesiredCapacity: false,
      }),
    );
    this.log(`Instance recycled: ${instanceId} (ASG will replace)`);
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  private async getAsgInstanceId(asgName: string): Promise<string | null> {
    const result = await this.asg.send(
      new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [asgName] }),
    );
    const instances = result.AutoScalingGroups?.[0]?.Instances ?? [];
    const live = instances.find(
      (i) => i.LifecycleState === "InService" || i.LifecycleState === "Pending",
    );
    return (live ?? instances[0])?.InstanceId ?? null;
  }

  private buildLaunchTemplateData(config: LaunchTemplateConfig) {
    return {
      ImageId: config.amiId,
      InstanceType: config.instanceType as _InstanceType,
      SecurityGroupIds: [config.securityGroupId],
      UserData: config.userData,
      IamInstanceProfile: { Arn: config.instanceProfileArn },
      BlockDeviceMappings: [
        {
          DeviceName: "/dev/sda1",
          Ebs: { VolumeSize: config.bootDiskSizeGb, VolumeType: "gp3" as const },
        },
      ],
      MetadataOptions: {
        HttpTokens: "required" as const,
        HttpEndpoint: "enabled" as const,
      },
      TagSpecifications: [
        {
          ResourceType: "instance" as const,
          Tags: Object.entries(config.tags).map(([Key, Value]) => ({ Key, Value })),
        },
      ],
    };
  }

  private isNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const name = (error as { name?: string }).name ?? "";
    return name.includes("NotFound") || name.includes("NoSuchEntity");
  }
}
