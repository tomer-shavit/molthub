/**
 * Unit Tests - Debug Service
 */
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";

// Mock the gateway client before importing the service
jest.mock("@molthub/gateway-client", () => {
  const mockHealth = jest.fn().mockResolvedValue({
    ok: true,
    channels: [
      { id: "whatsapp", name: "WhatsApp", type: "whatsapp", ok: true },
    ],
    uptime: 3600,
  });

  const mockConfigGet = jest.fn().mockResolvedValue({
    config: {
      gateway: { port: 18789, auth: { token: "secret-token" } },
      channels: { whatsapp: { enabled: true } },
    },
    hash: "abc123",
  });

  const mockConnect = jest.fn().mockResolvedValue({
    type: "connected",
    presence: { users: [], stateVersion: 1 },
    health: { ok: true, channels: [], uptime: 0 },
    stateVersion: 1,
  });

  const mockDisconnect = jest.fn().mockResolvedValue(undefined);

  return {
    GatewayClient: jest.fn().mockImplementation(() => ({
      connect: mockConnect,
      disconnect: mockDisconnect,
      health: mockHealth,
      status: jest.fn().mockResolvedValue({ state: "running", version: "1.0.0", configHash: "abc123" }),
      configGet: mockConfigGet,
      isConnected: jest.fn().mockReturnValue(true),
    })),
    PROTOCOL_VERSION: 1,
  };
});

// Mock the database module
jest.mock("@molthub/database", () => ({
  prisma: {
    botInstance: {
      findUnique: jest.fn(),
    },
    gatewayConnection: {
      findUnique: jest.fn(),
    },
    openClawProfile: {
      findUnique: jest.fn(),
    },
  },
  GatewayConnectionStatus: {
    CONNECTED: "CONNECTED",
    DISCONNECTED: "DISCONNECTED",
    ERROR: "ERROR",
  },
}));

import { DebugService } from "../debug.service";
import { prisma } from "@molthub/database";

const mockPrisma = prisma as unknown as {
  botInstance: { findUnique: jest.Mock };
  gatewayConnection: { findUnique: jest.Mock };
  openClawProfile: { findUnique: jest.Mock };
};

describe("DebugService", () => {
  let service: DebugService;

  const mockInstance = {
    id: "inst-1",
    name: "test-bot",
    profileName: "main",
    gatewayPort: 18789,
    configHash: "abc123",
    desiredManifest: {
      spec: {
        openclawConfig: {
          channels: {
            whatsapp: { enabled: true, dmPolicy: "pairing" },
          },
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-3" },
            },
          },
        },
      },
    },
    deploymentType: "LOCAL",
    deploymentTargetId: null,
    metadata: {},
  };

  const mockConnection = {
    instanceId: "inst-1",
    host: "localhost",
    port: 18789,
    authMode: "token",
    authToken: "test-token",
    status: "CONNECTED",
    configHash: "abc123",
  };

  const mockProfile = {
    instanceId: "inst-1",
    profileName: "main",
    configPath: "~/.openclaw/profiles/main/openclaw.json",
    stateDir: "~/.openclaw/profiles/main/state/",
    workspace: "~/openclaw/main/",
    basePort: 18789,
    serviceName: "openclaw-gateway-main",
    serviceType: "systemd",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DebugService],
    }).compile();

    service = module.get<DebugService>(DebugService);
    jest.clearAllMocks();
    mockPrisma.botInstance.findUnique.mockResolvedValue(mockInstance);
    mockPrisma.gatewayConnection.findUnique.mockResolvedValue(mockConnection);
    mockPrisma.openClawProfile.findUnique.mockResolvedValue(mockProfile);
  });

  describe("getProcesses", () => {
    it("should return process list when gateway is reachable", async () => {
      const result = await service.getProcesses("inst-1");
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].command).toContain("openclaw gateway");
    });

    it("should throw NotFoundException for non-existent instance", async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue(null);
      await expect(service.getProcesses("non-existent")).rejects.toThrow(NotFoundException);
    });

    it("should return placeholder when no gateway connection", async () => {
      mockPrisma.gatewayConnection.findUnique.mockResolvedValue(null);
      const result = await service.getProcesses("inst-1");
      expect(result.length).toBe(1);
      expect(result[0].command).toContain("no gateway connection configured");
    });
  });

  describe("probeGateway", () => {
    it("should return probe result when gateway is reachable", async () => {
      const result = await service.probeGateway("inst-1");
      expect(result.reachable).toBe(true);
      expect(result.healthOk).toBe(true);
      expect(result.channelsLinked).toBe(1);
      expect(result.uptime).toBe(3600);
      expect(result.protocolVersion).toBe(1);
    });

    it("should return unreachable when no connection configured", async () => {
      mockPrisma.gatewayConnection.findUnique.mockResolvedValue(null);
      const result = await service.probeGateway("inst-1");
      expect(result.reachable).toBe(false);
      expect(result.error).toContain("No gateway connection configured");
    });

    it("should throw NotFoundException for non-existent instance", async () => {
      mockPrisma.botInstance.findUnique.mockResolvedValue(null);
      await expect(service.probeGateway("non-existent")).rejects.toThrow(NotFoundException);
    });
  });

  describe("getConfig", () => {
    it("should return config from gateway with secrets redacted", async () => {
      const result = await service.getConfig("inst-1");
      expect(result.source).toBe("gateway");
      expect(result.configHash).toBe("abc123");
      const auth = (result.config.gateway as Record<string, unknown>)?.auth as Record<string, unknown>;
      expect(auth.token).toBe("***REDACTED***");
    });

    it("should fall back to DB manifest when gateway unavailable", async () => {
      mockPrisma.gatewayConnection.findUnique.mockResolvedValue(null);
      const result = await service.getConfig("inst-1");
      expect(result.source).toBe("target");
      expect(result.config).toBeDefined();
    });
  });

  describe("getEnvStatus", () => {
    it("should return env var status list", async () => {
      const result = await service.getEnvStatus("inst-1");
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const configPath = result.find((v) => v.name === "OPENCLAW_CONFIG_PATH");
      expect(configPath?.isSet).toBe(true);

      const profileVar = result.find((v) => v.name === "OPENCLAW_PROFILE");
      expect(profileVar?.isSet).toBe(true);
    });

    it("should infer Anthropic API key from model config", async () => {
      const result = await service.getEnvStatus("inst-1");
      const anthropicKey = result.find((v) => v.name === "ANTHROPIC_API_KEY");
      expect(anthropicKey?.isSet).toBe(true);
    });
  });

  describe("getStateFiles", () => {
    it("should return state file paths from profile", async () => {
      const result = await service.getStateFiles("inst-1");
      expect(result.length).toBe(3);
      const paths = result.map((f) => f.path);
      expect(paths).toContain(mockProfile.configPath);
    });

    it("should return default paths when no profile exists", async () => {
      mockPrisma.openClawProfile.findUnique.mockResolvedValue(null);
      const result = await service.getStateFiles("inst-1");
      expect(result.length).toBe(3);
      expect(result.map((f) => f.path)).toContain("~/.openclaw/openclaw.json");
    });
  });

  describe("testConnectivity", () => {
    it("should return connectivity results when gateway is reachable", async () => {
      const result = await service.testConnectivity("inst-1");
      expect(result.gatewayPort.reachable).toBe(true);
      expect(result.dns.resolved).toBe(true);
      expect(result.internet.reachable).toBe(true);
    });

    it("should return failed connectivity when no connection", async () => {
      mockPrisma.gatewayConnection.findUnique.mockResolvedValue(null);
      const result = await service.testConnectivity("inst-1");
      expect(result.gatewayPort.reachable).toBe(false);
      expect(result.dns.resolved).toBe(false);
    });
  });
});
