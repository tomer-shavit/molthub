/**
 * AWS Compute Manager — manages per-bot Launch Templates and EC2 instances.
 *
 * Uses direct RunInstances/TerminateInstances with tag-based discovery.
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
  RunInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import type { IAwsComputeManager } from "./interfaces";
import type { LaunchTemplateConfig, Ec2InstanceState, AwsLogCallback } from "../types";

/** Canonical's AWS account (official Ubuntu AMI publisher) */
const UBUNTU_OWNER = "099720109477";
const AMI_NAME_FILTER = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*";

export class AwsComputeManager implements IAwsComputeManager {
  constructor(
    private readonly ec2: EC2Client,
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

  async deleteLaunchTemplate(name: string): Promise<void> {
    try {
      await this.ec2.send(new DeleteLaunchTemplateCommand({ LaunchTemplateName: name }));
      this.log(`Launch template deleted: ${name}`);
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
      this.log(`Launch template already deleted: ${name}`);
    }
  }

  async runInstance(launchTemplateName: string, subnetId: string, botName: string): Promise<string> {
    const result = await this.ec2.send(
      new RunInstancesCommand({
        LaunchTemplate: { LaunchTemplateName: launchTemplateName, Version: "$Latest" },
        SubnetId: subnetId,
        MinCount: 1,
        MaxCount: 1,
        TagSpecifications: [
          {
            ResourceType: "instance",
            Tags: [
              { Key: "clawster:bot", Value: botName },
              { Key: "clawster:managed", Value: "true" },
              { Key: "Name", Value: `clawster-${botName}` },
            ],
          },
        ],
      }),
    );

    const instanceId = result.Instances?.[0]?.InstanceId;
    if (!instanceId) {
      throw new Error("RunInstances did not return an instance ID");
    }

    this.log(`Instance launched: ${instanceId} (bot=${botName})`);
    return instanceId;
  }

  async terminateInstance(instanceId: string): Promise<void> {
    try {
      await this.ec2.send(
        new TerminateInstancesCommand({ InstanceIds: [instanceId] }),
      );
      this.log(`Instance terminated: ${instanceId}`);
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
      this.log(`Instance already terminated: ${instanceId}`);
    }
  }

  async findInstanceByTag(botName: string): Promise<string | null> {
    const result = await this.ec2.send(
      new DescribeInstancesCommand({
        Filters: [
          { Name: "tag:clawster:bot", Values: [botName] },
          { Name: "tag:clawster:managed", Values: ["true"] },
          {
            Name: "instance-state-name",
            Values: ["pending", "running", "stopping", "stopped"],
          },
        ],
      }),
    );

    const instances = (result.Reservations ?? []).flatMap((r) => r.Instances ?? []);
    if (instances.length === 0) return null;

    // Prefer running/pending over stopped/stopping
    const running = instances.find(
      (i) => i.State?.Name === "running" || i.State?.Name === "pending",
    );
    const instanceId = (running ?? instances[0])?.InstanceId ?? null;

    if (instanceId) {
      this.log(`Found instance by tag: ${instanceId} (bot=${botName})`);
    }

    return instanceId;
  }

  async getInstancePublicIp(instanceId: string): Promise<string | null> {
    const result = await this.ec2.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
    );
    return result.Reservations?.[0]?.Instances?.[0]?.PublicIpAddress ?? null;
  }

  async getInstanceStatus(instanceId: string): Promise<Ec2InstanceState | "no-instance"> {
    try {
      const result = await this.ec2.send(
        new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
      );
      const state = result.Reservations?.[0]?.Instances?.[0]?.State?.Name;
      return (state as Ec2InstanceState) ?? "no-instance";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) return "no-instance";
      throw error;
    }
  }

  // ── Private Helpers ──────────────────────────────────────────────────

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
    };
  }

  private isNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const name = (error as { name?: string }).name ?? "";
    return name.includes("NotFound") || name.includes("NoSuchEntity");
  }
}
