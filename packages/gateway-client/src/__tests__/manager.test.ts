import { GatewayManager } from "../manager";
import { GatewayClient } from "../client";
import type { GatewayConnectionOptions } from "../protocol";

// Mock GatewayClient
jest.mock("../client", () => {
  return {
    GatewayClient: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue({
        type: "connected",
        presence: { users: [], stateVersion: 1 },
        health: { ok: true, channels: [], uptime: 100 },
        stateVersion: 1,
      }),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
    })),
  };
});

function createOptions(port = 18789): GatewayConnectionOptions {
  return {
    host: "localhost",
    port,
    auth: { mode: "token", token: "test-token" },
  };
}

describe("GatewayManager", () => {
  let manager: GatewayManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new GatewayManager();
  });

  describe("getClient", () => {
    it("creates a new client for unknown instanceId", async () => {
      const client = await manager.getClient("instance-1", createOptions());
      expect(client).toBeDefined();
      expect(client.connect).toHaveBeenCalled();
    });

    it("returns the same client for known connected instanceId", async () => {
      const client1 = await manager.getClient("instance-1", createOptions());
      const client2 = await manager.getClient("instance-1", createOptions());
      expect(client1).toBe(client2);
      // connect should only be called once
      expect(client1.connect).toHaveBeenCalledTimes(1);
    });

    it("creates a new client when existing client is disconnected", async () => {
      const client1 = await manager.getClient("instance-1", createOptions());
      // Simulate disconnection
      (client1.isConnected as jest.Mock).mockReturnValue(false);

      const client2 = await manager.getClient("instance-1", createOptions());
      expect(client2).not.toBe(client1);
      expect(client1.disconnect).toHaveBeenCalled();
    });

    it("creates separate clients for different instances", async () => {
      const client1 = await manager.getClient("instance-1", createOptions(18789));
      const client2 = await manager.getClient("instance-2", createOptions(18809));
      expect(client1).not.toBe(client2);
    });
  });

  describe("removeClient", () => {
    it("disconnects and removes the client", async () => {
      const client = await manager.getClient("instance-1", createOptions());
      manager.removeClient("instance-1");
      expect(client.disconnect).toHaveBeenCalled();
    });

    it("does nothing for unknown instanceId", () => {
      // Should not throw
      manager.removeClient("unknown");
    });

    it("creates a new client after removal", async () => {
      const client1 = await manager.getClient("instance-1", createOptions());
      manager.removeClient("instance-1");

      const client2 = await manager.getClient("instance-1", createOptions());
      expect(client2).not.toBe(client1);
    });
  });

  describe("getConnectedInstances", () => {
    it("returns empty array when no clients", () => {
      expect(manager.getConnectedInstances()).toEqual([]);
    });

    it("returns connected instance IDs", async () => {
      await manager.getClient("instance-1", createOptions(18789));
      await manager.getClient("instance-2", createOptions(18809));

      const connected = manager.getConnectedInstances();
      expect(connected).toContain("instance-1");
      expect(connected).toContain("instance-2");
      expect(connected).toHaveLength(2);
    });

    it("excludes disconnected instances", async () => {
      const client1 = await manager.getClient("instance-1", createOptions(18789));
      await manager.getClient("instance-2", createOptions(18809));

      // Simulate disconnection of instance-1
      (client1.isConnected as jest.Mock).mockReturnValue(false);

      const connected = manager.getConnectedInstances();
      expect(connected).not.toContain("instance-1");
      expect(connected).toContain("instance-2");
      expect(connected).toHaveLength(1);
    });
  });

  describe("disconnectAll", () => {
    it("disconnects all clients", async () => {
      const client1 = await manager.getClient("instance-1", createOptions(18789));
      const client2 = await manager.getClient("instance-2", createOptions(18809));

      await manager.disconnectAll();

      expect(client1.disconnect).toHaveBeenCalled();
      expect(client2.disconnect).toHaveBeenCalled();
    });

    it("clears the pool after disconnect", async () => {
      await manager.getClient("instance-1", createOptions());
      await manager.disconnectAll();

      expect(manager.getConnectedInstances()).toEqual([]);
    });
  });
});
