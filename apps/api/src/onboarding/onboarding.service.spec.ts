/**
 * Unit Tests - Onboarding Service
 */
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";

// Mock the reconciler and config-generator modules BEFORE they are imported
// to avoid pulling in the AWS SDK dependency chain.
jest.mock("../reconciler/reconciler.service", () => ({
  ReconcilerService: jest.fn().mockImplementation(() => ({
    reconcile: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../reconciler/config-generator.service", () => ({
  ConfigGeneratorService: jest.fn().mockImplementation(() => ({})),
}));

// Mock only randomBytes for deterministic tests, keeping the rest of crypto intact
jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return {
    ...actual,
    randomBytes: jest.fn().mockReturnValue({
      toString: jest.fn().mockReturnValue("mock-gateway-auth-token-hex"),
    }),
  };
});

import { OnboardingService } from "./onboarding.service";
import { ReconcilerService } from "../reconciler/reconciler.service";
import { ConfigGeneratorService } from "../reconciler/config-generator.service";
import { CredentialVaultService } from "../connectors/credential-vault.service";
import {
  BOT_INSTANCE_REPOSITORY,
  FLEET_REPOSITORY,
  WORKSPACE_REPOSITORY,
  CHANNEL_REPOSITORY,
  PRISMA_CLIENT,
} from "@clawster/database";

describe("OnboardingService", () => {
  let service: OnboardingService;
  let reconcilerService: ReconcilerService;

  // Mock repositories - using jest.fn() for flexible mocking
  const mockBotInstanceRepo = {
    count: jest.fn(),
    findFirst: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    deleteRelatedRecords: jest.fn(),
    delete: jest.fn(),
  };

  const mockFleetRepo = {
    findById: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  };

  const mockWorkspaceRepo = {
    findFirstWorkspace: jest.fn(),
    createWorkspace: jest.fn(),
  };

  const mockChannelRepo = {
    upsertChannel: jest.fn(),
    deleteChannelsByNamePrefix: jest.fn(),
  };

  const mockPrisma = {
    deploymentTarget: {
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockReconciler = {
    reconcile: jest.fn().mockResolvedValue({ success: true }),
  };

  const mockConfigGenerator = {};

  const mockCredentialVault = {
    resolve: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: BOT_INSTANCE_REPOSITORY, useValue: mockBotInstanceRepo },
        { provide: FLEET_REPOSITORY, useValue: mockFleetRepo },
        { provide: WORKSPACE_REPOSITORY, useValue: mockWorkspaceRepo },
        { provide: CHANNEL_REPOSITORY, useValue: mockChannelRepo },
        { provide: PRISMA_CLIENT, useValue: mockPrisma },
        { provide: ReconcilerService, useValue: mockReconciler },
        { provide: ConfigGeneratorService, useValue: mockConfigGenerator },
        { provide: CredentialVaultService, useValue: mockCredentialVault },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    reconcilerService = module.get<ReconcilerService>(ReconcilerService);
    jest.clearAllMocks();
  });

  // ===========================================================================
  // checkFirstRun
  // ===========================================================================
  describe("checkFirstRun", () => {
    it("should return hasInstances: false when no bot instances exist", async () => {
      mockBotInstanceRepo.count.mockResolvedValue(0);

      const result = await service.checkFirstRun();

      expect(result).toEqual({ hasInstances: false });
      expect(mockBotInstanceRepo.count).toHaveBeenCalledTimes(1);
    });

    it("should return hasInstances: true when bot instances exist", async () => {
      mockBotInstanceRepo.count.mockResolvedValue(3);

      const result = await service.checkFirstRun();

      expect(result).toEqual({ hasInstances: true });
    });

    it("should return hasInstances: true when exactly one bot instance exists", async () => {
      mockBotInstanceRepo.count.mockResolvedValue(1);

      const result = await service.checkFirstRun();

      expect(result).toEqual({ hasInstances: true });
    });
  });

  // ===========================================================================
  // getTemplates
  // ===========================================================================
  describe("getTemplates", () => {
    it("should return a list of templates", () => {
      const templates = service.getTemplates();

      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });

    it("should return templates with expected shape", () => {
      const templates = service.getTemplates();

      for (const t of templates) {
        expect(t).toHaveProperty("id");
        expect(t).toHaveProperty("name");
        expect(t).toHaveProperty("description");
        expect(t).toHaveProperty("category");
        expect(t).toHaveProperty("channels");
        expect(t).toHaveProperty("requiredInputs");
      }
    });

    it("should filter out gatewayAuth from requiredInputs", () => {
      const templates = service.getTemplates();

      for (const t of templates) {
        for (const input of t.requiredInputs) {
          expect(input.key).not.toContain("gatewayAuth");
        }
      }
    });

    it("should include known template IDs", () => {
      const templates = service.getTemplates();
      const ids = templates.map((t) => t.id);

      expect(ids).toContain("builtin-whatsapp-personal");
      expect(ids).toContain("builtin-telegram-bot");
      expect(ids).toContain("builtin-whatsapp-personal");
    });
  });

  // ===========================================================================
  // preview
  // ===========================================================================
  describe("preview", () => {
    it("should return generated config for a valid template", async () => {
      const result = await service.preview({
        templateId: "builtin-whatsapp-personal",
      });

      expect(result).toHaveProperty("config");
      expect(result.config).toHaveProperty("gateway");
      expect(result.config).toHaveProperty("channels");
    });

    it("should throw BadRequestException for an invalid template", async () => {
      await expect(
        service.preview({ templateId: "non-existent-template" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should apply channel configs to the preview", async () => {
      const result = await service.preview({
        templateId: "builtin-whatsapp-personal",
        channels: [
          {
            type: "whatsapp",
            config: { sendReadReceipts: false },
          },
        ],
      });

      const channels = result.config.channels as Record<string, any>;
      expect(channels.whatsapp).toBeDefined();
      // Check dmPolicy from template defaults and sendReadReceipts override
      expect(channels.whatsapp.dmPolicy).toBe("pairing");
      expect(channels.whatsapp.sendReadReceipts).toBe(false);
    });

    it("should apply configOverrides to the preview", async () => {
      const result = await service.preview({
        templateId: "builtin-whatsapp-personal",
        configOverrides: { customKey: "customValue" },
      });

      expect(result.config).toHaveProperty("customKey", "customValue");
    });

    it("should apply both channels and configOverrides", async () => {
      const result = await service.preview({
        templateId: "builtin-whatsapp-personal",
        channels: [{ type: "whatsapp", config: { mediaMaxMb: 10 } }],
        configOverrides: { extraField: true },
      });

      const channels = result.config.channels as Record<string, any>;
      expect(channels.whatsapp.mediaMaxMb).toBe(10);
      expect(result.config).toHaveProperty("extraField", true);
    });
  });

  // ===========================================================================
  // deploy
  // ===========================================================================
  describe("deploy", () => {
    const mockWorkspace = {
      id: "ws-1",
      name: "Default Workspace",
      slug: "default",
    };
    const mockFleet = {
      id: "fleet-1",
      name: "Default Fleet",
      workspaceId: "ws-1",
    };
    const mockDeploymentTarget = { id: "dt-1" };
    const mockBotInstance = {
      id: "bot-1",
      name: "test-bot",
      status: "CREATING",
      workspaceId: "ws-1",
    };

    const baseDeployDto = {
      templateId: "builtin-whatsapp-personal",
      botName: "test-bot",
      deploymentTarget: { type: "docker" as const },
    };

    beforeEach(() => {
      mockWorkspaceRepo.findFirstWorkspace.mockResolvedValue(mockWorkspace);
      mockFleetRepo.findFirst.mockResolvedValue(mockFleet);
      mockBotInstanceRepo.findFirst.mockResolvedValue(null); // no duplicate
      mockBotInstanceRepo.findMany.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10000,
        totalPages: 0,
      }); // no existing ports
      mockPrisma.deploymentTarget.create.mockResolvedValue(
        mockDeploymentTarget,
      );
      mockBotInstanceRepo.create.mockResolvedValue(mockBotInstance);
      mockReconciler.reconcile.mockResolvedValue({ success: true });
    });

    it("should throw BadRequestException for an invalid template", async () => {
      await expect(
        service.deploy(
          { ...baseDeployDto, templateId: "non-existent" },
          "user-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should create workspace if none exists", async () => {
      mockWorkspaceRepo.findFirstWorkspace.mockResolvedValue(null);
      mockWorkspaceRepo.createWorkspace.mockResolvedValue(mockWorkspace);

      await service.deploy(baseDeployDto, "user-1");

      expect(mockWorkspaceRepo.createWorkspace).toHaveBeenCalledWith({
        name: "Default Workspace",
        slug: "default",
      });
    });

    it("should reuse existing workspace", async () => {
      await service.deploy(baseDeployDto, "user-1");

      expect(mockWorkspaceRepo.createWorkspace).not.toHaveBeenCalled();
    });

    it("should create fleet if none exists", async () => {
      mockFleetRepo.findFirst.mockResolvedValue(null);
      mockFleetRepo.create.mockResolvedValue(mockFleet);

      await service.deploy(baseDeployDto, "user-1");

      expect(mockFleetRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: { connect: { id: mockWorkspace.id } },
          name: "Default Fleet",
          status: "ACTIVE",
        }),
      );
    });

    it("should create a deployment target record", async () => {
      await service.deploy(baseDeployDto, "user-1");

      expect(mockPrisma.deploymentTarget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "test-bot-target",
            type: "DOCKER",
          }),
        }),
      );
    });

    it("should create an ECS_EC2 deployment target when type is ecs-ec2", async () => {
      const ecsDto = {
        ...baseDeployDto,
        deploymentTarget: {
          type: "ecs-ec2" as const,
          credentials: {
            region: "us-east-1",
            accessKeyId: "AKIA...",
            secretAccessKey: "secret",
          },
        },
      };

      await service.deploy(ecsDto, "user-1");

      expect(mockPrisma.deploymentTarget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "ECS_EC2",
          }),
        }),
      );
    });

    it("should create an AZURE_VM deployment target when type is azure-vm", async () => {
      const azureDto = {
        ...baseDeployDto,
        deploymentTarget: {
          type: "azure-vm" as const,
          credentials: {
            subscriptionId: "sub-123",
            resourceGroup: "my-rg",
            region: "eastus",
            clientId: "client-id",
            clientSecret: "client-secret",
            tenantId: "tenant-id",
          },
        },
      };

      await service.deploy(azureDto, "user-1");

      expect(mockPrisma.deploymentTarget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "AZURE_VM",
          }),
        }),
      );
    });

    it("should create a GCE deployment target when type is gce", async () => {
      const gceDto = {
        ...baseDeployDto,
        deploymentTarget: {
          type: "gce" as const,
          credentials: {
            projectId: "my-project",
            zone: "us-central1-a",
          },
        },
      };

      await service.deploy(gceDto, "user-1");

      expect(mockPrisma.deploymentTarget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "GCE",
          }),
        }),
      );
    });

    it("should use fixed port 18789 for cloud VM types", async () => {
      const azureDto = {
        ...baseDeployDto,
        deploymentTarget: {
          type: "azure-vm" as const,
          credentials: { subscriptionId: "sub-1", resourceGroup: "rg-1" },
        },
      };

      await service.deploy(azureDto, "user-1");

      expect(mockBotInstanceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ gatewayPort: 18789 }),
      );
    });

    it("should resolve saved credentials via savedCredentialId", async () => {
      mockCredentialVault.resolve.mockResolvedValue({
        subscriptionId: "sub-from-vault",
        resourceGroup: "rg-from-vault",
        region: "eastus",
      });

      await service.deploy({
        ...baseDeployDto,
        deploymentTarget: { type: "azure-vm" },
        savedCredentialId: "saved-cred-1",
      }, "user-1");

      expect(mockCredentialVault.resolve).toHaveBeenCalledWith("saved-cred-1", mockWorkspace.id);
    });

    it("should create a bot instance record", async () => {
      await service.deploy(baseDeployDto, "user-1");

      expect(mockBotInstanceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: { connect: { id: mockWorkspace.id } },
          fleet: { connect: { id: mockFleet.id } },
          name: "test-bot",
          status: "CREATING",
          health: "UNKNOWN",
          deploymentTarget: { connect: { id: mockDeploymentTarget.id } },
          templateId: "builtin-whatsapp-personal",
          createdBy: "user-1",
        }),
      );
    });

    it("should trigger reconciliation after creating the bot instance", async () => {
      await service.deploy(baseDeployDto, "user-1");

      // Wait for the async reconcile to be called
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockReconciler.reconcile).toHaveBeenCalledWith(mockBotInstance.id);
    });

    it("should return instanceId, fleetId, and status", async () => {
      const result = await service.deploy(baseDeployDto, "user-1");

      expect(result).toEqual({
        instanceId: mockBotInstance.id,
        fleetId: mockFleet.id,
        status: "deploying",
      });
    });

    it("should create channel records when channels are provided", async () => {
      const dto = {
        ...baseDeployDto,
        channels: [
          { type: "telegram", config: { botToken: "tok-123" } },
          { type: "discord", config: { token: "disc-123" } },
        ],
      };

      await service.deploy(dto, "user-1");

      expect(mockChannelRepo.upsertChannel).toHaveBeenCalledTimes(2);
      expect(mockChannelRepo.upsertChannel).toHaveBeenCalledWith(
        mockWorkspace.id,
        "test-bot-telegram",
        expect.objectContaining({
          type: "TELEGRAM",
          createdBy: "user-1",
        }),
      );
      expect(mockChannelRepo.upsertChannel).toHaveBeenCalledWith(
        mockWorkspace.id,
        "test-bot-discord",
        expect.objectContaining({
          type: "DISCORD",
          createdBy: "user-1",
        }),
      );
    });

    it("should default environment to dev", async () => {
      await service.deploy(baseDeployDto, "user-1");

      expect(mockBotInstanceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          desiredManifest: expect.stringContaining('"environment":"dev"'),
        }),
      );
    });

    it("should use provided environment", async () => {
      mockFleetRepo.findFirst.mockResolvedValue(null);
      mockFleetRepo.create.mockResolvedValue(mockFleet);

      await service.deploy(
        { ...baseDeployDto, environment: "staging" },
        "user-1",
      );

      expect(mockFleetRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "staging",
        }),
      );
    });

    it("should not fail if reconcile rejects (fire-and-forget)", async () => {
      mockReconciler.reconcile.mockRejectedValue(new Error("reconcile boom"));

      // deploy itself should not throw even though reconcile fails
      const result = await service.deploy(baseDeployDto, "user-1");
      expect(result).toHaveProperty("instanceId");
    });
  });

  // ===========================================================================
  // getDeployStatus
  // ===========================================================================
  describe("getDeployStatus", () => {
    it("should throw BadRequestException if instance not found", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue(null);

      await expect(service.getDeployStatus("non-existent")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should return steps with correct status when instance is CREATING", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "CREATING",
        health: "UNKNOWN",
        lastError: null,
        configHash: null,
        gatewayConnection: null,
        updatedAt: new Date(),
      });

      const result = await service.getDeployStatus("bot-1");

      expect(result.instanceId).toBe("bot-1");
      expect(result.status).toBe("CREATING");
      expect(result.health).toBe("UNKNOWN");
      expect(result.steps).toHaveLength(5);

      const stepMap = Object.fromEntries(
        result.steps.map((s: any) => [s.name, s.status]),
      );
      expect(stepMap["Creating infrastructure"]).toBe("in_progress");
      expect(stepMap["Installing OpenClaw"]).toBe("pending");
      expect(stepMap["Applying configuration"]).toBe("pending");
      expect(stepMap["Starting gateway"]).toBe("pending");
      expect(stepMap["Running health check"]).toBe("pending");
    });

    it("should return steps with correct status when instance is RECONCILING", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "RECONCILING",
        health: "UNKNOWN",
        lastError: null,
        configHash: null,
        gatewayConnection: null,
        updatedAt: new Date(),
      });

      const result = await service.getDeployStatus("bot-1");

      const stepMap = Object.fromEntries(
        result.steps.map((s: any) => [s.name, s.status]),
      );
      expect(stepMap["Creating infrastructure"]).toBe("completed");
      expect(stepMap["Installing OpenClaw"]).toBe("in_progress");
      // When RECONCILING with no configHash, "Applying configuration" is pending
      // (the first branch of the ternary matches: status in [CREATING, RECONCILING] && !configHash)
      expect(stepMap["Applying configuration"]).toBe("pending");
      expect(stepMap["Starting gateway"]).toBe("in_progress");
      expect(stepMap["Running health check"]).toBe("pending");
    });

    it("should mark applying configuration as completed when configHash is set", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "RUNNING",
        health: "UNKNOWN",
        lastError: null,
        configHash: "abc123",
        gatewayConnection: null,
        updatedAt: new Date(),
      });

      const result = await service.getDeployStatus("bot-1");

      const stepMap = Object.fromEntries(
        result.steps.map((s: any) => [s.name, s.status]),
      );
      expect(stepMap["Applying configuration"]).toBe("completed");
    });

    it("should mark starting gateway as completed when gatewayConnection exists", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "RUNNING",
        health: "UNKNOWN",
        lastError: null,
        configHash: "abc123",
        gatewayConnection: { id: "gw-1" },
        updatedAt: new Date(),
      });

      const result = await service.getDeployStatus("bot-1");

      const stepMap = Object.fromEntries(
        result.steps.map((s: any) => [s.name, s.status]),
      );
      expect(stepMap["Starting gateway"]).toBe("completed");
    });

    it("should mark health check as completed when health is HEALTHY", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "RUNNING",
        health: "HEALTHY",
        lastError: null,
        configHash: "abc123",
        gatewayConnection: { id: "gw-1" },
        updatedAt: new Date(),
      });

      const result = await service.getDeployStatus("bot-1");

      const stepMap = Object.fromEntries(
        result.steps.map((s: any) => [s.name, s.status]),
      );
      expect(stepMap["Running health check"]).toBe("completed");
    });

    it("should mark health check as completed when health is DEGRADED", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "RUNNING",
        health: "DEGRADED",
        lastError: null,
        configHash: "abc123",
        gatewayConnection: { id: "gw-1" },
        updatedAt: new Date(),
      });

      const result = await service.getDeployStatus("bot-1");

      const stepMap = Object.fromEntries(
        result.steps.map((s: any) => [s.name, s.status]),
      );
      expect(stepMap["Running health check"]).toBe("completed");
    });

    it("should mark health check as in_progress when status is RUNNING but health is UNKNOWN", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "RUNNING",
        health: "UNKNOWN",
        lastError: null,
        configHash: "abc123",
        gatewayConnection: { id: "gw-1" },
        updatedAt: new Date(),
      });

      const result = await service.getDeployStatus("bot-1");

      const stepMap = Object.fromEntries(
        result.steps.map((s: any) => [s.name, s.status]),
      );
      expect(stepMap["Running health check"]).toBe("in_progress");
    });

    it("should include error in the response", async () => {
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "ERROR",
        health: "UNHEALTHY",
        lastError: "Container failed to start",
        configHash: null,
        gatewayConnection: null,
        updatedAt: new Date(),
      });

      const result = await service.getDeployStatus("bot-1");

      expect(result.error).toBe("Container failed to start");
    });

    it("should detect stale CREATING instance as ERROR after 15 minutes", async () => {
      const staleDate = new Date(Date.now() - 16 * 60 * 1000); // 16 minutes ago
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "CREATING",
        health: "UNKNOWN",
        lastError: null,
        configHash: null,
        gatewayConnection: null,
        updatedAt: staleDate,
      });

      const result = await service.getDeployStatus("bot-1");

      expect(result.status).toBe("ERROR");
      expect(result.error).toBe("Deployment timed out. Check API logs.");
    });

    it("should detect stale RECONCILING instance as ERROR after 15 minutes", async () => {
      const staleDate = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "RECONCILING",
        health: "UNKNOWN",
        lastError: null,
        configHash: null,
        gatewayConnection: null,
        updatedAt: staleDate,
      });

      const result = await service.getDeployStatus("bot-1");

      expect(result.status).toBe("ERROR");
      expect(result.error).toBe("Deployment timed out. Check API logs.");
    });

    it("should NOT detect as stale if CREATING for less than 15 minutes", async () => {
      const recentDate = new Date(Date.now() - 1 * 60 * 1000); // 1 minute ago
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "CREATING",
        health: "UNKNOWN",
        lastError: null,
        configHash: null,
        gatewayConnection: null,
        updatedAt: recentDate,
      });

      const result = await service.getDeployStatus("bot-1");

      expect(result.status).toBe("CREATING");
      expect(result.error).toBeNull();
    });

    it("should NOT detect RUNNING instance as stale regardless of age", async () => {
      const staleDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      mockBotInstanceRepo.findById.mockResolvedValue({
        id: "bot-1",
        status: "RUNNING",
        health: "HEALTHY",
        lastError: null,
        configHash: "abc123",
        gatewayConnection: { id: "gw-1" },
        updatedAt: staleDate,
      });

      const result = await service.getDeployStatus("bot-1");

      expect(result.status).toBe("RUNNING");
    });
  });

  // ===========================================================================
  // Port allocation (via deploy)
  // ===========================================================================
  describe("port allocation", () => {
    const mockWorkspace = {
      id: "ws-1",
      name: "Default Workspace",
      slug: "default",
    };
    const mockFleet = {
      id: "fleet-1",
      name: "Default Fleet",
      workspaceId: "ws-1",
    };
    const mockDeploymentTarget = { id: "dt-1" };

    const baseDeployDto = {
      templateId: "builtin-whatsapp-personal",
      botName: "port-test-bot",
      deploymentTarget: { type: "docker" as const },
    };

    beforeEach(() => {
      mockWorkspaceRepo.findFirstWorkspace.mockResolvedValue(mockWorkspace);
      mockFleetRepo.findFirst.mockResolvedValue(mockFleet);
      mockBotInstanceRepo.findFirst.mockResolvedValue(null);
      mockPrisma.deploymentTarget.create.mockResolvedValue(
        mockDeploymentTarget,
      );
      mockBotInstanceRepo.create.mockResolvedValue({
        id: "bot-port",
        name: "port-test-bot",
        status: "CREATING",
        workspaceId: "ws-1",
      });
      mockReconciler.reconcile.mockResolvedValue({ success: true });
    });

    it("should allocate base port 18789 when no instances exist", async () => {
      mockBotInstanceRepo.findMany.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10000,
        totalPages: 0,
      });

      await service.deploy(baseDeployDto, "user-1");

      expect(mockBotInstanceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayPort: 18789,
        }),
      );
    });

    it("should allocate port 18809 when 18789 is already used", async () => {
      mockBotInstanceRepo.findMany.mockResolvedValue({
        data: [{ gatewayPort: 18789 }],
        total: 1,
        page: 1,
        limit: 10000,
        totalPages: 1,
      });

      await service.deploy(baseDeployDto, "user-1");

      expect(mockBotInstanceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayPort: 18809,
        }),
      );
    });

    it("should fill gaps in port allocation", async () => {
      mockBotInstanceRepo.findMany.mockResolvedValue({
        data: [
          { gatewayPort: 18789 },
          { gatewayPort: 18849 }, // gap at 18809 and 18829
        ],
        total: 2,
        page: 1,
        limit: 10000,
        totalPages: 1,
      });

      await service.deploy(baseDeployDto, "user-1");

      expect(mockBotInstanceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayPort: 18809,
        }),
      );
    });
  });
});
