/**
 * Shared Prisma mock for API unit tests.
 */

export interface MockPrismaService {
  botInstance: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
  };
  gatewayConnection: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  healthAlert: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
  };
}

export function createMockPrismaService(): MockPrismaService {
  return {
    botInstance: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    gatewayConnection: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    healthAlert: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
}

export function createMockBotInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: "inst-1",
    name: "test-bot",
    fleetId: "fleet-1",
    status: "RUNNING",
    health: "HEALTHY",
    configHash: "abc123",
    gatewayPort: 18789,
    errorCount: 0,
    lastHealthCheckAt: new Date(),
    desiredManifest: {
      apiVersion: "clawster/v2",
      metadata: { name: "test-bot", environment: "dev" },
      spec: { openclawConfig: { gateway: { port: 18789, host: "127.0.0.1" } } },
    },
    gatewayConnection: null,
    channelAuthSessions: [],
    ...overrides,
  };
}
