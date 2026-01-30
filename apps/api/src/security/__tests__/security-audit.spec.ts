import { NotFoundException } from "@nestjs/common";
import { MoltbotSecurityAuditService } from "../security-audit.service";

jest.mock("@molthub/database", () => ({
  prisma: {
    botInstance: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  },
  Prisma: { InputJsonValue: {} },
}));

function createStoredInstance(moltbotConfig: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    id: "inst-1",
    name: "test-bot",
    desiredManifest: {
      apiVersion: "molthub/v2",
      metadata: { name: "test-bot", environment: "dev" },
      spec: { moltbotConfig: { gateway: { port: 18789, host: "127.0.0.1" }, ...moltbotConfig } },
    },
    ...overrides,
  };
}

describe("MoltbotSecurityAuditService", () => {
  let service: MoltbotSecurityAuditService;
  const { prisma } = require("@molthub/database");

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MoltbotSecurityAuditService();
  });

  describe("audit", () => {
    it("throws NotFoundException for unknown instance", async () => {
      prisma.botInstance.findUnique.mockResolvedValueOnce(null);
      await expect(service.audit("unknown")).rejects.toThrow(NotFoundException);
    });

    it("returns audit result with correct shape", async () => {
      prisma.botInstance.findUnique.mockResolvedValueOnce(createStoredInstance());
      const result = await service.audit("inst-1");
      expect(result).toHaveProperty("instanceId", "inst-1");
      expect(result).toHaveProperty("findings");
      expect(result).toHaveProperty("totalErrors");
      expect(result).toHaveProperty("totalWarnings");
      expect(result).toHaveProperty("totalInfo");
      expect(result).toHaveProperty("auditedAt");
      expect(result).toHaveProperty("configHash");
    });

    it("produces a configHash (hex substring)", async () => {
      prisma.botInstance.findUnique.mockResolvedValueOnce(createStoredInstance());
      const result = await service.audit("inst-1");
      expect(result.configHash).toMatch(/^[a-f0-9]{16}$/);
    });

    it("counts findings correctly", async () => {
      prisma.botInstance.findUnique.mockResolvedValueOnce(createStoredInstance());
      const result = await service.audit("inst-1");
      const errors = result.findings.filter((f: any) => f.severity === "ERROR");
      const warnings = result.findings.filter((f: any) => f.severity === "WARNING");
      expect(result.totalErrors).toBe(errors.length);
      expect(result.totalWarnings).toBe(warnings.length);
    });
  });

  describe("suggestFixes", () => {
    it("returns fix suggestions for audit findings", async () => {
      prisma.botInstance.findUnique.mockResolvedValue(createStoredInstance());
      const fixes = await service.suggestFixes("inst-1");
      expect(Array.isArray(fixes)).toBe(true);
      for (const fix of fixes) {
        expect(fix).toHaveProperty("findingId");
        expect(fix).toHaveProperty("description");
        expect(fix).toHaveProperty("patch");
      }
    });
  });

  describe("applyFixes", () => {
    it("throws NotFoundException for unknown instance", async () => {
      prisma.botInstance.findUnique.mockResolvedValueOnce(createStoredInstance());
      prisma.botInstance.findUnique.mockResolvedValueOnce(null);
      await expect(service.applyFixes("inst-1", ["fix"])).rejects.toThrow(NotFoundException);
    });

    it("returns failed fixes for unknown fixIds", async () => {
      prisma.botInstance.findUnique.mockResolvedValue(createStoredInstance());
      const result = await service.applyFixes("inst-1", ["nonexistent"]);
      expect(result.failedFixes).toContainEqual(
        expect.objectContaining({ fixId: "nonexistent", reason: "Fix not found" }),
      );
    });

    it("returns re-audit after applying fixes", async () => {
      prisma.botInstance.findUnique.mockResolvedValue(createStoredInstance());
      const result = await service.applyFixes("inst-1", []);
      expect(result).toHaveProperty("instanceId", "inst-1");
      expect(result).toHaveProperty("newAudit");
      expect(result.newAudit).toHaveProperty("findings");
    });
  });

  describe("preProvisioningAudit", () => {
    it("returns allowed field and arrays", async () => {
      const manifest = {
        apiVersion: "molthub/v2",
        metadata: { name: "test", environment: "dev" },
        spec: {
          moltbotConfig: {
            gateway: { port: 18789, host: "127.0.0.1", auth: { token: "tok" } },
            sandbox: { mode: "docker" },
            tools: { profile: "standard" },
          },
        },
      } as any;
      const result = await service.preProvisioningAudit(manifest);
      expect(result).toHaveProperty("allowed");
      expect(result).toHaveProperty("blockers");
      expect(result).toHaveProperty("warnings");
    });

    it("maps 'local' environment to 'dev'", async () => {
      const manifest = {
        apiVersion: "molthub/v2",
        metadata: { name: "test", environment: "local" },
        spec: { moltbotConfig: { gateway: { port: 18789, auth: { token: "t" } } } },
      } as any;
      const result = await service.preProvisioningAudit(manifest);
      expect(result).toHaveProperty("allowed");
    });
  });

  describe("calculateSecurityScore", () => {
    it("returns 100 for perfectly secured config", () => {
      const config = {
        gateway: { host: "127.0.0.1", auth: { token: "t" } },
        sandbox: { mode: "docker", docker: { readOnlyRootfs: true, noNewPrivileges: true } },
        channels: {},
        tools: { profile: "standard" },
        logging: { redactSensitive: "tools" },
        skills: { allowUnverified: false },
      };
      expect(service.calculateSecurityScore(config)).toBe(100);
    });

    it("returns 0 for completely insecure config", () => {
      const config = {
        gateway: { host: "0.0.0.0" },
        sandbox: { mode: "off" },
        channels: { whatsapp: { enabled: true, dmPolicy: "open", groupPolicy: "open" } },
        tools: { profile: "full" },
        logging: {},
        skills: { allowUnverified: true },
      };
      expect(service.calculateSecurityScore(config)).toBe(0);
    });

    it("gives 20 points for gateway auth token", () => {
      const diff = service.calculateSecurityScore({ gateway: { auth: { token: "t" } } })
        - service.calculateSecurityScore({ gateway: {} });
      expect(diff).toBe(20);
    });

    it("gives 15 points for sandbox mode != off", () => {
      const diff = service.calculateSecurityScore({ sandbox: { mode: "docker" } })
        - service.calculateSecurityScore({ sandbox: { mode: "off" } });
      expect(diff).toBe(15);
    });

    it("gives 10 points for localhost gateway", () => {
      const diff = service.calculateSecurityScore({ gateway: { host: "127.0.0.1" } })
        - service.calculateSecurityScore({ gateway: { host: "0.0.0.0" } });
      expect(diff).toBe(10);
    });

    it("handles empty config", () => {
      const score = service.calculateSecurityScore({});
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("caps score at 100", () => {
      const config = {
        gateway: { host: "localhost", auth: { token: "t" } },
        sandbox: { mode: "all", docker: { readOnlyRootfs: true, noNewPrivileges: true } },
        channels: {},
        tools: { profile: "minimal" },
        logging: { redactSensitive: "tools" },
        skills: {},
      };
      expect(service.calculateSecurityScore(config)).toBeLessThanOrEqual(100);
    });
  });
});
