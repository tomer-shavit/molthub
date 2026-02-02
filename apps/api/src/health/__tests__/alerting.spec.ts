import { AlertingService } from "../alerting.service";

jest.mock("@clawster/database", () => ({
  prisma: {
    botInstance: { findMany: jest.fn().mockResolvedValue([]) },
    budgetConfig: { findMany: jest.fn().mockResolvedValue([]) },
    costEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { costCents: 0 } }),
    },
  },
  BotStatus: { RUNNING: "RUNNING", DEGRADED: "DEGRADED", DELETING: "DELETING", CREATING: "CREATING" },
  BotHealth: { HEALTHY: "HEALTHY", DEGRADED: "DEGRADED", UNHEALTHY: "UNHEALTHY", UNKNOWN: "UNKNOWN" },
  GatewayConnectionStatus: { CONNECTED: "CONNECTED", DISCONNECTED: "DISCONNECTED", ERROR: "ERROR" },
  ChannelAuthState: { ACTIVE: "ACTIVE", EXPIRED: "EXPIRED", ERROR: "ERROR" },
  AlertSeverity: { CRITICAL: "CRITICAL", ERROR: "ERROR", WARNING: "WARNING", INFO: "INFO" },
  AlertStatus: { ACTIVE: "ACTIVE", ACKNOWLEDGED: "ACKNOWLEDGED", RESOLVED: "RESOLVED", SUPPRESSED: "SUPPRESSED" },
}));

const mockAlertsService = {
  upsertAlert: jest.fn().mockResolvedValue({ id: "alert-1" }),
  resolveAlertByKey: jest.fn().mockResolvedValue(null),
  listAlerts: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 }),
  acknowledgeAlert: jest.fn().mockResolvedValue({}),
  getActiveAlertCount: jest.fn().mockResolvedValue(0),
};

const mockNotificationDeliveryService = {
  deliverAlert: jest.fn().mockResolvedValue(undefined),
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
  const { prisma } = require("@clawster/database");

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AlertingService(mockAlertsService as any, mockNotificationDeliveryService as any);
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

  describe("budget_warning", () => {
    it("fires WARNING alert when spend exceeds warnThresholdPct", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance()]);
      prisma.budgetConfig.findMany.mockResolvedValueOnce([
        {
          id: "budget-1",
          name: "Test Budget",
          instanceId: "inst-1",
          fleetId: "fleet-1",
          monthlyLimitCents: 10000,
          warnThresholdPct: 75,
          criticalThresholdPct: 90,
          isActive: true,
          currentSpendCents: 0,
        },
      ]);
      // 80% of 10000 = 8000 cents
      prisma.costEvent.aggregate.mockResolvedValueOnce({ _sum: { costCents: 8000 } });

      await service.evaluateAlerts();

      expect(mockAlertsService.upsertAlert).toHaveBeenCalledWith(
        expect.objectContaining({ rule: "budget_warning", severity: "WARNING" }),
      );
    });

    it("resolves WARNING when spend drops below warnThresholdPct", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance()]);
      prisma.budgetConfig.findMany.mockResolvedValueOnce([
        {
          id: "budget-1",
          name: "Test Budget",
          instanceId: "inst-1",
          fleetId: "fleet-1",
          monthlyLimitCents: 10000,
          warnThresholdPct: 75,
          criticalThresholdPct: 90,
          isActive: true,
          currentSpendCents: 0,
        },
      ]);
      // 50% of 10000 = 5000 cents — below 75% threshold
      prisma.costEvent.aggregate.mockResolvedValueOnce({ _sum: { costCents: 5000 } });

      await service.evaluateAlerts();

      expect(mockAlertsService.resolveAlertByKey).toHaveBeenCalledWith("budget_warning", "inst-1");
    });
  });

  describe("budget_critical", () => {
    it("fires CRITICAL alert when spend exceeds criticalThresholdPct", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance()]);
      prisma.budgetConfig.findMany.mockResolvedValueOnce([
        {
          id: "budget-1",
          name: "Test Budget",
          instanceId: "inst-1",
          fleetId: "fleet-1",
          monthlyLimitCents: 10000,
          warnThresholdPct: 75,
          criticalThresholdPct: 90,
          isActive: true,
          currentSpendCents: 0,
        },
      ]);
      // 95% of 10000 = 9500 cents — above 90% critical threshold
      prisma.costEvent.aggregate.mockResolvedValueOnce({ _sum: { costCents: 9500 } });

      await service.evaluateAlerts();

      expect(mockAlertsService.upsertAlert).toHaveBeenCalledWith(
        expect.objectContaining({ rule: "budget_critical", severity: "CRITICAL" }),
      );
    });

    it("fires CRITICAL alert when spend exceeds 100% of budget", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance()]);
      prisma.budgetConfig.findMany.mockResolvedValueOnce([
        {
          id: "budget-1",
          name: "Test Budget",
          instanceId: "inst-1",
          fleetId: "fleet-1",
          monthlyLimitCents: 10000,
          warnThresholdPct: 75,
          criticalThresholdPct: 90,
          isActive: true,
          currentSpendCents: 0,
        },
      ]);
      // 120% of 10000 = 12000 cents
      prisma.costEvent.aggregate.mockResolvedValueOnce({ _sum: { costCents: 12000 } });

      await service.evaluateAlerts();

      expect(mockAlertsService.upsertAlert).toHaveBeenCalledWith(
        expect.objectContaining({ rule: "budget_critical", severity: "CRITICAL" }),
      );
    });

    it("resolves both budget alerts when no budgets are configured", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance()]);
      prisma.budgetConfig.findMany.mockResolvedValueOnce([]);

      await service.evaluateAlerts();

      expect(mockAlertsService.resolveAlertByKey).toHaveBeenCalledWith("budget_warning", "inst-1");
      expect(mockAlertsService.resolveAlertByKey).toHaveBeenCalledWith("budget_critical", "inst-1");
    });

    it("includes budget details in alert payload", async () => {
      prisma.botInstance.findMany.mockResolvedValueOnce([createInstance()]);
      prisma.budgetConfig.findMany.mockResolvedValueOnce([
        {
          id: "budget-1",
          name: "Production Budget",
          instanceId: "inst-1",
          fleetId: "fleet-1",
          monthlyLimitCents: 10000,
          warnThresholdPct: 75,
          criticalThresholdPct: 90,
          isActive: true,
          currentSpendCents: 0,
        },
      ]);
      prisma.costEvent.aggregate.mockResolvedValueOnce({ _sum: { costCents: 9500 } });

      await service.evaluateAlerts();

      const call = mockAlertsService.upsertAlert.mock.calls.find(
        (c: any[]) => c[0].rule === "budget_critical",
      );
      expect(call).toBeDefined();
      const detail = JSON.parse(call![0].detail);
      expect(detail).toEqual(
        expect.objectContaining({
          budgetId: "budget-1",
          budgetName: "Production Budget",
          currentSpendCents: 9500,
          monthlyLimitCents: 10000,
          instanceName: "test-bot",
        }),
      );
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
