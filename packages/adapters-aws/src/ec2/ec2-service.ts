import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
  DescribeAvailabilityZonesCommand,
  Instance,
  Vpc,
  Subnet,
  SecurityGroup,
  AvailabilityZone,
  Filter,
} from "@aws-sdk/client-ec2";

export interface EC2Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface EC2InstanceInfo {
  instanceId: string;
  instanceType: string;
  state: string;
  privateIpAddress?: string;
  publicIpAddress?: string;
  vpcId?: string;
  subnetId?: string;
  securityGroups: { id: string; name: string }[];
  launchTime: Date;
  tags: Record<string, string>;
}

export interface VpcInfo {
  vpcId: string;
  cidrBlock: string;
  isDefault: boolean;
  state: string;
  tags: Record<string, string>;
}

export interface SubnetInfo {
  subnetId: string;
  vpcId: string;
  cidrBlock: string;
  availabilityZone: string;
  availableIpAddressCount: number;
  isDefault: boolean;
  mapPublicIpOnLaunch: boolean;
  tags: Record<string, string>;
}

export interface SecurityGroupInfo {
  groupId: string;
  groupName: string;
  description: string;
  vpcId: string;
  inboundRules: SecurityGroupRule[];
  outboundRules: SecurityGroupRule[];
  tags: Record<string, string>;
}

export interface SecurityGroupRule {
  protocol: string;
  fromPort?: number;
  toPort?: number;
  cidrBlocks: string[];
  securityGroups: string[];
  description?: string;
}

export interface AvailabilityZoneInfo {
  zoneName: string;
  zoneId: string;
  state: string;
  regionName: string;
}

export class EC2Service {
  private client: EC2Client;

  constructor(region: string = "us-east-1", credentials?: EC2Credentials) {
    this.client = new EC2Client({
      region,
      credentials: credentials
        ? {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
          }
        : undefined,
    });
  }

  /**
   * Describe EC2 instances with optional filters.
   */
  async describeInstances(options?: {
    instanceIds?: string[];
    filters?: { name: string; values: string[] }[];
  }): Promise<EC2InstanceInfo[]> {
    const instances: EC2InstanceInfo[] = [];
    let nextToken: string | undefined;

    const filters: Filter[] | undefined = options?.filters?.map((f) => ({
      Name: f.name,
      Values: f.values,
    }));

    do {
      const result = await this.client.send(
        new DescribeInstancesCommand({
          InstanceIds: options?.instanceIds,
          Filters: filters,
          NextToken: nextToken,
        })
      );

      for (const reservation of result.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
          instances.push(this.mapInstanceToInfo(instance));
        }
      }

      nextToken = result.NextToken;
    } while (nextToken);

    return instances;
  }

  /**
   * Get a specific instance by ID.
   */
  async getInstance(instanceId: string): Promise<EC2InstanceInfo | undefined> {
    const instances = await this.describeInstances({ instanceIds: [instanceId] });
    return instances.length > 0 ? instances[0] : undefined;
  }

  /**
   * Get instances by tag.
   */
  async getInstancesByTag(
    tagKey: string,
    tagValue: string
  ): Promise<EC2InstanceInfo[]> {
    return this.describeInstances({
      filters: [{ name: `tag:${tagKey}`, values: [tagValue] }],
    });
  }

  /**
   * Describe VPCs with optional filters.
   */
  async describeVpcs(options?: {
    vpcIds?: string[];
    filters?: { name: string; values: string[] }[];
  }): Promise<VpcInfo[]> {
    const vpcs: VpcInfo[] = [];
    let nextToken: string | undefined;

    const filters: Filter[] | undefined = options?.filters?.map((f) => ({
      Name: f.name,
      Values: f.values,
    }));

    do {
      const result = await this.client.send(
        new DescribeVpcsCommand({
          VpcIds: options?.vpcIds,
          Filters: filters,
          NextToken: nextToken,
        })
      );

      for (const vpc of result.Vpcs ?? []) {
        vpcs.push(this.mapVpcToInfo(vpc));
      }

      nextToken = result.NextToken;
    } while (nextToken);

    return vpcs;
  }

  /**
   * Get the default VPC.
   */
  async getDefaultVpc(): Promise<VpcInfo | undefined> {
    const vpcs = await this.describeVpcs({
      filters: [{ name: "isDefault", values: ["true"] }],
    });
    return vpcs.length > 0 ? vpcs[0] : undefined;
  }

  /**
   * Get a specific VPC by ID.
   */
  async getVpc(vpcId: string): Promise<VpcInfo | undefined> {
    const vpcs = await this.describeVpcs({ vpcIds: [vpcId] });
    return vpcs.length > 0 ? vpcs[0] : undefined;
  }

  /**
   * Describe subnets with optional filters.
   */
  async describeSubnets(options?: {
    subnetIds?: string[];
    vpcId?: string;
    filters?: { name: string; values: string[] }[];
  }): Promise<SubnetInfo[]> {
    const subnets: SubnetInfo[] = [];
    let nextToken: string | undefined;

    const filters: Filter[] = options?.filters?.map((f) => ({
      Name: f.name,
      Values: f.values,
    })) ?? [];

    if (options?.vpcId) {
      filters.push({ Name: "vpc-id", Values: [options.vpcId] });
    }

    do {
      const result = await this.client.send(
        new DescribeSubnetsCommand({
          SubnetIds: options?.subnetIds,
          Filters: filters.length > 0 ? filters : undefined,
          NextToken: nextToken,
        })
      );

      for (const subnet of result.Subnets ?? []) {
        subnets.push(this.mapSubnetToInfo(subnet));
      }

      nextToken = result.NextToken;
    } while (nextToken);

    return subnets;
  }

  /**
   * Get subnets by VPC ID.
   */
  async getSubnetsByVpc(vpcId: string): Promise<SubnetInfo[]> {
    return this.describeSubnets({ vpcId });
  }

  /**
   * Get public subnets (those that map public IP on launch).
   */
  async getPublicSubnets(vpcId?: string): Promise<SubnetInfo[]> {
    const subnets = await this.describeSubnets({ vpcId });
    return subnets.filter((s) => s.mapPublicIpOnLaunch);
  }

  /**
   * Get private subnets (those that do not map public IP on launch).
   */
  async getPrivateSubnets(vpcId?: string): Promise<SubnetInfo[]> {
    const subnets = await this.describeSubnets({ vpcId });
    return subnets.filter((s) => !s.mapPublicIpOnLaunch);
  }

  /**
   * Describe security groups with optional filters.
   */
  async describeSecurityGroups(options?: {
    groupIds?: string[];
    groupNames?: string[];
    vpcId?: string;
    filters?: { name: string; values: string[] }[];
  }): Promise<SecurityGroupInfo[]> {
    const groups: SecurityGroupInfo[] = [];
    let nextToken: string | undefined;

    const filters: Filter[] = options?.filters?.map((f) => ({
      Name: f.name,
      Values: f.values,
    })) ?? [];

    if (options?.vpcId) {
      filters.push({ Name: "vpc-id", Values: [options.vpcId] });
    }

    do {
      const result = await this.client.send(
        new DescribeSecurityGroupsCommand({
          GroupIds: options?.groupIds,
          GroupNames: options?.groupNames,
          Filters: filters.length > 0 ? filters : undefined,
          NextToken: nextToken,
        })
      );

      for (const group of result.SecurityGroups ?? []) {
        groups.push(this.mapSecurityGroupToInfo(group));
      }

      nextToken = result.NextToken;
    } while (nextToken);

    return groups;
  }

  /**
   * Get a specific security group by ID.
   */
  async getSecurityGroup(groupId: string): Promise<SecurityGroupInfo | undefined> {
    const groups = await this.describeSecurityGroups({ groupIds: [groupId] });
    return groups.length > 0 ? groups[0] : undefined;
  }

  /**
   * Describe availability zones.
   */
  async describeAvailabilityZones(): Promise<AvailabilityZoneInfo[]> {
    const result = await this.client.send(
      new DescribeAvailabilityZonesCommand({})
    );

    return (result.AvailabilityZones ?? []).map((az) =>
      this.mapAvailabilityZoneToInfo(az)
    );
  }

  /**
   * Map AWS SDK Instance to EC2InstanceInfo.
   */
  private mapInstanceToInfo(instance: Instance): EC2InstanceInfo {
    const tags: Record<string, string> = {};
    for (const tag of instance.Tags ?? []) {
      if (tag.Key && tag.Value) {
        tags[tag.Key] = tag.Value;
      }
    }

    return {
      instanceId: instance.InstanceId || "",
      instanceType: instance.InstanceType || "",
      state: instance.State?.Name || "unknown",
      privateIpAddress: instance.PrivateIpAddress,
      publicIpAddress: instance.PublicIpAddress,
      vpcId: instance.VpcId,
      subnetId: instance.SubnetId,
      securityGroups: (instance.SecurityGroups ?? []).map((sg) => ({
        id: sg.GroupId || "",
        name: sg.GroupName || "",
      })),
      launchTime: instance.LaunchTime || new Date(),
      tags,
    };
  }

  /**
   * Map AWS SDK Vpc to VpcInfo.
   */
  private mapVpcToInfo(vpc: Vpc): VpcInfo {
    const tags: Record<string, string> = {};
    for (const tag of vpc.Tags ?? []) {
      if (tag.Key && tag.Value) {
        tags[tag.Key] = tag.Value;
      }
    }

    return {
      vpcId: vpc.VpcId || "",
      cidrBlock: vpc.CidrBlock || "",
      isDefault: vpc.IsDefault || false,
      state: vpc.State || "unknown",
      tags,
    };
  }

  /**
   * Map AWS SDK Subnet to SubnetInfo.
   */
  private mapSubnetToInfo(subnet: Subnet): SubnetInfo {
    const tags: Record<string, string> = {};
    for (const tag of subnet.Tags ?? []) {
      if (tag.Key && tag.Value) {
        tags[tag.Key] = tag.Value;
      }
    }

    return {
      subnetId: subnet.SubnetId || "",
      vpcId: subnet.VpcId || "",
      cidrBlock: subnet.CidrBlock || "",
      availabilityZone: subnet.AvailabilityZone || "",
      availableIpAddressCount: subnet.AvailableIpAddressCount || 0,
      isDefault: subnet.DefaultForAz || false,
      mapPublicIpOnLaunch: subnet.MapPublicIpOnLaunch || false,
      tags,
    };
  }

  /**
   * Map AWS SDK SecurityGroup to SecurityGroupInfo.
   */
  private mapSecurityGroupToInfo(group: SecurityGroup): SecurityGroupInfo {
    const tags: Record<string, string> = {};
    for (const tag of group.Tags ?? []) {
      if (tag.Key && tag.Value) {
        tags[tag.Key] = tag.Value;
      }
    }

    const inboundRules: SecurityGroupRule[] = (group.IpPermissions ?? []).map(
      (perm) => ({
        protocol: perm.IpProtocol || "all",
        fromPort: perm.FromPort,
        toPort: perm.ToPort,
        cidrBlocks: (perm.IpRanges ?? []).map((r) => r.CidrIp || ""),
        securityGroups: (perm.UserIdGroupPairs ?? []).map((p) => p.GroupId || ""),
        description: perm.IpRanges?.[0]?.Description,
      })
    );

    const outboundRules: SecurityGroupRule[] = (group.IpPermissionsEgress ?? []).map(
      (perm) => ({
        protocol: perm.IpProtocol || "all",
        fromPort: perm.FromPort,
        toPort: perm.ToPort,
        cidrBlocks: (perm.IpRanges ?? []).map((r) => r.CidrIp || ""),
        securityGroups: (perm.UserIdGroupPairs ?? []).map((p) => p.GroupId || ""),
        description: perm.IpRanges?.[0]?.Description,
      })
    );

    return {
      groupId: group.GroupId || "",
      groupName: group.GroupName || "",
      description: group.Description || "",
      vpcId: group.VpcId || "",
      inboundRules,
      outboundRules,
      tags,
    };
  }

  /**
   * Map AWS SDK AvailabilityZone to AvailabilityZoneInfo.
   */
  private mapAvailabilityZoneToInfo(az: AvailabilityZone): AvailabilityZoneInfo {
    return {
      zoneName: az.ZoneName || "",
      zoneId: az.ZoneId || "",
      state: az.State || "unknown",
      regionName: az.RegionName || "",
    };
  }
}
