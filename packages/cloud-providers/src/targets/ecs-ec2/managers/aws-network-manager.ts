/**
 * AWS Network Manager — manages shared VPC, Subnet, IGW, SG, and IAM resources.
 *
 * All resources are tagged with `clawster:managed=true` for idempotent lookup.
 * Created once per region, shared across all bots in that region.
 */

import {
  type EC2Client,
  CreateVpcCommand,
  DescribeVpcsCommand,
  DeleteVpcCommand,
  CreateSubnetCommand,
  DescribeSubnetsCommand,
  DeleteSubnetCommand,
  ModifySubnetAttributeCommand,
  CreateInternetGatewayCommand,
  DescribeInternetGatewaysCommand,
  DeleteInternetGatewayCommand,
  AttachInternetGatewayCommand,
  DetachInternetGatewayCommand,
  CreateRouteTableCommand,
  DescribeRouteTablesCommand,
  DeleteRouteTableCommand,
  CreateRouteCommand,
  AssociateRouteTableCommand,
  DisassociateRouteTableCommand,
  CreateSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import {
  type IAMClient,
  CreateRoleCommand,
  DeleteRoleCommand,
  CreateInstanceProfileCommand,
  GetInstanceProfileCommand,
  DeleteInstanceProfileCommand,
  AddRoleToInstanceProfileCommand,
  RemoveRoleFromInstanceProfileCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
} from "@aws-sdk/client-iam";
import type { IAwsNetworkManager } from "./interfaces";
import type { SharedInfraIds, AwsLogCallback } from "../types";

const VPC_CIDR = "10.0.0.0/16";
const SUBNET_CIDR = "10.0.1.0/24";

const NAMES = {
  vpc: "clawster-vpc",
  subnet: "clawster-subnet",
  igw: "clawster-igw",
  rtb: "clawster-rtb",
  sg: "clawster-sg",
  role: "clawster-instance-role",
  instanceProfile: "clawster-instance-profile",
} as const;

const MANAGED_TAG = { Key: "clawster:managed", Value: "true" };
const MANAGED_FILTER = { Name: "tag:clawster:managed", Values: ["true"] };

const EC2_TRUST_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "ec2.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
});

const INLINE_POLICY_NAME = "clawster-secrets-read";

function buildInlinePolicyDocument(region: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "secretsmanager:GetSecretValue",
        Resource: `arn:aws:secretsmanager:${region}:*:secret:clawster/*`,
      },
    ],
  });
}

export class AwsNetworkManager implements IAwsNetworkManager {
  constructor(
    private readonly ec2: EC2Client,
    private readonly iam: IAMClient,
    private readonly region: string,
    private readonly log: AwsLogCallback,
  ) {}

  async ensureSharedInfra(): Promise<SharedInfraIds> {
    const existing = await this.getSharedInfra();
    if (existing) {
      this.log("Shared infrastructure already exists");
      return existing;
    }

    this.log("Creating shared infrastructure...");

    const vpcId = await this.createVpc();
    const igwId = await this.createAndAttachIgw(vpcId);
    const subnetId = await this.createSubnet(vpcId);
    const rtbId = await this.createRouteTable(vpcId, igwId, subnetId);
    const sgId = await this.createSecurityGroup(vpcId);
    const { instanceProfileArn } = await this.ensureIamResources();

    this.log("Shared infrastructure ready");
    return {
      vpcId,
      subnetId,
      internetGatewayId: igwId,
      routeTableId: rtbId,
      securityGroupId: sgId,
      instanceProfileArn,
      iamRoleName: NAMES.role,
    };
  }

  async getSharedInfra(): Promise<SharedInfraIds | null> {
    const vpcs = await this.ec2.send(
      new DescribeVpcsCommand({
        Filters: [MANAGED_FILTER, { Name: "tag:Name", Values: [NAMES.vpc] }],
      }),
    );
    const vpcId = vpcs.Vpcs?.[0]?.VpcId;
    if (!vpcId) return null;

    const [subnets, igws, rtbs, sgs, profile] = await Promise.all([
      this.ec2.send(
        new DescribeSubnetsCommand({
          Filters: [{ Name: "vpc-id", Values: [vpcId] }, MANAGED_FILTER],
        }),
      ),
      this.ec2.send(
        new DescribeInternetGatewaysCommand({
          Filters: [{ Name: "attachment.vpc-id", Values: [vpcId] }],
        }),
      ),
      this.ec2.send(
        new DescribeRouteTablesCommand({
          Filters: [{ Name: "vpc-id", Values: [vpcId] }, MANAGED_FILTER],
        }),
      ),
      this.ec2.send(
        new DescribeSecurityGroupsCommand({
          Filters: [
            { Name: "vpc-id", Values: [vpcId] },
            { Name: "group-name", Values: [NAMES.sg] },
          ],
        }),
      ),
      this.iam
        .send(new GetInstanceProfileCommand({ InstanceProfileName: NAMES.instanceProfile }))
        .catch(() => null),
    ]);

    const subnetId = subnets.Subnets?.[0]?.SubnetId;
    const igwId = igws.InternetGateways?.[0]?.InternetGatewayId;
    const rtbId = rtbs.RouteTables?.[0]?.RouteTableId;
    const sgId = sgs.SecurityGroups?.[0]?.GroupId;
    const instanceProfileArn = profile?.InstanceProfile?.Arn;

    if (!subnetId || !igwId || !rtbId || !sgId || !instanceProfileArn) return null;

    return {
      vpcId,
      subnetId,
      internetGatewayId: igwId,
      routeTableId: rtbId,
      securityGroupId: sgId,
      instanceProfileArn,
      iamRoleName: NAMES.role,
    };
  }

  async deleteSharedInfraIfOrphaned(): Promise<void> {
    const infra = await this.getSharedInfra();
    if (!infra) return;

    const instances = await this.ec2.send(
      new DescribeInstancesCommand({
        Filters: [
          { Name: "vpc-id", Values: [infra.vpcId] },
          { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped"] },
        ],
      }),
    );
    const hasInstances = (instances.Reservations ?? []).some(
      (r) => (r.Instances ?? []).length > 0,
    );
    if (hasInstances) {
      this.log("Shared infrastructure still in use — skipping deletion");
      return;
    }

    this.log("Deleting orphaned shared infrastructure...");
    await this.deleteIamResources();
    await this.deleteNetworkResources(infra);
    this.log("Shared infrastructure deleted");
  }

  async updateSecurityGroupRules(
    sgId: string,
    rules: { port: number; cidr: string; description: string }[],
  ): Promise<void> {
    if (rules.length === 0) return;
    try {
      await this.ec2.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: sgId,
          IpPermissions: rules.map((r) => ({
            IpProtocol: "tcp",
            FromPort: r.port,
            ToPort: r.port,
            IpRanges: [{ CidrIp: r.cidr, Description: r.description }],
          })),
        }),
      );
    } catch (error: unknown) {
      if ((error as { name?: string }).name !== "InvalidPermission.Duplicate") throw error;
    }
  }

  // ── Resource Creation Helpers ────────────────────────────────────────

  private async createVpc(): Promise<string> {
    const vpc = await this.ec2.send(
      new CreateVpcCommand({
        CidrBlock: VPC_CIDR,
        TagSpecifications: [
          { ResourceType: "vpc", Tags: [MANAGED_TAG, { Key: "Name", Value: NAMES.vpc }] },
        ],
      }),
    );
    const vpcId = vpc.Vpc!.VpcId!;
    this.log(`  VPC: ${vpcId}`);
    return vpcId;
  }

  private async createAndAttachIgw(vpcId: string): Promise<string> {
    const igw = await this.ec2.send(
      new CreateInternetGatewayCommand({
        TagSpecifications: [
          {
            ResourceType: "internet-gateway",
            Tags: [MANAGED_TAG, { Key: "Name", Value: NAMES.igw }],
          },
        ],
      }),
    );
    const igwId = igw.InternetGateway!.InternetGatewayId!;
    await this.ec2.send(
      new AttachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }),
    );
    this.log(`  IGW: ${igwId}`);
    return igwId;
  }

  private async createSubnet(vpcId: string): Promise<string> {
    const subnet = await this.ec2.send(
      new CreateSubnetCommand({
        VpcId: vpcId,
        CidrBlock: SUBNET_CIDR,
        AvailabilityZone: `${this.region}a`,
        TagSpecifications: [
          { ResourceType: "subnet", Tags: [MANAGED_TAG, { Key: "Name", Value: NAMES.subnet }] },
        ],
      }),
    );
    const subnetId = subnet.Subnet!.SubnetId!;
    await this.ec2.send(
      new ModifySubnetAttributeCommand({
        SubnetId: subnetId,
        MapPublicIpOnLaunch: { Value: true },
      }),
    );
    this.log(`  Subnet: ${subnetId} (${this.region}a)`);
    return subnetId;
  }

  private async createRouteTable(
    vpcId: string,
    igwId: string,
    subnetId: string,
  ): Promise<string> {
    const rtb = await this.ec2.send(
      new CreateRouteTableCommand({
        VpcId: vpcId,
        TagSpecifications: [
          { ResourceType: "route-table", Tags: [MANAGED_TAG, { Key: "Name", Value: NAMES.rtb }] },
        ],
      }),
    );
    const rtbId = rtb.RouteTable!.RouteTableId!;
    await this.ec2.send(
      new CreateRouteCommand({
        RouteTableId: rtbId,
        DestinationCidrBlock: "0.0.0.0/0",
        GatewayId: igwId,
      }),
    );
    await this.ec2.send(
      new AssociateRouteTableCommand({ RouteTableId: rtbId, SubnetId: subnetId }),
    );
    this.log(`  Route table: ${rtbId}`);
    return rtbId;
  }

  private async createSecurityGroup(vpcId: string): Promise<string> {
    const sg = await this.ec2.send(
      new CreateSecurityGroupCommand({
        GroupName: NAMES.sg,
        Description: "Clawster shared security group (HTTP/HTTPS)",
        VpcId: vpcId,
        TagSpecifications: [
          {
            ResourceType: "security-group",
            Tags: [MANAGED_TAG, { Key: "Name", Value: NAMES.sg }],
          },
        ],
      }),
    );
    const sgId = sg.GroupId!;
    await this.ec2.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: sgId,
        IpPermissions: [
          {
            IpProtocol: "tcp",
            FromPort: 80,
            ToPort: 80,
            IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "HTTP" }],
          },
          {
            IpProtocol: "tcp",
            FromPort: 443,
            ToPort: 443,
            IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "HTTPS" }],
          },
        ],
      }),
    );
    this.log(`  Security group: ${sgId}`);
    return sgId;
  }

  // ── IAM Helpers ──────────────────────────────────────────────────────

  private async ensureIamResources(): Promise<{ instanceProfileArn: string }> {
    try {
      const existing = await this.iam.send(
        new GetInstanceProfileCommand({ InstanceProfileName: NAMES.instanceProfile }),
      );
      this.log("  IAM: already exists");
      return { instanceProfileArn: existing.InstanceProfile!.Arn! };
    } catch {
      // Not found — create below
    }

    await this.iam.send(
      new CreateRoleCommand({
        RoleName: NAMES.role,
        AssumeRolePolicyDocument: EC2_TRUST_POLICY,
        Description: "Clawster EC2 instance role (SecretsManager read)",
        Tags: [MANAGED_TAG],
      }),
    );
    await this.iam.send(
      new PutRolePolicyCommand({
        RoleName: NAMES.role,
        PolicyName: INLINE_POLICY_NAME,
        PolicyDocument: buildInlinePolicyDocument(this.region),
      }),
    );

    const ip = await this.iam.send(
      new CreateInstanceProfileCommand({
        InstanceProfileName: NAMES.instanceProfile,
        Tags: [MANAGED_TAG],
      }),
    );
    await this.iam.send(
      new AddRoleToInstanceProfileCommand({
        InstanceProfileName: NAMES.instanceProfile,
        RoleName: NAMES.role,
      }),
    );

    this.log("  IAM: role + instance profile created");
    return { instanceProfileArn: ip.InstanceProfile!.Arn! };
  }

  // ── Deletion Helpers ─────────────────────────────────────────────────

  private async deleteIamResources(): Promise<void> {
    await this.safeDelete("role→profile link", () =>
      this.iam.send(
        new RemoveRoleFromInstanceProfileCommand({
          InstanceProfileName: NAMES.instanceProfile,
          RoleName: NAMES.role,
        }),
      ),
    );
    await this.safeDelete("instance profile", () =>
      this.iam.send(
        new DeleteInstanceProfileCommand({ InstanceProfileName: NAMES.instanceProfile }),
      ),
    );
    await this.safeDelete("role policy", () =>
      this.iam.send(
        new DeleteRolePolicyCommand({ RoleName: NAMES.role, PolicyName: INLINE_POLICY_NAME }),
      ),
    );
    await this.safeDelete("IAM role", () =>
      this.iam.send(new DeleteRoleCommand({ RoleName: NAMES.role })),
    );
  }

  private async deleteNetworkResources(infra: SharedInfraIds): Promise<void> {
    await this.safeDelete("security group", () =>
      this.ec2.send(new DeleteSecurityGroupCommand({ GroupId: infra.securityGroupId })),
    );

    // Disassociate route table before deleting
    const rtbs = await this.ec2
      .send(new DescribeRouteTablesCommand({ RouteTableIds: [infra.routeTableId] }))
      .catch(() => ({ RouteTables: [] as never[] }));
    for (const assoc of rtbs.RouteTables?.[0]?.Associations ?? []) {
      if (assoc.RouteTableAssociationId && !assoc.Main) {
        await this.safeDelete("route table association", () =>
          this.ec2.send(
            new DisassociateRouteTableCommand({
              AssociationId: assoc.RouteTableAssociationId!,
            }),
          ),
        );
      }
    }
    await this.safeDelete("route table", () =>
      this.ec2.send(new DeleteRouteTableCommand({ RouteTableId: infra.routeTableId })),
    );

    await this.safeDelete("subnet", () =>
      this.ec2.send(new DeleteSubnetCommand({ SubnetId: infra.subnetId })),
    );

    await this.safeDelete("IGW detach", () =>
      this.ec2.send(
        new DetachInternetGatewayCommand({
          InternetGatewayId: infra.internetGatewayId,
          VpcId: infra.vpcId,
        }),
      ),
    );
    await this.safeDelete("IGW", () =>
      this.ec2.send(
        new DeleteInternetGatewayCommand({ InternetGatewayId: infra.internetGatewayId }),
      ),
    );

    await this.safeDelete("VPC", () =>
      this.ec2.send(new DeleteVpcCommand({ VpcId: infra.vpcId })),
    );
  }

  private async safeDelete(description: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
      this.log(`  Deleted: ${description}`);
    } catch (error: unknown) {
      const name = (error as { name?: string }).name ?? "";
      if (name.includes("NotFound") || name.includes("NoSuchEntity")) return;
      throw error;
    }
  }
}
