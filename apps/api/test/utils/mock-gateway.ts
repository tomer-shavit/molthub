/**
 * Mock GatewayClient and GatewayManager for API unit tests.
 */

export interface MockGatewayClient {
  connect: jest.Mock;
  disconnect: jest.Mock;
  isConnected: jest.Mock;
  health: jest.Mock;
  status: jest.Mock;
  configGet: jest.Mock;
  configApply: jest.Mock;
  configPatch: jest.Mock;
  send: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  removeAllListeners: jest.Mock;
}

export function createMockGatewayClient(
  overrides: Partial<MockGatewayClient> = {},
): MockGatewayClient {
  return {
    connect: jest.fn().mockResolvedValue({
      type: "connected",
      presence: { users: [], stateVersion: 1 },
      health: { ok: true, channels: [], uptime: 100 },
      stateVersion: 1,
    }),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
    health: jest.fn().mockResolvedValue({ ok: true, channels: [], uptime: 3600 }),
    status: jest.fn().mockResolvedValue({ state: "running", version: "1.0.0", configHash: "abc123" }),
    configGet: jest.fn().mockResolvedValue({ config: { gateway: { port: 18789 } }, hash: "abc123" }),
    configApply: jest.fn().mockResolvedValue({ ok: true }),
    configPatch: jest.fn().mockResolvedValue({ ok: true }),
    send: jest.fn().mockResolvedValue({ delivered: true }),
    on: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    ...overrides,
  };
}

export interface MockGatewayManager {
  getClient: jest.Mock;
  removeClient: jest.Mock;
  disconnectAll: jest.Mock;
  getConnectedInstances: jest.Mock;
}

export function createMockGatewayManager(
  mockClient?: MockGatewayClient,
): MockGatewayManager {
  const client = mockClient ?? createMockGatewayClient();
  return {
    getClient: jest.fn().mockResolvedValue(client),
    removeClient: jest.fn(),
    disconnectAll: jest.fn().mockResolvedValue(undefined),
    getConnectedInstances: jest.fn().mockReturnValue([]),
  };
}
