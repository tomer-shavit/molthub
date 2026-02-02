/**
 * Unit Tests - Onboarding Service
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

// Mock the reconciler and config-generator modules BEFORE they are imported
// to avoid pulling in the AWS SDK dependency chain.
jest.mock('../reconciler/reconciler.service', () => ({
  ReconcilerService: jest.fn().mockImplementation(() => ({
    reconcile: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../reconciler/config-generator.service', () => ({
  ConfigGeneratorService: jest.fn().mockImplementation(() => ({})),
}));

import { OnboardingService } from './onboarding.service';
import { ReconcilerService } from '../reconciler/reconciler.service';
import { ConfigGeneratorService } from '../reconciler/config-generator.service';

// Mock the database module
jest.mock('@clawster/database', () => ({
  prisma: {
    botInstance: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    workspace: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    fleet: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    deploymentTarget: {
      create: jest.fn(),
    },
    communicationChannel: {
      create: jest.fn(),
    },
  },
  BotStatus: {
    CREATING: 'CREATING',
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    DEGRADED: 'DEGRADED',
    STOPPED: 'STOPPED',
    PAUSED: 'PAUSED',
    DELETING: 'DELETING',
    ERROR: 'ERROR',
    RECONCILING: 'RECONCILING',
  },
  BotHealth: {
    HEALTHY: 'HEALTHY',
    UNHEALTHY: 'UNHEALTHY',
    UNKNOWN: 'UNKNOWN',
    DEGRADED: 'DEGRADED',
  },
}));

// Mock only randomBytes for deterministic tests, keeping the rest of crypto intact
jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    randomBytes: jest.fn().mockReturnValue({
      toString: jest.fn().mockReturnValue('mock-gateway-auth-token-hex'),
    }),
  };
});

import { prisma } from '@clawster/database';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let reconcilerService: ReconcilerService;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  const mockReconciler = {
    reconcile: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigGenerator = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: ReconcilerService, useValue: mockReconciler },
        { provide: ConfigGeneratorService, useValue: mockConfigGenerator },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    reconcilerService = module.get<ReconcilerService>(ReconcilerService);
    jest.clearAllMocks();
  });

  // ===========================================================================
  // checkFirstRun
  // ===========================================================================
  describe('checkFirstRun', () => {
    it('should return hasInstances: false when no bot instances exist', async () => {
      (mockPrisma.botInstance.count as jest.Mock).mockResolvedValue(0);

      const result = await service.checkFirstRun();

      expect(result).toEqual({ hasInstances: false });
      expect(mockPrisma.botInstance.count).toHaveBeenCalledTimes(1);
    });

    it('should return hasInstances: true when bot instances exist', async () => {
      (mockPrisma.botInstance.count as jest.Mock).mockResolvedValue(3);

      const result = await service.checkFirstRun();

      expect(result).toEqual({ hasInstances: true });
    });

    it('should return hasInstances: true when exactly one bot instance exists', async () => {
      (mockPrisma.botInstance.count as jest.Mock).mockResolvedValue(1);

      const result = await service.checkFirstRun();

      expect(result).toEqual({ hasInstances: true });
    });
  });

  // ===========================================================================
  // getTemplates
  // ===========================================================================
  describe('getTemplates', () => {
    it('should return a list of templates', () => {
      const templates = service.getTemplates();

      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should return templates with expected shape', () => {
      const templates = service.getTemplates();

      for (const t of templates) {
        expect(t).toHaveProperty('id');
        expect(t).toHaveProperty('name');
        expect(t).toHaveProperty('description');
        expect(t).toHaveProperty('category');
        expect(t).toHaveProperty('channels');
        expect(t).toHaveProperty('requiredInputs');
      }
    });

    it('should filter out gatewayAuth from requiredInputs', () => {
      const templates = service.getTemplates();

      for (const t of templates) {
        for (const input of t.requiredInputs) {
          expect(input.key).not.toContain('gatewayAuth');
        }
      }
    });

    it('should include known template IDs', () => {
      const templates = service.getTemplates();
      const ids = templates.map((t) => t.id);

      expect(ids).toContain('builtin-whatsapp-personal');
      expect(ids).toContain('builtin-telegram-bot');
      expect(ids).toContain('builtin-whatsapp-personal');
    });
  });

  // ===========================================================================
  // preview
  // ===========================================================================
  describe('preview', () => {
    it('should return generated config for a valid template', async () => {
      const result = await service.preview({
        templateId: 'builtin-whatsapp-personal',
      });

      expect(result).toHaveProperty('config');
      expect(result.config).toHaveProperty('gateway');
      expect(result.config).toHaveProperty('channels');
    });

    it('should throw BadRequestException for an invalid template', async () => {
      await expect(
        service.preview({ templateId: 'non-existent-template' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should apply channel configs to the preview', async () => {
      const result = await service.preview({
        templateId: 'builtin-whatsapp-personal',
        channels: [
          {
            type: 'whatsapp',
            config: { sendReadReceipts: false },
          },
        ],
      });

      const channels = result.config.channels as Record<string, any>;
      expect(channels.whatsapp).toBeDefined();
      expect(channels.whatsapp.enabled).toBe(true);
      expect(channels.whatsapp.sendReadReceipts).toBe(false);
    });

    it('should apply configOverrides to the preview', async () => {
      const result = await service.preview({
        templateId: 'builtin-whatsapp-personal',
        configOverrides: { customKey: 'customValue' },
      });

      expect(result.config).toHaveProperty('customKey', 'customValue');
    });

    it('should apply both channels and configOverrides', async () => {
      const result = await service.preview({
        templateId: 'builtin-whatsapp-personal',
        channels: [
          { type: 'whatsapp', config: { mediaMaxMb: 10 } },
        ],
        configOverrides: { extraField: true },
      });

      const channels = result.config.channels as Record<string, any>;
      expect(channels.whatsapp.mediaMaxMb).toBe(10);
      expect(result.config).toHaveProperty('extraField', true);
    });
  });

  // ===========================================================================
  // deploy
  // ===========================================================================
  describe('deploy', () => {
    const mockWorkspace = { id: 'ws-1', name: 'Default Workspace', slug: 'default' };
    const mockFleet = { id: 'fleet-1', name: 'Default Fleet' };
    const mockDeploymentTarget = { id: 'dt-1' };
    const mockBotInstance = {
      id: 'bot-1',
      name: 'test-bot',
      status: 'CREATING',
    };

    const baseDeployDto = {
      templateId: 'builtin-whatsapp-personal',
      botName: 'test-bot',
      deploymentTarget: { type: 'docker' as const },
    };

    beforeEach(() => {
      (mockPrisma.workspace.findFirst as jest.Mock).mockResolvedValue(mockWorkspace);
      (mockPrisma.fleet.findFirst as jest.Mock).mockResolvedValue(mockFleet);
      (mockPrisma.botInstance.findFirst as jest.Mock).mockResolvedValue(null); // no duplicate
      (mockPrisma.botInstance.findMany as jest.Mock).mockResolvedValue([]); // no existing ports
      (mockPrisma.deploymentTarget.create as jest.Mock).mockResolvedValue(mockDeploymentTarget);
      (mockPrisma.botInstance.create as jest.Mock).mockResolvedValue(mockBotInstance);
      mockReconciler.reconcile.mockResolvedValue(undefined);
    });

    it('should throw BadRequestException for an invalid template', async () => {
      await expect(
        service.deploy({ ...baseDeployDto, templateId: 'non-existent' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create workspace if none exists', async () => {
      (mockPrisma.workspace.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.workspace.create as jest.Mock).mockResolvedValue(mockWorkspace);

      await service.deploy(baseDeployDto, 'user-1');

      expect(mockPrisma.workspace.create).toHaveBeenCalledWith({
        data: { name: 'Default Workspace', slug: 'default' },
      });
    });

    it('should reuse existing workspace', async () => {
      await service.deploy(baseDeployDto, 'user-1');

      expect(mockPrisma.workspace.create).not.toHaveBeenCalled();
    });

    it('should create fleet if none exists', async () => {
      (mockPrisma.fleet.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.fleet.create as jest.Mock).mockResolvedValue(mockFleet);

      await service.deploy(baseDeployDto, 'user-1');

      expect(mockPrisma.fleet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: mockWorkspace.id,
            name: 'Default Fleet',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('should create a deployment target record', async () => {
      await service.deploy(baseDeployDto, 'user-1');

      expect(mockPrisma.deploymentTarget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'test-bot-target',
            type: 'DOCKER',
          }),
        }),
      );
    });

    it('should create an ECS_FARGATE deployment target when type is ecs-fargate', async () => {
      const ecsDto = {
        ...baseDeployDto,
        deploymentTarget: {
          type: 'ecs-fargate' as const,
          region: 'us-east-1',
          accessKeyId: 'AKIA...',
          secretAccessKey: 'secret',
          subnetIds: ['subnet-1'],
          securityGroupId: 'sg-1',
          executionRoleArn: 'arn:aws:iam::role/exec',
        },
      };

      await service.deploy(ecsDto, 'user-1');

      expect(mockPrisma.deploymentTarget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'ECS_FARGATE',
          }),
        }),
      );
    });

    it('should create a bot instance record', async () => {
      await service.deploy(baseDeployDto, 'user-1');

      expect(mockPrisma.botInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: mockWorkspace.id,
            fleetId: mockFleet.id,
            name: 'test-bot',
            status: 'CREATING',
            health: 'UNKNOWN',
            deploymentTargetId: mockDeploymentTarget.id,
            templateId: 'builtin-whatsapp-personal',
            createdBy: 'user-1',
          }),
        }),
      );
    });

    it('should trigger reconciliation after creating the bot instance', async () => {
      await service.deploy(baseDeployDto, 'user-1');

      expect(mockReconciler.reconcile).toHaveBeenCalledWith(mockBotInstance.id);
    });

    it('should return instanceId, fleetId, and status', async () => {
      const result = await service.deploy(baseDeployDto, 'user-1');

      expect(result).toEqual({
        instanceId: mockBotInstance.id,
        fleetId: mockFleet.id,
        status: 'deploying',
      });
    });

    it('should create channel records when channels are provided', async () => {
      const dto = {
        ...baseDeployDto,
        channels: [
          { type: 'telegram', config: { botToken: 'tok-123' } },
          { type: 'discord', config: { token: 'disc-123' } },
        ],
      };

      await service.deploy(dto, 'user-1');

      expect(mockPrisma.communicationChannel.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.communicationChannel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'test-bot-telegram',
            type: 'TELEGRAM',
            createdBy: 'user-1',
          }),
        }),
      );
      expect(mockPrisma.communicationChannel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'test-bot-discord',
            type: 'DISCORD',
            createdBy: 'user-1',
          }),
        }),
      );
    });

    it('should default environment to dev', async () => {
      await service.deploy(baseDeployDto, 'user-1');

      expect(mockPrisma.botInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            desiredManifest: expect.objectContaining({
              metadata: expect.objectContaining({ environment: 'dev' }),
            }),
          }),
        }),
      );
    });

    it('should use provided environment', async () => {
      (mockPrisma.fleet.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.fleet.create as jest.Mock).mockResolvedValue(mockFleet);

      await service.deploy({ ...baseDeployDto, environment: 'staging' }, 'user-1');

      expect(mockPrisma.fleet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            environment: 'STAGING',
          }),
        }),
      );
    });

    it('should not fail if reconcile rejects (fire-and-forget)', async () => {
      mockReconciler.reconcile.mockRejectedValue(new Error('reconcile boom'));

      // deploy itself should not throw even though reconcile fails
      const result = await service.deploy(baseDeployDto, 'user-1');
      expect(result).toHaveProperty('instanceId');
    });
  });

  // ===========================================================================
  // getDeployStatus
  // ===========================================================================
  describe('getDeployStatus', () => {
    it('should throw BadRequestException if instance not found', async () => {
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getDeployStatus('non-existent')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return steps with correct status when instance is CREATING', async () => {
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'CREATING',
        health: 'UNKNOWN',
        lastError: null,
        configHash: null,
        gatewayConnection: null,
      });

      const result = await service.getDeployStatus('bot-1');

      expect(result.instanceId).toBe('bot-1');
      expect(result.status).toBe('CREATING');
      expect(result.health).toBe('UNKNOWN');
      expect(result.steps).toHaveLength(5);

      const stepMap = Object.fromEntries(result.steps.map((s: any) => [s.name, s.status]));
      expect(stepMap['Creating infrastructure']).toBe('in_progress');
      expect(stepMap['Installing OpenClaw']).toBe('pending');
      expect(stepMap['Applying configuration']).toBe('pending');
      expect(stepMap['Starting gateway']).toBe('pending');
      expect(stepMap['Running health check']).toBe('pending');
    });

    it('should return steps with correct status when instance is RECONCILING', async () => {
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'RECONCILING',
        health: 'UNKNOWN',
        lastError: null,
        configHash: null,
        gatewayConnection: null,
      });

      const result = await service.getDeployStatus('bot-1');

      const stepMap = Object.fromEntries(result.steps.map((s: any) => [s.name, s.status]));
      expect(stepMap['Creating infrastructure']).toBe('completed');
      expect(stepMap['Installing OpenClaw']).toBe('in_progress');
      // When RECONCILING with no configHash, "Applying configuration" is pending
      // (the first branch of the ternary matches: status in [CREATING, RECONCILING] && !configHash)
      expect(stepMap['Applying configuration']).toBe('pending');
      expect(stepMap['Starting gateway']).toBe('in_progress');
      expect(stepMap['Running health check']).toBe('pending');
    });

    it('should mark applying configuration as completed when configHash is set', async () => {
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'RUNNING',
        health: 'UNKNOWN',
        lastError: null,
        configHash: 'abc123',
        gatewayConnection: null,
      });

      const result = await service.getDeployStatus('bot-1');

      const stepMap = Object.fromEntries(result.steps.map((s: any) => [s.name, s.status]));
      expect(stepMap['Applying configuration']).toBe('completed');
    });

    it('should mark starting gateway as completed when gatewayConnection exists', async () => {
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'RUNNING',
        health: 'UNKNOWN',
        lastError: null,
        configHash: 'abc123',
        gatewayConnection: { id: 'gw-1' },
      });

      const result = await service.getDeployStatus('bot-1');

      const stepMap = Object.fromEntries(result.steps.map((s: any) => [s.name, s.status]));
      expect(stepMap['Starting gateway']).toBe('completed');
    });

    it('should mark health check as completed when health is HEALTHY', async () => {
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'RUNNING',
        health: 'HEALTHY',
        lastError: null,
        configHash: 'abc123',
        gatewayConnection: { id: 'gw-1' },
      });

      const result = await service.getDeployStatus('bot-1');

      const stepMap = Object.fromEntries(result.steps.map((s: any) => [s.name, s.status]));
      expect(stepMap['Running health check']).toBe('completed');
    });

    it('should mark health check as completed when health is DEGRADED', async () => {
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'RUNNING',
        health: 'DEGRADED',
        lastError: null,
        configHash: 'abc123',
        gatewayConnection: { id: 'gw-1' },
      });

      const result = await service.getDeployStatus('bot-1');

      const stepMap = Object.fromEntries(result.steps.map((s: any) => [s.name, s.status]));
      expect(stepMap['Running health check']).toBe('completed');
    });

    it('should mark health check as in_progress when status is RUNNING but health is UNKNOWN', async () => {
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'RUNNING',
        health: 'UNKNOWN',
        lastError: null,
        configHash: 'abc123',
        gatewayConnection: { id: 'gw-1' },
      });

      const result = await service.getDeployStatus('bot-1');

      const stepMap = Object.fromEntries(result.steps.map((s: any) => [s.name, s.status]));
      expect(stepMap['Running health check']).toBe('in_progress');
    });

    it('should include error in the response', async () => {
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'ERROR',
        health: 'UNHEALTHY',
        lastError: 'Container failed to start',
        configHash: null,
        gatewayConnection: null,
        updatedAt: new Date(),
      });

      const result = await service.getDeployStatus('bot-1');

      expect(result.error).toBe('Container failed to start');
    });

    it('should detect stale CREATING instance as ERROR after 3 minutes', async () => {
      const staleDate = new Date(Date.now() - 4 * 60 * 1000); // 4 minutes ago
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'CREATING',
        health: 'UNKNOWN',
        lastError: null,
        configHash: null,
        gatewayConnection: null,
        updatedAt: staleDate,
      });

      const result = await service.getDeployStatus('bot-1');

      expect(result.status).toBe('ERROR');
      expect(result.error).toBe('Deployment timed out. Check API logs.');
    });

    it('should detect stale RECONCILING instance as ERROR after 3 minutes', async () => {
      const staleDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'RECONCILING',
        health: 'UNKNOWN',
        lastError: null,
        configHash: null,
        gatewayConnection: null,
        updatedAt: staleDate,
      });

      const result = await service.getDeployStatus('bot-1');

      expect(result.status).toBe('ERROR');
      expect(result.error).toBe('Deployment timed out. Check API logs.');
    });

    it('should NOT detect as stale if CREATING for less than 3 minutes', async () => {
      const recentDate = new Date(Date.now() - 1 * 60 * 1000); // 1 minute ago
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'CREATING',
        health: 'UNKNOWN',
        lastError: null,
        configHash: null,
        gatewayConnection: null,
        updatedAt: recentDate,
      });

      const result = await service.getDeployStatus('bot-1');

      expect(result.status).toBe('CREATING');
      expect(result.error).toBeNull();
    });

    it('should NOT detect RUNNING instance as stale regardless of age', async () => {
      const staleDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      (mockPrisma.botInstance.findUnique as jest.Mock).mockResolvedValue({
        id: 'bot-1',
        status: 'RUNNING',
        health: 'HEALTHY',
        lastError: null,
        configHash: 'abc123',
        gatewayConnection: { id: 'gw-1' },
        updatedAt: staleDate,
      });

      const result = await service.getDeployStatus('bot-1');

      expect(result.status).toBe('RUNNING');
    });
  });

  // ===========================================================================
  // Port allocation (via deploy)
  // ===========================================================================
  describe('port allocation', () => {
    const mockWorkspace = { id: 'ws-1', name: 'Default Workspace', slug: 'default' };
    const mockFleet = { id: 'fleet-1', name: 'Default Fleet' };
    const mockDeploymentTarget = { id: 'dt-1' };

    const baseDeployDto = {
      templateId: 'builtin-whatsapp-personal',
      botName: 'port-test-bot',
      deploymentTarget: { type: 'docker' as const },
    };

    beforeEach(() => {
      (mockPrisma.workspace.findFirst as jest.Mock).mockResolvedValue(mockWorkspace);
      (mockPrisma.fleet.findFirst as jest.Mock).mockResolvedValue(mockFleet);
      (mockPrisma.botInstance.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.deploymentTarget.create as jest.Mock).mockResolvedValue(mockDeploymentTarget);
      (mockPrisma.botInstance.create as jest.Mock).mockResolvedValue({
        id: 'bot-port',
        name: 'port-test-bot',
        status: 'CREATING',
      });
      mockReconciler.reconcile.mockResolvedValue(undefined);
    });

    it('should allocate base port 18789 when no instances exist', async () => {
      (mockPrisma.botInstance.findMany as jest.Mock).mockResolvedValue([]);

      await service.deploy(baseDeployDto, 'user-1');

      expect(mockPrisma.botInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gatewayPort: 18789,
          }),
        }),
      );
    });

    it('should allocate port 18809 when 18789 is already used', async () => {
      (mockPrisma.botInstance.findMany as jest.Mock).mockResolvedValue([
        { gatewayPort: 18789 },
      ]);

      await service.deploy(baseDeployDto, 'user-1');

      expect(mockPrisma.botInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gatewayPort: 18809,
          }),
        }),
      );
    });

    it('should fill gaps in port allocation', async () => {
      (mockPrisma.botInstance.findMany as jest.Mock).mockResolvedValue([
        { gatewayPort: 18789 },
        { gatewayPort: 18849 }, // gap at 18809 and 18829
      ]);

      await service.deploy(baseDeployDto, 'user-1');

      expect(mockPrisma.botInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gatewayPort: 18809,
          }),
        }),
      );
    });
  });
});
