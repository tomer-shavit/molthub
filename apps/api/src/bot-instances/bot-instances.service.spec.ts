/**
 * Unit Tests - Bot Instances Service
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BotInstancesService } from './bot-instances.service';

// Mock the database and core modules
jest.mock('@clawster/database', () => ({
  prisma: {
    botInstance: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    fleet: {
      findUnique: jest.fn(),
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

jest.mock('@clawster/core', () => ({
  PolicyEngine: jest.fn().mockImplementation(() => ({
    validate: jest.fn().mockReturnValue({ valid: true, violations: [] }),
  })),
}));

import { prisma } from '@clawster/database';

describe('BotInstancesService', () => {
  let service: BotInstancesService;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  const validManifest = {
    apiVersion: 'clawster/v1',
    kind: 'OpenClawInstance',
    metadata: {
      name: 'test-bot',
      workspace: 'default',
      environment: 'dev',
      labels: {},
    },
    spec: {
      runtime: {
        image: 'openclaw:v0.1.0',
        cpu: 0.5,
        memory: 1024,
      },
      secrets: [],
      channels: [],
      skills: { mode: 'ALLOWLIST', allowlist: ['echo'] },
      network: { inbound: 'NONE', egressPreset: 'RESTRICTED' },
      observability: { logLevel: 'info', tracing: false },
      policies: { forbidPublicAdmin: true, requireSecretManager: true },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BotInstancesService],
    }).compile();

    service = module.get<BotInstancesService>(BotInstancesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto = {
      workspaceId: 'workspace-123',
      fleetId: 'fleet-123',
      name: 'test-instance',
      desiredManifest: validManifest,
      tags: {},
      createdBy: 'user-123',
    };

    it('should create a bot instance successfully', async () => {
      mockPrisma.botInstance.findFirst.mockResolvedValue(null);
      mockPrisma.fleet.findUnique.mockResolvedValue({ id: 'fleet-123' } as any);
      mockPrisma.botInstance.create.mockResolvedValue({
        id: 'bot-123',
        ...createDto,
        status: 'CREATING',
        health: 'UNKNOWN',
        overlayIds: [],
        metadata: {},
      } as any);

      const result = await service.create(createDto);

      expect(result).toHaveProperty('id');
      expect(result.name).toBe('test-instance');
      expect(result.status).toBe('CREATING');
    });

    it('should throw BadRequestException for duplicate name', async () => {
      mockPrisma.botInstance.findFirst.mockResolvedValue({
        id: 'existing-bot',
        name: 'test-instance',
      } as any);

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent fleet', async () => {
      mockPrisma.botInstance.findFirst.mockResolvedValue(null);
      mockPrisma.fleet.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid manifest', async () => {
      const { PolicyEngine } = jest.requireMock('@clawster/core');
      PolicyEngine.mockImplementation(() => ({
        validate: jest.fn().mockReturnValue({
          valid: false,
          violations: [{ severity: 'ERROR', message: 'Invalid CPU' }],
        }),
      }));

      mockPrisma.botInstance.findFirst.mockResolvedValue(null);
      mockPrisma.fleet.findUnique.mockResolvedValue({ id: 'fleet-123' } as any);

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return list of instances', async () => {
      mockPrisma.botInstance.findMany.mockResolvedValue([
        { id: 'bot-1', name: 'Bot 1' },
        { id: 'bot-2', name: 'Bot 2' },
      ] as any);

      const result = await service.findAll({ workspaceId: 'workspace-123' });

      expect(result).toHaveLength(2);
    });

    it('should filter by fleet', async () => {
      mockPrisma.botInstance.findMany.mockResolvedValue([]);

      await service.findAll({ workspaceId: 'workspace-123', fleetId: 'fleet-123' });

      expect(mockPrisma.botInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'workspace-123', fleetId: 'fleet-123' }),
        })
      );
    });

    it('should filter by status', async () => {
      mockPrisma.botInstance.findMany.mockResolvedValue([]);

      await service.findAll({ workspaceId: 'workspace-123', status: 'RUNNING' });

      expect(mockPrisma.botInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'workspace-123', status: 'RUNNING' }),
        })
      );
    });
  });

  describe('findOne', () => {
    it('should return instance by id', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue({
        id: 'bot-123',
        name: 'Test Bot',
        fleet: {},
        connectorBindings: [],
      } as any);

      const result = await service.findOne('bot-123');

      expect(result.id).toBe('bot-123');
    });

    it('should throw NotFoundException for non-existent instance', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update instance successfully', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue({ id: 'bot-123' } as any);
      mockPrisma.botInstance.update.mockResolvedValue({
        id: 'bot-123',
        tags: { team: 'platform' },
      } as any);

      const result = await service.update('bot-123', { tags: { team: 'platform' } });

      expect(result.tags.team).toBe('platform');
    });

    it('should validate manifest on update', async () => {
      const { PolicyEngine } = jest.requireMock('@clawster/core');
      PolicyEngine.mockImplementation(() => ({
        validate: jest.fn().mockReturnValue({
          valid: false,
          violations: [{ severity: 'ERROR', message: 'Invalid image' }],
        }),
      }));

      mockPrisma.botInstance.findUnique.mockResolvedValue({ id: 'bot-123' } as any);

      await expect(
        service.update('bot-123', { desiredManifest: validManifest })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('should update status successfully', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue({ id: 'bot-123' } as any);
      mockPrisma.botInstance.update.mockResolvedValue({
        id: 'bot-123',
        status: 'RUNNING',
      } as any);

      const result = await service.updateStatus('bot-123', 'RUNNING');

      expect(result.status).toBe('RUNNING');
    });

    it('should increment error count on ERROR status', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue({ id: 'bot-123' } as any);
      mockPrisma.botInstance.update.mockResolvedValue({
        id: 'bot-123',
        status: 'ERROR',
        errorCount: 1,
      } as any);

      await service.updateStatus('bot-123', 'ERROR');

      expect(mockPrisma.botInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ERROR',
            errorCount: { increment: 1 },
          }),
        })
      );
    });
  });

  describe('updateHealth', () => {
    it('should update health successfully', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue({ id: 'bot-123' } as any);
      mockPrisma.botInstance.update.mockResolvedValue({
        id: 'bot-123',
        health: 'HEALTHY',
      } as any);

      const result = await service.updateHealth('bot-123', 'HEALTHY');

      expect(result.health).toBe('HEALTHY');
      expect(mockPrisma.botInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            health: 'HEALTHY',
            lastHealthCheckAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('restart', () => {
    it('should restart instance', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue({ id: 'bot-123' } as any);
      mockPrisma.botInstance.update.mockResolvedValue({} as any);

      await service.restart('bot-123');

      expect(mockPrisma.botInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RECONCILING',
            restartCount: { increment: 1 },
            lastReconcileAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('pause', () => {
    it('should pause instance', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue({ id: 'bot-123' } as any);
      mockPrisma.botInstance.update.mockResolvedValue({} as any);

      await service.pause('bot-123');

      expect(mockPrisma.botInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PAUSED' }),
        })
      );
    });
  });

  describe('resume', () => {
    it('should resume instance', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue({ id: 'bot-123' } as any);
      mockPrisma.botInstance.update.mockResolvedValue({} as any);

      await service.resume('bot-123');

      expect(mockPrisma.botInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        })
      );
    });
  });

  describe('stop', () => {
    it('should stop instance', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue({ id: 'bot-123' } as any);
      mockPrisma.botInstance.update.mockResolvedValue({} as any);

      await service.stop('bot-123');

      expect(mockPrisma.botInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'STOPPED' }),
        })
      );
    });
  });

  describe('remove', () => {
    it('should mark instance for deletion', async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue({ id: 'bot-123' } as any);
      mockPrisma.botInstance.update.mockResolvedValue({} as any);

      await service.remove('bot-123');

      expect(mockPrisma.botInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DELETING' }),
        })
      );
    });
  });

  describe('getDashboardData', () => {
    it('should return dashboard data', async () => {
      mockPrisma.botInstance.count.mockResolvedValue(10);
      mockPrisma.botInstance.groupBy
        .mockResolvedValueOnce([
          { status: 'RUNNING', _count: { status: 5 } },
          { status: 'PAUSED', _count: { status: 2 } },
        ] as any)
        .mockResolvedValueOnce([
          { health: 'HEALTHY', _count: { health: 8 } },
          { health: 'UNKNOWN', _count: { health: 2 } },
        ] as any);
      mockPrisma.botInstance.findMany.mockResolvedValue([]);

      const result = await service.getDashboardData('workspace-123');

      expect(result.summary.totalInstances).toBe(10);
      expect(result.summary.statusBreakdown).toHaveProperty('RUNNING', 5);
      expect(result.summary.healthBreakdown).toHaveProperty('HEALTHY', 8);
      expect(result).toHaveProperty('recentInstances');
      expect(result).toHaveProperty('fleetDistribution');
    });
  });
});
