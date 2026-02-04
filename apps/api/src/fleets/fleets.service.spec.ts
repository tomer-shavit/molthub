/**
 * Unit Tests - Fleet Service
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { FleetService } from '../src/fleets/fleets.service';

// Mock the database module
jest.mock('@clawster/database', () => ({
  prisma: {
    fleet: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    botInstance: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
  FleetStatus: {
    ACTIVE: 'ACTIVE',
    PAUSED: 'PAUSED',
    DRAINING: 'DRAINING',
    ERROR: 'ERROR',
  },
  BotStatus: {
    CREATING: 'CREATING',
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
  },
}));

import { prisma } from '@clawster/database';

describe('FleetService', () => {
  let service: FleetService;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FleetService],
    }).compile();

    service = module.get<FleetService>(FleetService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto = {
      workspaceId: 'workspace-123',
      name: 'test-fleet',
      environment: 'dev' as const,
      description: 'Test fleet',
      tags: { team: 'test' },
    };

    it('should create a fleet successfully', async () => {
      mockPrisma.fleet.findFirst.mockResolvedValue(null);
      mockPrisma.fleet.create.mockResolvedValue({
        id: 'fleet-123',
        ...createDto,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.create(createDto);

      expect(result).toHaveProperty('id');
      expect(result.name).toBe('test-fleet');
      expect(mockPrisma.fleet.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace-123',
          name: 'test-fleet',
          status: 'ACTIVE',
        }),
      }));
    });

    it('should throw BadRequestException for duplicate name', async () => {
      mockPrisma.fleet.findFirst.mockResolvedValue({
        id: 'existing-fleet',
        name: 'test-fleet',
      } as any);

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return list of fleets', async () => {
      mockPrisma.fleet.findMany.mockResolvedValue([
        { id: 'fleet-1', name: 'Fleet 1' },
        { id: 'fleet-2', name: 'Fleet 2' },
      ] as any);

      const result = await service.findAll({ workspaceId: 'workspace-123' });

      expect(result).toHaveLength(2);
      expect(mockPrisma.fleet.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { workspaceId: 'workspace-123' },
      }));
    });

    it('should filter by environment', async () => {
      mockPrisma.fleet.findMany.mockResolvedValue([]);

      await service.findAll({ workspaceId: 'workspace-123', environment: 'prod' });

      expect(mockPrisma.fleet.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { workspaceId: 'workspace-123', environment: 'prod' },
      }));
    });

    it('should filter by status', async () => {
      mockPrisma.fleet.findMany.mockResolvedValue([]);

      await service.findAll({ workspaceId: 'workspace-123', status: 'ACTIVE' });

      expect(mockPrisma.fleet.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { workspaceId: 'workspace-123', status: 'ACTIVE' },
      }));
    });
  });

  describe('findOne', () => {
    it('should return fleet by id', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue({
        id: 'fleet-123',
        name: 'Test Fleet',
        instances: [],
      } as any);

      const result = await service.findOne('fleet-123');

      expect(result.id).toBe('fleet-123');
      expect(result.instances).toEqual([]);
    });

    it('should throw NotFoundException for non-existent fleet', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto = {
      description: 'Updated description',
    };

    it('should update fleet successfully', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue({ id: 'fleet-123' } as any);
      mockPrisma.fleet.update.mockResolvedValue({
        id: 'fleet-123',
        description: 'Updated description',
      } as any);

      const result = await service.update('fleet-123', updateDto);

      expect(result.description).toBe('Updated description');
    });

    it('should throw NotFoundException for non-existent fleet', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent', updateDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should update status successfully', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue({
        id: 'fleet-123',
        status: 'ACTIVE',
      } as any);
      mockPrisma.fleet.update.mockResolvedValue({
        id: 'fleet-123',
        status: 'PAUSED',
      } as any);

      const result = await service.updateStatus('fleet-123', 'PAUSED');

      expect(result.status).toBe('PAUSED');
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue({
        id: 'fleet-123',
        status: 'DRAINING',
      } as any);

      await expect(service.updateStatus('fleet-123', 'PAUSED')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent fleet', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('non-existent', 'PAUSED')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getHealth', () => {
    it('should return fleet health breakdown', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue({
        id: 'fleet-123',
        status: 'ACTIVE',
      } as any);
      mockPrisma.botInstance.findMany.mockResolvedValue([
        { health: 'HEALTHY' },
        { health: 'HEALTHY' },
        { health: 'UNHEALTHY' },
        { health: 'UNKNOWN' },
      ] as any);

      const result = await service.getHealth('fleet-123');

      expect(result.fleetId).toBe('fleet-123');
      expect(result.totalInstances).toBe(4);
      expect(result.healthyCount).toBe(2);
      expect(result.unhealthyCount).toBe(1);
      expect(result.unknownCount).toBe(1);
      expect(result.status).toBe('ACTIVE');
    });

    it('should handle fleet with no instances', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue({
        id: 'fleet-123',
        status: 'ACTIVE',
      } as any);
      mockPrisma.botInstance.findMany.mockResolvedValue([]);

      const result = await service.getHealth('fleet-123');

      expect(result.totalInstances).toBe(0);
      expect(result.healthyCount).toBe(0);
    });
  });

  describe('remove', () => {
    it('should delete fleet successfully', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue({ id: 'fleet-123' } as any);
      mockPrisma.botInstance.count.mockResolvedValue(0);
      mockPrisma.fleet.delete.mockResolvedValue({} as any);

      await service.remove('fleet-123');

      expect(mockPrisma.fleet.delete).toHaveBeenCalledWith({
        where: { id: 'fleet-123' },
      });
    });

    it('should throw BadRequestException for fleet with instances', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue({ id: 'fleet-123' } as any);
      mockPrisma.botInstance.count.mockResolvedValue(5);

      await expect(service.remove('fleet-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent fleet', async () => {
      mockPrisma.fleet.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
