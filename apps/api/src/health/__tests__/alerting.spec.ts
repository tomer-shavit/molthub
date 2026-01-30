import { AlertingService } from "../alerting.service";

jest.mock("@molthub/database", () => ({
  prisma: { botInstance: { findMany: jest.fn().mockResolvedValue([]) } },
  BotStatus: { RUNNING: "RUNNING", DEGRADED: "DEGRADED", DELETING: "DELETING", CREATING: "CREATING" },
  BotHealth: { HEALTHY: "HEALTHY", DEGRADED: "DEGRADED", UNHEALTHY: "UNHEALTHY", UNKNOWN: "UNKNOWN" },
  GatewayConnectionStatus: { CONNECTED: "CONNECTED", DISCONNECTED: "DISCONNECTED", ERROR: "ERROR" },
  ChannelAuthState: { ACTIVE: "ACTIVE", EXPIRED: "EXPIRED", ERROR: "ERROR" },
  AlertSeverity: { CRITICAL: "CRITICAL", ERROR: "ERROR", WARNING: "WARNING", INFO: "INFO" },
  AlertStatus: { ACTIVE: "ACTIVE", ACKNOWLEDGED: "ACKNOWLEDGED", RESOLVED: "RESOLVED", SUPPRESSED: "SUPPRESSED" },
}));

const mockAlertsService = {
  upsertAlert: jest.fn().mockResolvedValue({}),
  resolveAlertByKey: jest.fn().mockResolvedValue(null),
  listAlerts: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 }),
  acknowledgeAlert: jest.fn().mockResolvedValue({}),
  getActiveAlertCount: jest.fn().mockResolvedValue(0),
};

function createInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: "inst-1", name: "test-bot", fleetId: "fleet-1", status: "RUNNING",
    health: "HEALTHY", errorCount: 0, lastHealthCheckAt: new Date(),
    configHash: "abc123",
    gatewayConnection: { status: "CONNECTED", lastHeartbeat: new Date(), configHash: "abc123" },
    channelAuthSessions: [],
    ...overrides,
  };
}

describe("AlertingService", () => {
  let service: AlertingService;
  const { prisma } = require("@molthub/database");

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AlertingService(mockAlertsService as any);
  });

  describe("unreachable_instance", () => {
    it("fires CRITICAL alert when gateway disconnected beyond threshold", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([
        createInstance({
          gatewayConnection: { status: "DISCONNECTED", lastHeartbeat: new Date(Date.now() - 3 * 60_000), configHash: "abc" },
        }),
      ]);
      await service.evaluateAlerts();
      expect(mockAlertsService.upsertAlert).toHaveBeenCalledWith(
        expect.objectContaining({ rule: "unreachable_instance", severity: "CRITICAL" }),
      );
    });

    it("fires when no gateway connection exists", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance({ gatewayConnection: null })]);
      await service.evaluateAlerts();
      expect(mockAlertsService.upsertAlert).toHaveBeenCalledWith(
        expect.objectContaining({ rule: "unreachable_instance", severity: "CRITICAL" }),
      );
    });

    it("resolves alert when instance is reachable", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance()]);
      await service.evaluateAlerts();
      expect(mockAlertsService.resolveAlertByKey).toHaveBeenCalledWith("unreachable_instance", "inst-1");
    });
  });

  describe("degraded_instance", () => {
    it("fires WARNING alert when degraded beyond threshold", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([
        createInstance({ health: "DEGRADED", lastHealthCheckAt: new Date(Date.now() - 6 * 60_000) }),
      ]);
      await service.evaluateAlerts();
      expect(mockAlertsService.upsertAlert).toHaveBeenCalledWith(
        expect.objectContaining({ rule: "degraded_instance", severity: "WARNING" }),
      );
    });

    it("resolves alert when health is not DEGRADED", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance({ health: "HEALTHY" })]);
      await service.evaluateAlerts();
      expect(mockAlertsService.resolveAlertByKey).toHaveBeenCalledWith("degraded_instance", "inst-1");
    });
  });

  describe("config_drift", () => {
    it("fires ERROR alert when config hashes differ", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([
        createInstance({
          configHash: "expected",
          gatewayConnection: { status: "CONNECTED", lastHeartbeat: new Date(), configHash: "different" },
        }),
      ]);
      await service.evaluateAlerts();
      expect(mockAlertsService.upsertAlert).toHaveBeenCalledWith(
        expect.objectContaining({ rule: "config_drift", severity: "ERROR" }),
      );
    });

    it("resolves when hashes match", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([
        createInstance({
          configHash: "same",
          gatewayConnection: { status: "CONNECTED", lastHeartbeat: new Date(), configHash: "same" },
        }),
      ]);
      await service.evaluateAlerts();
      expect(mockAlertsService.resolveAlertByKey).toHaveBeenCalledWith("config_drift", "inst-1");
    });
  });

  describe("channel_auth_expired", () => {
    it("fires ERROR alert for expired channel sessions", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([
        createInstance({ channelAuthSessions: [{ channelType: "whatsapp", state: "EXPIRED" }] }),
      ]);
      await service.evaluateAlerts();
      expect(mockAlertsService.upsertAlert).toHaveBeenCalledWith(
        expect.objectContaining({ rule: "channel_auth_expired", severity: "ERROR" }),
      );
    });

    it("resolves when all sessions are active", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([
        createInstance({ channelAuthSessions: [{ channelType: "whatsapp", state: "ACTIVE" }] }),
      ]);
      await service.evaluateAlerts();
      expect(mockAlertsService.resolveAlertByKey).toHaveBeenCalledWith("channel_auth_expired", "inst-1");
    });
  });

  describe("health_check_failed", () => {
    it("fires ERROR alert after 3+ consecutive failures", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance({ errorCount: 3 })]);
      await service.evaluateAlerts();
      expect(mockAlertsService.upsertAlert).toHaveBeenCalledWith(
        expect.objectContaining({ rule: "health_check_failed", severity: "ERROR" }),
      );
    });

    it("resolves when errorCount is below threshold", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance({ errorCount: 2 })]);
      await service.evaluateAlerts();
      expect(mockAlertsService.resolveAlertByKey).toHaveBeenCalledWith("health_check_failed", "inst-1");
    });
  });

  describe("public API delegates", () => {
    it("getActiveAlerts delegates to alertsService", async () => {
      mockAlertsService.listAlerts.mockResolvedValueOnce({ data: [{ id: "a1" }], total: 1, page: 1, limit: 50 });
      const result = await service.getActiveAlerts("inst-1");
      expect(mockAlertsService.listAlerts).toHaveBeenCalledWith({ instanceId: "inst-1", status: "ACTIVE" });
      expect(result).toEqual([{ id: "a1" }]);
    });

    it("getActiveAlertCount delegates", async () => {
      mockAlertsService.getActiveAlertCount.mockResolvedValueOnce(5);
      expect(await service.getActiveAlertCount()).toBe(5);
    });
  });
});
