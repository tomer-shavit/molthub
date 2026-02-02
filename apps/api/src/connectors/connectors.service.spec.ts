/**
 * Unit Tests - Connectors Service
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';

jest.mock('@clawster/database', () => ({
  prisma: {
    integrationConnector: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    botConnectorBinding: {
      count: jest.fn(),
    },
  },
  ConnectorStatus: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    ERROR: 'ERROR',
    PENDING: 'PENDING',
  },
}));

import { prisma } from '@clawster/database';

describe('ConnectorsService', () => {
  let service: ConnectorsService;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConnectorsService],
    }).compile();

    service = module.get<ConnectorsService>(ConnectorsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto = {
      workspaceId: 'workspace-123',
      name: 'Test Connector',
      type: 'openai' as const,
      config: {
        type: 'openai',
        apiKey: {
          name: 'openai-key',
          provider: 'aws-secrets-manager' as const,
          arn: 'arn:aws:secretsmanager:us-east-1:123:secret:openai',
        },
        defaultModel: 'gpt-4',
      },
      isShared: true,
      tags: {},
    };

    it('should create a connector successfully', async () => {
      mockPrisma.integrationConnector.create.mockResolvedValue({
        id: 'conn-123',
        ...createDto,
        status: 'PENDING',
        allowedInstanceIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.create(createDto);

      expect(result).toHaveProperty('id');
      expect(result.name).toBe('Test Connector');
      expect(result.status).toBe('PENDING');
    });

    it('should create a non-shared connector', async () => {
      const privateDto = {
        ...createDto,
        isShared: false,
        allowedInstanceIds: ['bot-1', 'bot-2'],
      };

      mockPrisma.integrationConnector.create.mockResolvedValue({
        id: 'conn-123',
        ...privateDto,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.create(privateDto);

      expect(result.isShared).toBe(false);
      expect(result.allowedInstanceIds).toEqual(['bot-1', 'bot-2']);
    });
  });

  describe('findAll', () => {
    it('should return list of connectors', async () => {
      mockPrisma.integrationConnector.findMany.mockResolvedValue([
        { id: 'conn-1', name: 'Connector 1', type: 'openai' },
        { id: 'conn-2', name: 'Connector 2', type: 'slack' },
      ] as any);

      const result = await service.findAll({ workspaceId: 'workspace-123' });

      expect(result).toHaveLength(2);
    });

    it('should filter by type', async () => {
      mockPrisma.integrationConnector.findMany.mockResolvedValue([]);

      await service.findAll({ workspaceId: 'workspace-123', type: 'openai' });

      expect(mockPrisma.integrationConnector.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'workspace-123', type: 'openai' }),
        })
      );
    });

    it('should filter by status', async () => {
      mockPrisma.integrationConnector.findMany.mockResolvedValue([]);

      await service.findAll({ workspaceId: 'workspace-123', status: 'ACTIVE' });

      expect(mockPrisma.integrationConnector.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'workspace-123', status: 'ACTIVE' }),
        })
      );
    });

    it('should filter by isShared', async () => {
      mockPrisma.integrationConnector.findMany.mockResolvedValue([]);

      await service.findAll({ workspaceId: 'workspace-123', isShared: true });

      expect(mockPrisma.integrationConnector.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'workspace-123', isShared: true }),
        })
      );
    });
  });

  describe('findOne', () => {
    it('should return connector by id', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue({
        id: 'conn-123',
        name: 'Test Connector',
        botBindings: [],
      } as any);

      const result = await service.findOne('conn-123');

      expect(result.id).toBe('conn-123');
      expect(result.botBindings).toEqual([]);
    });

    it('should throw NotFoundException for non-existent connector', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update connector successfully', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue({ id: 'conn-123' } as any);
      mockPrisma.integrationConnector.update.mockResolvedValue({
        id: 'conn-123',
        name: 'Updated Connector',
      } as any);

      const result = await service.update('conn-123', { name: 'Updated Connector' });

      expect(result.name).toBe('Updated Connector');
    });

    it('should update config', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue({ id: 'conn-123' } as any);
      mockPrisma.integrationConnector.update.mockResolvedValue({
        id: 'conn-123',
        config: { defaultModel: 'gpt-3.5-turbo' },
      } as any);

      const result = await service.update('conn-123', {
        config: { defaultModel: 'gpt-3.5-turbo' },
      });

      expect(result.config.defaultModel).toBe('gpt-3.5-turbo');
    });

    it('should throw NotFoundException for non-existent connector', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should update status to ACTIVE', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue({ id: 'conn-123' } as any);
      mockPrisma.integrationConnector.update.mockResolvedValue({
        id: 'conn-123',
        status: 'ACTIVE',
        lastTestedAt: new Date(),
        lastTestResult: 'SUCCESS',
      } as any);

      const result = await service.updateStatus('conn-123', 'ACTIVE');

      expect(result.status).toBe('ACTIVE');
      expect(mockPrisma.integrationConnector.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACTIVE',
            lastTestedAt: expect.any(Date),
            lastTestResult: 'SUCCESS',
          }),
        })
      );
    });

    it('should update status to ERROR', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue({ id: 'conn-123' } as any);
      mockPrisma.integrationConnector.update.mockResolvedValue({
        id: 'conn-123',
        status: 'ERROR',
        lastTestedAt: new Date(),
        lastTestResult: 'FAILURE',
        statusMessage: 'Connection failed',
      } as any);

      const result = await service.updateStatus('conn-123', 'ERROR', 'Connection failed');

      expect(result.status).toBe('ERROR');
      expect(result.statusMessage).toBe('Connection failed');
    });
  });

  describe('remove', () => {
    it('should delete connector successfully', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue({ id: 'conn-123' } as any);
      mockPrisma.botConnectorBinding.count.mockResolvedValue(0);
      mockPrisma.integrationConnector.delete.mockResolvedValue({} as any);

      await service.remove('conn-123');

      expect(mockPrisma.integrationConnector.delete).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
      });
    });

    it('should throw BadRequestException for connector with bindings', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue({ id: 'conn-123' } as any);
      mockPrisma.botConnectorBinding.count.mockResolvedValue(3);

      await expect(service.remove('conn-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent connector', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('testConnection', () => {
    it('should test connection successfully', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue({
        id: 'conn-123',
        type: 'openai',
      } as any);
      mockPrisma.integrationConnector.update.mockResolvedValue({} as any);

      const result = await service.testConnection('conn-123', {});

      expect(result.connectorId).toBe('conn-123');
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('responseTimeMs');
      expect(result).toHaveProperty('checks');
    });

    it('should handle connection failure', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue({
        id: 'conn-123',
        type: 'unknown',
      } as any);

      // Override performConnectionTest to simulate failure
      jest.spyOn(service as any, 'performConnectionTest').mockRejectedValue(new Error('Connection refused'));

      const result = await service.testConnection('conn-123', {});

      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection refused');
    });

    it('should return 404 for non-existent connector', async () => {
      mockPrisma.integrationConnector.findUnique.mockResolvedValue(null);

      await expect(service.testConnection('non-existent', {})).rejects.toThrow(NotFoundException);
    });
  });
});
