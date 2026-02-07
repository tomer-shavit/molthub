import { GceNetworkManager } from "./gce-network-manager";
import type { IGceOperationManager } from "./interfaces";

// ── Mock SDK imports ───────────────────────────────────────────────────

jest.mock("@google-cloud/compute", () => ({
  NetworksClient: jest.fn(),
  SubnetworksClient: jest.fn(),
  FirewallsClient: jest.fn(),
  GlobalOperationsClient: jest.fn(),
  ZoneOperationsClient: jest.fn(),
  RegionOperationsClient: jest.fn(),
}));

// ── Test helpers ───────────────────────────────────────────────────────

function createManager() {
  const networksClient = { get: jest.fn(), insert: jest.fn(), delete: jest.fn() };
  const subnetworksClient = { get: jest.fn(), insert: jest.fn(), delete: jest.fn() };
  const firewallsClient = { get: jest.fn(), insert: jest.fn(), delete: jest.fn() };
  const operationManager: IGceOperationManager = {
    waitForOperation: jest.fn().mockResolvedValue(undefined),
  };
  const log = jest.fn();

  const manager = new GceNetworkManager(
    networksClient as never,
    subnetworksClient as never,
    firewallsClient as never,
    operationManager,
    "test-project",
    "us-central1",
    log
  );

  return { manager, firewallsClient, operationManager };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("GceNetworkManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("ensureFirewall — sourceRanges validation", () => {
    it("should reject rules with different sourceRanges in a single call", async () => {
      const { manager } = createManager();

      // SECURITY: This MUST throw to prevent SSH exposed to 0.0.0.0/0
      await expect(
        manager.ensureFirewall("test-fw", "test-vpc", [
          {
            protocol: "tcp",
            ports: ["80", "443"],
            sourceRanges: ["0.0.0.0/0"],
            targetTags: ["clawster-vm"],
          },
          {
            protocol: "tcp",
            ports: ["22"],
            sourceRanges: ["35.235.240.0/20"],
            targetTags: ["clawster-vm"],
          },
        ])
      ).rejects.toThrow("different sourceRanges");
    });

    it("should allow rules with the same sourceRanges", async () => {
      const { manager, firewallsClient } = createManager();

      // Firewall already exists — get() succeeds, no creation needed
      firewallsClient.get.mockResolvedValue([{ name: "test-fw" }]);

      await expect(
        manager.ensureFirewall("test-fw", "test-vpc", [
          {
            protocol: "tcp",
            ports: ["80"],
            sourceRanges: ["0.0.0.0/0"],
            targetTags: ["clawster-vm"],
          },
          {
            protocol: "tcp",
            ports: ["443"],
            sourceRanges: ["0.0.0.0/0"],
            targetTags: ["clawster-vm"],
          },
        ])
      ).resolves.not.toThrow();
    });

    it("should allow a single rule without validation issues", async () => {
      const { manager, firewallsClient } = createManager();
      firewallsClient.get.mockResolvedValue([{ name: "test-fw" }]);

      await expect(
        manager.ensureFirewall("test-fw", "test-vpc", [
          {
            protocol: "tcp",
            ports: ["22"],
            sourceRanges: ["35.235.240.0/20"],
            targetTags: ["clawster-vm"],
          },
        ])
      ).resolves.not.toThrow();
    });

    it("should create firewall when not found with single rule", async () => {
      const { manager, firewallsClient, operationManager } = createManager();

      // Simulate NOT_FOUND
      firewallsClient.get.mockRejectedValue(new Error("NOT_FOUND: firewall not found"));
      firewallsClient.insert.mockResolvedValue([{ name: "op-1" }]);

      await manager.ensureFirewall("test-fw", "test-vpc", [
        {
          protocol: "tcp",
          ports: ["80", "443"],
          sourceRanges: ["0.0.0.0/0"],
          targetTags: ["clawster-vm"],
          description: "Allow HTTP/HTTPS",
        },
      ]);

      expect(firewallsClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          project: "test-project",
          firewallResource: expect.objectContaining({
            name: "test-fw",
            allowed: [{ IPProtocol: "tcp", ports: ["80", "443"] }],
            sourceRanges: ["0.0.0.0/0"],
            targetTags: ["clawster-vm"],
          }),
        })
      );
      expect(operationManager.waitForOperation).toHaveBeenCalled();
    });
  });
});
