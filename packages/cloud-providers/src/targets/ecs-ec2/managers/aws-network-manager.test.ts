import { AwsNetworkManager } from "./aws-network-manager";
import type { EC2Client } from "@aws-sdk/client-ec2";
import type { IAMClient } from "@aws-sdk/client-iam";
import {
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeInternetGatewaysCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  DescribeInstancesCommand,
  CreateVpcCommand,
  CreateSubnetCommand,
  CreateInternetGatewayCommand,
  CreateRouteTableCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DeleteVpcCommand,
  DeleteSubnetCommand,
  DeleteInternetGatewayCommand,
  DeleteRouteTableCommand,
  DeleteSecurityGroupCommand,
} from "@aws-sdk/client-ec2";
import {
  GetInstanceProfileCommand,
  CreateRoleCommand,
  CreateInstanceProfileCommand,
  RemoveRoleFromInstanceProfileCommand,
  DeleteInstanceProfileCommand,
  DeleteRolePolicyCommand,
  DeleteRoleCommand,
} from "@aws-sdk/client-iam";
import type { SharedInfraIds } from "../types";

const SHARED_INFRA: SharedInfraIds = {
  vpcId: "vpc-123",
  subnetId: "subnet-456",
  internetGatewayId: "igw-789",
  routeTableId: "rtb-abc",
  securityGroupId: "sg-def",
  instanceProfileArn: "arn:aws:iam::123:instance-profile/clawster-instance-profile",
  iamRoleName: "clawster-instance-role",
};

/**
 * Helper: builds a mockImplementation for ec2.send that resolves
 * Describe* commands with the shared infra fixture data.
 */
function makeEc2DescribeMock(): (cmd: unknown) => Promise<unknown> {
  return (cmd: unknown): Promise<unknown> => {
    if (cmd instanceof DescribeVpcsCommand) {
      return Promise.resolve({ Vpcs: [{ VpcId: SHARED_INFRA.vpcId }] });
    }
    if (cmd instanceof DescribeSubnetsCommand) {
      return Promise.resolve({ Subnets: [{ SubnetId: SHARED_INFRA.subnetId }] });
    }
    if (cmd instanceof DescribeInternetGatewaysCommand) {
      return Promise.resolve({
        InternetGateways: [{ InternetGatewayId: SHARED_INFRA.internetGatewayId }],
      });
    }
    if (cmd instanceof DescribeRouteTablesCommand) {
      return Promise.resolve({
        RouteTables: [{ RouteTableId: SHARED_INFRA.routeTableId }],
      });
    }
    if (cmd instanceof DescribeSecurityGroupsCommand) {
      return Promise.resolve({
        SecurityGroups: [{ GroupId: SHARED_INFRA.securityGroupId }],
      });
    }
    return Promise.resolve({});
  };
}

describe("AwsNetworkManager", () => {
  let mockEc2Send: jest.Mock;
  let mockIamSend: jest.Mock;
  let ec2Client: EC2Client;
  let iamClient: IAMClient;
  let logCallback: jest.Mock;
  let manager: AwsNetworkManager;

  beforeEach(() => {
    mockEc2Send = jest.fn();
    mockIamSend = jest.fn();
    ec2Client = { send: mockEc2Send } as unknown as EC2Client;
    iamClient = { send: mockIamSend } as unknown as IAMClient;
    logCallback = jest.fn();
    manager = new AwsNetworkManager(ec2Client, iamClient, "us-east-1", logCallback);
  });

  describe("getSharedInfra", () => {
    it("returns SharedInfraIds when all resources exist", async () => {
      mockEc2Send.mockImplementation(makeEc2DescribeMock());
      mockIamSend.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof GetInstanceProfileCommand) {
          return Promise.resolve({ InstanceProfile: { Arn: SHARED_INFRA.instanceProfileArn } });
        }
        return Promise.resolve({});
      });

      const result = await manager.getSharedInfra();

      expect(result).toEqual(SHARED_INFRA);
    });

    it("returns null when no VPC exists", async () => {
      mockEc2Send.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof DescribeVpcsCommand) {
          return Promise.resolve({ Vpcs: [] });
        }
        return Promise.resolve({});
      });

      const result = await manager.getSharedInfra();

      expect(result).toBeNull();
    });

    it("returns null when subnet is missing", async () => {
      mockEc2Send.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof DescribeVpcsCommand) {
          return Promise.resolve({ Vpcs: [{ VpcId: "vpc-123" }] });
        }
        if (cmd instanceof DescribeSubnetsCommand) {
          return Promise.resolve({ Subnets: [] });
        }
        if (cmd instanceof DescribeInternetGatewaysCommand) {
          return Promise.resolve({ InternetGateways: [{ InternetGatewayId: "igw-789" }] });
        }
        if (cmd instanceof DescribeRouteTablesCommand) {
          return Promise.resolve({ RouteTables: [{ RouteTableId: "rtb-abc" }] });
        }
        if (cmd instanceof DescribeSecurityGroupsCommand) {
          return Promise.resolve({ SecurityGroups: [{ GroupId: "sg-def" }] });
        }
        return Promise.resolve({});
      });
      mockIamSend.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof GetInstanceProfileCommand) {
          return Promise.resolve({ InstanceProfile: { Arn: SHARED_INFRA.instanceProfileArn } });
        }
        return Promise.resolve({});
      });

      const result = await manager.getSharedInfra();

      expect(result).toBeNull();
    });

    it("returns null when instance profile lookup fails", async () => {
      mockEc2Send.mockImplementation(makeEc2DescribeMock());
      mockIamSend.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof GetInstanceProfileCommand) {
          return Promise.reject(new Error("NoSuchEntity"));
        }
        return Promise.resolve({});
      });

      const result = await manager.getSharedInfra();

      expect(result).toBeNull();
    });
  });

  describe("ensureSharedInfra", () => {
    it("returns existing infra when already present (idempotent)", async () => {
      mockEc2Send.mockImplementation(makeEc2DescribeMock());
      mockIamSend.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof GetInstanceProfileCommand) {
          return Promise.resolve({ InstanceProfile: { Arn: SHARED_INFRA.instanceProfileArn } });
        }
        return Promise.resolve({});
      });

      const result = await manager.ensureSharedInfra();

      expect(result).toEqual(SHARED_INFRA);
      expect(logCallback).toHaveBeenCalledWith("Shared infrastructure already exists");
      expect(mockEc2Send).not.toHaveBeenCalledWith(expect.any(CreateVpcCommand));
    });

    it("creates all resources when none exist", async () => {
      mockEc2Send.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof DescribeVpcsCommand) {
          return Promise.resolve({ Vpcs: [] });
        }
        if (cmd instanceof CreateVpcCommand) {
          return Promise.resolve({ Vpc: { VpcId: "vpc-new" } });
        }
        if (cmd instanceof CreateInternetGatewayCommand) {
          return Promise.resolve({ InternetGateway: { InternetGatewayId: "igw-new" } });
        }
        if (cmd instanceof CreateSubnetCommand) {
          return Promise.resolve({ Subnet: { SubnetId: "subnet-new" } });
        }
        if (cmd instanceof CreateRouteTableCommand) {
          return Promise.resolve({ RouteTable: { RouteTableId: "rtb-new" } });
        }
        if (cmd instanceof CreateSecurityGroupCommand) {
          return Promise.resolve({ GroupId: "sg-new" });
        }
        // All other EC2 commands (Attach, Modify, Route, Associate, AuthorizeSGIngress)
        return Promise.resolve({});
      });

      mockIamSend.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof GetInstanceProfileCommand) {
          return Promise.reject(new Error("NoSuchEntity"));
        }
        if (cmd instanceof CreateInstanceProfileCommand) {
          return Promise.resolve({
            InstanceProfile: { Arn: "arn:aws:iam::123:instance-profile/new-profile" },
          });
        }
        // CreateRole, AttachRolePolicy, AddRoleToInstanceProfile
        return Promise.resolve({});
      });

      const result = await manager.ensureSharedInfra();

      expect(result).toEqual({
        vpcId: "vpc-new",
        subnetId: "subnet-new",
        internetGatewayId: "igw-new",
        routeTableId: "rtb-new",
        securityGroupId: "sg-new",
        instanceProfileArn: "arn:aws:iam::123:instance-profile/new-profile",
        iamRoleName: "clawster-instance-role",
      });
      expect(logCallback).toHaveBeenCalledWith("Creating shared infrastructure...");
      expect(logCallback).toHaveBeenCalledWith("Shared infrastructure ready");
    });
  });

  describe("updateSecurityGroupRules", () => {
    it("adds ingress rules successfully", async () => {
      mockEc2Send.mockResolvedValueOnce({});

      await manager.updateSecurityGroupRules("sg-123", [
        { port: 8080, cidr: "0.0.0.0/0", description: "Custom HTTP" },
      ]);

      expect(mockEc2Send).toHaveBeenCalledWith(
        expect.any(AuthorizeSecurityGroupIngressCommand),
      );
    });

    it("silently handles duplicate rule errors", async () => {
      const dupError = new Error("Rule already exists");
      (dupError as Error & { name: string }).name = "InvalidPermission.Duplicate";

      mockEc2Send.mockRejectedValueOnce(dupError);

      await expect(
        manager.updateSecurityGroupRules("sg-123", [
          { port: 443, cidr: "0.0.0.0/0", description: "HTTPS" },
        ]),
      ).resolves.toBeUndefined();
    });

    it("rethrows non-duplicate errors", async () => {
      const authError = new Error("Unauthorized");
      (authError as Error & { name: string }).name = "UnauthorizedOperation";

      mockEc2Send.mockRejectedValueOnce(authError);

      await expect(
        manager.updateSecurityGroupRules("sg-123", [
          { port: 443, cidr: "0.0.0.0/0", description: "HTTPS" },
        ]),
      ).rejects.toThrow("Unauthorized");
    });

    it("does nothing when rules array is empty", async () => {
      await manager.updateSecurityGroupRules("sg-123", []);

      expect(mockEc2Send).not.toHaveBeenCalled();
    });
  });

  describe("deleteSharedInfraIfOrphaned", () => {
    it("deletes all resources when no instances are running", async () => {
      const deletedResources: string[] = [];

      mockEc2Send.mockImplementation((cmd: unknown): Promise<unknown> => {
        // getSharedInfra Describe calls
        if (cmd instanceof DescribeVpcsCommand) {
          return Promise.resolve({ Vpcs: [{ VpcId: SHARED_INFRA.vpcId }] });
        }
        if (cmd instanceof DescribeSubnetsCommand) {
          return Promise.resolve({ Subnets: [{ SubnetId: SHARED_INFRA.subnetId }] });
        }
        if (cmd instanceof DescribeInternetGatewaysCommand) {
          return Promise.resolve({
            InternetGateways: [{ InternetGatewayId: SHARED_INFRA.internetGatewayId }],
          });
        }
        if (cmd instanceof DescribeRouteTablesCommand) {
          return Promise.resolve({
            RouteTables: [
              {
                RouteTableId: SHARED_INFRA.routeTableId,
                Associations: [{ RouteTableAssociationId: "rtbassoc-123", Main: false }],
              },
            ],
          });
        }
        if (cmd instanceof DescribeSecurityGroupsCommand) {
          return Promise.resolve({
            SecurityGroups: [{ GroupId: SHARED_INFRA.securityGroupId }],
          });
        }
        if (cmd instanceof DescribeInstancesCommand) {
          return Promise.resolve({ Reservations: [] });
        }
        // Track deletions
        if (cmd instanceof DeleteSecurityGroupCommand) {
          deletedResources.push("sg");
          return Promise.resolve({});
        }
        if (cmd instanceof DeleteRouteTableCommand) {
          deletedResources.push("rtb");
          return Promise.resolve({});
        }
        if (cmd instanceof DeleteSubnetCommand) {
          deletedResources.push("subnet");
          return Promise.resolve({});
        }
        if (cmd instanceof DeleteInternetGatewayCommand) {
          deletedResources.push("igw");
          return Promise.resolve({});
        }
        if (cmd instanceof DeleteVpcCommand) {
          deletedResources.push("vpc");
          return Promise.resolve({});
        }
        // DisassociateRouteTable, DetachInternetGateway, etc.
        return Promise.resolve({});
      });

      mockIamSend.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof GetInstanceProfileCommand) {
          return Promise.resolve({ InstanceProfile: { Arn: SHARED_INFRA.instanceProfileArn } });
        }
        if (cmd instanceof RemoveRoleFromInstanceProfileCommand) {
          deletedResources.push("role-profile-link");
          return Promise.resolve({});
        }
        if (cmd instanceof DeleteInstanceProfileCommand) {
          deletedResources.push("instance-profile");
          return Promise.resolve({});
        }
        if (cmd instanceof DeleteRolePolicyCommand) {
          deletedResources.push("role-policy");
          return Promise.resolve({});
        }
        if (cmd instanceof DeleteRoleCommand) {
          deletedResources.push("role");
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      await manager.deleteSharedInfraIfOrphaned();

      expect(deletedResources).toContain("sg");
      expect(deletedResources).toContain("rtb");
      expect(deletedResources).toContain("subnet");
      expect(deletedResources).toContain("igw");
      expect(deletedResources).toContain("vpc");
      expect(deletedResources).toContain("role");
      expect(deletedResources).toContain("instance-profile");
      expect(logCallback).toHaveBeenCalledWith("Shared infrastructure deleted");
    });

    it("skips deletion when instances are still running", async () => {
      mockEc2Send.mockImplementation(
        (cmd: unknown): Promise<unknown> => {
          if (cmd instanceof DescribeVpcsCommand) {
            return Promise.resolve({ Vpcs: [{ VpcId: SHARED_INFRA.vpcId }] });
          }
          if (cmd instanceof DescribeSubnetsCommand) {
            return Promise.resolve({ Subnets: [{ SubnetId: SHARED_INFRA.subnetId }] });
          }
          if (cmd instanceof DescribeInternetGatewaysCommand) {
            return Promise.resolve({
              InternetGateways: [{ InternetGatewayId: SHARED_INFRA.internetGatewayId }],
            });
          }
          if (cmd instanceof DescribeRouteTablesCommand) {
            return Promise.resolve({
              RouteTables: [{ RouteTableId: SHARED_INFRA.routeTableId }],
            });
          }
          if (cmd instanceof DescribeSecurityGroupsCommand) {
            return Promise.resolve({
              SecurityGroups: [{ GroupId: SHARED_INFRA.securityGroupId }],
            });
          }
          if (cmd instanceof DescribeInstancesCommand) {
            return Promise.resolve({
              Reservations: [
                { Instances: [{ InstanceId: "i-active", State: { Name: "running" } }] },
              ],
            });
          }
          return Promise.resolve({});
        },
      );
      mockIamSend.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof GetInstanceProfileCommand) {
          return Promise.resolve({ InstanceProfile: { Arn: SHARED_INFRA.instanceProfileArn } });
        }
        return Promise.resolve({});
      });

      await manager.deleteSharedInfraIfOrphaned();

      expect(logCallback).toHaveBeenCalledWith(
        "Shared infrastructure still in use — skipping deletion",
      );
      expect(mockEc2Send).not.toHaveBeenCalledWith(expect.any(DeleteVpcCommand));
    });

    it("does nothing when no shared infra exists", async () => {
      mockEc2Send.mockImplementation((cmd: unknown): Promise<unknown> => {
        if (cmd instanceof DescribeVpcsCommand) {
          return Promise.resolve({ Vpcs: [] });
        }
        return Promise.resolve({});
      });

      await manager.deleteSharedInfraIfOrphaned();

      expect(mockEc2Send).not.toHaveBeenCalledWith(expect.any(DescribeInstancesCommand));
      expect(mockEc2Send).not.toHaveBeenCalledWith(expect.any(DeleteVpcCommand));
    });
  });
});
