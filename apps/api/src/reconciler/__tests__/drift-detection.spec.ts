import { DriftDetectionService } from "../drift-detection.service";
import { ConfigGeneratorService } from "../config-generator.service";

jest.mock("@molthub/database", () => ({
  prisma: {
    botInstance: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    gatewayConnection: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  },
  BotStatus: { RUNNING: "RUNNING", DEGRADED: "DEGRADED" },
  BotHealth: { HEALTHY: "HEALTHY", DEGRADED: "DEGRADED", UNHEALTHY: "UNHEALTHY", UNKNOWN: "UNKNOWN" },
  GatewayConnectionStatus: { CONNECTED: "CONNECTED", DISCONNECTED: "DISCONNECTED" },
}));

const mockGatewayClient = { configGet: jest.fn(), health: jest.fn(), status: jest.fn() };

jest.mock("@molthub/gateway-client", () => ({
  GatewayManager: jest.fn().mockImplementation(() => ({
    getClient: jest.fn().mockResolvedValue(mockGatewayClient),
  })),
}));

function createManifest(moltbotConfig: Record<string, unknown> = {}) {
  return {
    apiVersion: "molthub/v2",
    metadata: { name: "test-bot", environment: "dev" },
    spec: {
      moltbotConfig: {
        gateway: { port: 18789, host: "127.0.0.1", auth: { token: "fixed-token-for-test" } },
        logging: { level: "debug", redactSensitive: "tools" },
        ...moltbotConfig,
      },
    },
  } as any;
}

function createInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: "inst-1", name: "test-bot", fleetId: "fleet-1", status: "RUNNING",
    health: "HEALTHY", configHash: null, gatewayPort: 18789, errorCount: 0,
    lastHealthCheckAt: new Date(), ...overrides,
  } as any;
}

describe("DriftDetectionService", () => {
  let service: DriftDetectionService;
  let configGenerator: ConfigGeneratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    configGenerator = new ConfigGeneratorService();
    service = new DriftDetectionService(configGenerator);
  });

  describe("no drift scenario", () => {
    it("returns hasDrift=false when everything matches", async () => {
      const manifest = createManifest();
      const desiredConfig = configGenerator.generateMoltbotConfig(manifest);
      const desiredHash = configGenerator.generateConfigHash(desiredConfig);

      mockGatewayClient.configGet.mockResolvedValue({ hash: desiredHash });
      mockGatewayClient.health.mockResolvedValue({ ok: true });
      mockGatewayClient.status.mockResolvedValue({ state: "running" });

      const result = await service.checkDrift(createInstance(), manifest);
      expect(result.hasDrift).toBe(false);
      expect(result.findings).toHaveLength(0);
      expect(result.gatewayReachable).toBe(true);
    });
  });

  describe("config hash mismatch", () => {
    it("detects stored configHash mismatch", async () => {
      const manifest = createManifest();
      const desiredConfig = configGenerator.generateMoltbotConfig(manifest);
      const desiredHash = configGenerator.generateConfigHash(desiredConfig);

      mockGatewayClient.configGet.mockResolvedValue({ hash: desiredHash });
      mockGatewayClient.health.mockResolvedValue({ ok: true });
      mockGatewayClient.status.mockResolvedValue({ state: "running" });

      const result = await service.checkDrift(createInstance({ configHash: "stale-hash" }), manifest);
      expect(result.hasDrift).toBe(true);
      expect(result.findings.find((f: any) => f.field === "configHash")).toBeDefined();
    });

    it("detects remote configHash mismatch (CRITICAL)", async () => {
      const manifest = createManifest();
      mockGatewayClient.configGet.mockResolvedValue({ hash: "wrong-hash" });
      mockGatewayClient.health.mockResolvedValue({ ok: true });
      mockGatewayClient.status.mockResolvedValue({ state: "running" });

      const result = await service.checkDrift(createInstance(), manifest);
      const finding = result.findings.find((f: any) => f.field === "remoteConfigHash");
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe("CRITICAL");
    });
  });

  describe("gateway unreachable", () => {
    it("adds CRITICAL finding when gateway is unreachable", async () => {
      const { GatewayManager } = require("@molthub/gateway-client");
      GatewayManager.mockImplementationOnce(() => ({
        getClient: jest.fn().mockRejectedValue(new Error("Connection refused")),
      }));
      const freshService = new DriftDetectionService(configGenerator);
      const result = await freshService.checkDrift(createInstance(), createManifest());
      expect(result.gatewayReachable).toBe(false);
      expect(result.findings.find((f: any) => f.field === "gatewayConnection")).toBeDefined();
    });
  });

  describe("gateway unhealthy", () => {
    it("adds CRITICAL finding when health.ok is false", async () => {
      const manifest = createManifest();
      const desiredConfig = configGenerator.generateMoltbotConfig(manifest);
      const desiredHash = configGenerator.generateConfigHash(desiredConfig);

      mockGatewayClient.configGet.mockResolvedValue({ hash: desiredHash });
      mockGatewayClient.health.mockResolvedValue({ ok: false });
      mockGatewayClient.status.mockResolvedValue({ state: "running" });

      const result = await service.checkDrift(createInstance(), manifest);
      expect(result.gatewayHealthy).toBe(false);
      expect(result.findings.find((f: any) => f.field === "gatewayHealth")!.severity).toBe("CRITICAL");
    });
  });

  describe("status mismatch", () => {
    it("adds CRITICAL finding when state is not running", async () => {
      const manifest = createManifest();
      const desiredConfig = configGenerator.generateMoltbotConfig(manifest);
      const desiredHash = configGenerator.generateConfigHash(desiredConfig);

      mockGatewayClient.configGet.mockResolvedValue({ hash: desiredHash });
      mockGatewayClient.health.mockResolvedValue({ ok: true });
      mockGatewayClient.status.mockResolvedValue({ state: "stopped" });

      const result = await service.checkDrift(createInstance(), manifest);
      const finding = result.findings.find((f: any) => f.field === "gatewayState");
      expect(finding!.actual).toBe("stopped");
      expect(finding!.severity).toBe("CRITICAL");
    });
  });

  describe("result shape", () => {
    it("always returns expected properties", async () => {
      const manifest = createManifest();
      const desiredConfig = configGenerator.generateMoltbotConfig(manifest);
      const desiredHash = configGenerator.generateConfigHash(desiredConfig);

      mockGatewayClient.configGet.mockResolvedValue({ hash: desiredHash });
      mockGatewayClient.health.mockResolvedValue({ ok: true });
      mockGatewayClient.status.mockResolvedValue({ state: "running" });

      const result = await service.checkDrift(createInstance(), manifest);
      expect(result).toHaveProperty("hasDrift");
      expect(result).toHaveProperty("findings");
      expect(result).toHaveProperty("configHashExpected");
      expect(result).toHaveProperty("gatewayReachable");
    });
  });
});
