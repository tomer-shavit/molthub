// ---------------------------------------------------------------------------
// GatewayClient Tests — mock WebSocket server
// ---------------------------------------------------------------------------

import WebSocket, { WebSocketServer } from "ws";
import { GatewayClient } from "../client";
import { GatewayManager } from "../manager";
import {
  GatewayConnectionError,
  GatewayTimeoutError,
  GatewayAuthError,
  GatewayError,
} from "../errors";
import type {
  GatewayConnectionOptions,
  ConnectFrame,
  GatewayMessage,
  ConnectResultSuccess,
  GatewayHealthSnapshot,
  GatewayStatusSummary,
  ConfigGetResult,
  ConfigApplyResult,
  ConfigPatchResult,
  SendResult,
  AgentOutputEvent,
} from "../protocol";
import { GatewayErrorCode } from "../protocol";

// ---- Helpers --------------------------------------------------------------

let wss: WebSocketServer;
let serverPort: number;

function defaultOptions(overrides?: Partial<GatewayConnectionOptions>): GatewayConnectionOptions {
  return {
    host: "127.0.0.1",
    port: serverPort,
    auth: { mode: "token", token: "test-token" },
    timeoutMs: 5_000,
    reconnect: { enabled: false, maxAttempts: 0, baseDelayMs: 100, maxDelayMs: 500 },
    ...overrides,
  };
}

const connectSuccess: ConnectResultSuccess = {
  type: "connected",
  presence: { users: [], stateVersion: 1 },
  health: { ok: true, channels: [], uptime: 100 },
  stateVersion: 1,
};

function startServer(handler?: (ws: WebSocket, msg: string) => void): Promise<void> {
  return new Promise((resolve) => {
    wss = new WebSocketServer({ port: 0 }, () => {
      const addr = wss.address();
      serverPort = typeof addr === "object" && addr !== null ? addr.port : 0;
      resolve();
    });

    wss.on("connection", (ws) => {
      // First message is always the connect frame
      ws.once("message", (raw) => {
        const frame = JSON.parse(raw.toString()) as ConnectFrame;
        // Default: accept the connection
        if (frame.type === "connect") {
          ws.send(JSON.stringify(connectSuccess));
        }

        // Subsequent messages handled by optional handler
        if (handler) {
          ws.on("message", (msg) => handler(ws, msg.toString()));
        }
      });
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!wss) {
      resolve();
      return;
    }
    // Close all connections
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close(() => resolve());
  });
}

// ---- Tests ----------------------------------------------------------------

afterEach(async () => {
  await stopServer();
});

describe("GatewayClient", () => {
  // ---- Connect handshake ------------------------------------------------

  describe("connect handshake", () => {
    it("should complete handshake and return connect result", async () => {
      await startServer();
      const client = new GatewayClient(defaultOptions());
      const result = await client.connect();

      expect(result.type).toBe("connected");
      expect((result as ConnectResultSuccess).health.ok).toBe(true);
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
    });

    it("should send correct auth token in connect frame", async () => {
      let receivedFrame: ConnectFrame | null = null;

      await new Promise<void>((resolve) => {
        wss = new WebSocketServer({ port: 0 }, () => {
          serverPort = (wss.address() as WebSocket.AddressInfo).port;
          resolve();
        });

        wss.on("connection", (ws) => {
          ws.once("message", (raw) => {
            receivedFrame = JSON.parse(raw.toString());
            ws.send(JSON.stringify(connectSuccess));
          });
        });
      });

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      expect(receivedFrame).not.toBeNull();
      expect(receivedFrame!.auth).toEqual({ mode: "token", token: "test-token" });

      await client.disconnect();
    });

    it("should send password auth when configured", async () => {
      let receivedFrame: ConnectFrame | null = null;

      await new Promise<void>((resolve) => {
        wss = new WebSocketServer({ port: 0 }, () => {
          serverPort = (wss.address() as WebSocket.AddressInfo).port;
          resolve();
        });

        wss.on("connection", (ws) => {
          ws.once("message", (raw) => {
            receivedFrame = JSON.parse(raw.toString());
            ws.send(JSON.stringify(connectSuccess));
          });
        });
      });

      const client = new GatewayClient(
        defaultOptions({ auth: { mode: "password", password: "secret" } }),
      );
      await client.connect();

      expect(receivedFrame!.auth).toEqual({ mode: "password", password: "secret" });

      await client.disconnect();
    });
  });

  // ---- Health method ----------------------------------------------------

  describe("health method", () => {
    it("should return health snapshot", async () => {
      const healthData: GatewayHealthSnapshot = {
        ok: true,
        channels: [{ id: "ch1", name: "slack", type: "slack", ok: true, latencyMs: 42 }],
        uptime: 3600,
      };

      await startServer((ws, msg) => {
        const parsed = JSON.parse(msg) as GatewayMessage;
        if (parsed.method === "health") {
          ws.send(JSON.stringify({ id: parsed.id, result: healthData }));
        }
      });

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const result = await client.health();
      expect(result.ok).toBe(true);
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].name).toBe("slack");
      expect(result.uptime).toBe(3600);

      await client.disconnect();
    });
  });

  // ---- Status method ----------------------------------------------------

  describe("status method", () => {
    it("should return status summary", async () => {
      const statusData: GatewayStatusSummary = {
        state: "running",
        version: "1.2.3",
        configHash: "abc123",
      };

      await startServer((ws, msg) => {
        const parsed = JSON.parse(msg) as GatewayMessage;
        if (parsed.method === "status") {
          ws.send(JSON.stringify({ id: parsed.id, result: statusData }));
        }
      });

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const result = await client.status();
      expect(result.state).toBe("running");
      expect(result.configHash).toBe("abc123");

      await client.disconnect();
    });
  });

  // ---- Config get/apply/patch -------------------------------------------

  describe("config methods", () => {
    it("should get config with hash", async () => {
      const configData: ConfigGetResult = {
        config: { gateway: { port: 18789 } },
        hash: "hash-abc",
      };

      await startServer((ws, msg) => {
        const parsed = JSON.parse(msg) as GatewayMessage;
        if (parsed.method === "config.get") {
          ws.send(JSON.stringify({ id: parsed.id, result: configData }));
        }
      });

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const result = await client.configGet();
      expect(result.hash).toBe("hash-abc");
      expect(result.config).toEqual({ gateway: { port: 18789 } });

      await client.disconnect();
    });

    it("should apply config successfully", async () => {
      const applyResult: ConfigApplyResult = { success: true };

      await startServer((ws, msg) => {
        const parsed = JSON.parse(msg) as GatewayMessage;
        if (parsed.method === "config.apply") {
          ws.send(JSON.stringify({ id: parsed.id, result: applyResult }));
        }
      });

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const result = await client.configApply({
        raw: '{ gateway: { port: 9999 } }',
        baseHash: "hash-abc",
        sessionKey: "sess-1",
        restartDelayMs: 2000,
      });
      expect(result.success).toBe(true);

      await client.disconnect();
    });

    it("should return validation errors on bad config apply", async () => {
      const applyResult: ConfigApplyResult = {
        success: false,
        validationErrors: ["Invalid port value"],
      };

      await startServer((ws, msg) => {
        const parsed = JSON.parse(msg) as GatewayMessage;
        if (parsed.method === "config.apply") {
          ws.send(JSON.stringify({ id: parsed.id, result: applyResult }));
        }
      });

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const result = await client.configApply({ raw: "bad", baseHash: "hash-abc" });
      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain("Invalid port value");

      await client.disconnect();
    });

    it("should patch config", async () => {
      const patchResult: ConfigPatchResult = { success: true };

      await startServer((ws, msg) => {
        const parsed = JSON.parse(msg) as GatewayMessage;
        if (parsed.method === "config.patch") {
          ws.send(JSON.stringify({ id: parsed.id, result: patchResult }));
        }
      });

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const result = await client.configPatch({
        patch: { gateway: { port: 9999 } },
        baseHash: "hash-abc",
      });
      expect(result.success).toBe(true);

      await client.disconnect();
    });
  });

  // ---- Send method ------------------------------------------------------

  describe("send method", () => {
    it("should send a message and return result", async () => {
      const sendResult: SendResult = {
        messageId: "msg-1",
        channelId: "ch1",
        timestamp: "2025-01-01T00:00:00Z",
      };

      await startServer((ws, msg) => {
        const parsed = JSON.parse(msg) as GatewayMessage;
        if (parsed.method === "send") {
          ws.send(JSON.stringify({ id: parsed.id, result: sendResult }));
        }
      });

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const result = await client.send({ channelId: "ch1", content: "hello" });
      expect(result.messageId).toBe("msg-1");

      await client.disconnect();
    });
  });

  // ---- Event streaming --------------------------------------------------

  describe("event streaming", () => {
    it("should emit agentOutput events", async () => {
      await startServer((_ws) => {
        // no request handler needed
      });

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const eventPromise = new Promise<AgentOutputEvent>((resolve) => {
        client.on("agentOutput", resolve);
      });

      // Push event from server
      for (const ws of wss.clients) {
        ws.send(
          JSON.stringify({
            type: "agentOutput",
            requestId: "req-1",
            seq: 1,
            chunk: "Hello from agent",
          }),
        );
      }

      const event = await eventPromise;
      expect(event.type).toBe("agentOutput");
      expect(event.chunk).toBe("Hello from agent");
      expect(event.seq).toBe(1);

      await client.disconnect();
    });

    it("should emit presence events", async () => {
      await startServer();

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const eventPromise = new Promise<unknown>((resolve) => {
        client.on("presence", resolve);
      });

      for (const ws of wss.clients) {
        ws.send(
          JSON.stringify({
            type: "presence",
            delta: { joined: [{ id: "u1", name: "Alice", status: "online" }] },
            stateVersion: 2,
          }),
        );
      }

      const event = await eventPromise;
      expect(event).toHaveProperty("type", "presence");

      await client.disconnect();
    });

    it("should emit keepalive events", async () => {
      await startServer();

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const eventPromise = new Promise<void>((resolve) => {
        client.on("keepalive", resolve);
      });

      for (const ws of wss.clients) {
        ws.send(JSON.stringify({ type: "keepalive", timestamp: Date.now() }));
      }

      await eventPromise;
      await client.disconnect();
    });

    it("should emit shutdown events", async () => {
      await startServer();

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const eventPromise = new Promise<unknown>((resolve) => {
        client.on("shutdown", resolve);
      });

      for (const ws of wss.clients) {
        ws.send(
          JSON.stringify({
            type: "shutdown",
            reason: "maintenance",
            gracePeriodMs: 5000,
          }),
        );
      }

      const event = await eventPromise;
      expect(event).toHaveProperty("reason", "maintenance");

      await client.disconnect();
    });
  });

  // ---- Auto-reconnect ---------------------------------------------------

  describe("auto-reconnect", () => {
    it("should attempt reconnect on unexpected disconnect", async () => {
      await startServer();

      const client = new GatewayClient(
        defaultOptions({
          reconnect: { enabled: true, maxAttempts: 3, baseDelayMs: 50, maxDelayMs: 200 },
        }),
      );
      await client.connect();

      const reconnectPromise = new Promise<number>((resolve) => {
        client.on("reconnect", (attempt) => {
          resolve(attempt);
        });
      });

      // Force-close from server side
      for (const ws of wss.clients) {
        ws.close();
      }

      const attempt = await reconnectPromise;
      expect(attempt).toBe(1);

      // Clean up (disconnect will stop reconnect loop)
      await client.disconnect();
    });

    it("should emit disconnect event when connection is lost", async () => {
      await startServer();

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      const disconnectPromise = new Promise<void>((resolve) => {
        client.on("disconnect", resolve);
      });

      for (const ws of wss.clients) {
        ws.close();
      }

      await disconnectPromise;
      await client.disconnect();
    });
  });

  // ---- Auth failure handling --------------------------------------------

  describe("auth failure", () => {
    it("should reject with GatewayAuthError on auth failure", async () => {
      await new Promise<void>((resolve) => {
        wss = new WebSocketServer({ port: 0 }, () => {
          serverPort = (wss.address() as WebSocket.AddressInfo).port;
          resolve();
        });

        wss.on("connection", (ws) => {
          ws.once("message", () => {
            ws.send(
              JSON.stringify({
                type: "error",
                code: GatewayErrorCode.UNAVAILABLE,
                message: "Authentication failed",
              }),
            );
            ws.close();
          });
        });
      });

      const client = new GatewayClient(defaultOptions());

      await expect(client.connect()).rejects.toThrow(GatewayAuthError);
    });

    it("should reject with GatewayConnectionError on non-auth error", async () => {
      await new Promise<void>((resolve) => {
        wss = new WebSocketServer({ port: 0 }, () => {
          serverPort = (wss.address() as WebSocket.AddressInfo).port;
          resolve();
        });

        wss.on("connection", (ws) => {
          ws.once("message", () => {
            ws.send(
              JSON.stringify({
                type: "error",
                code: GatewayErrorCode.INVALID_REQUEST,
                message: "Bad protocol version",
              }),
            );
            ws.close();
          });
        });
      });

      const client = new GatewayClient(defaultOptions());

      await expect(client.connect()).rejects.toThrow(GatewayConnectionError);
    });
  });

  // ---- Timeout handling -------------------------------------------------

  describe("timeout handling", () => {
    it("should timeout if handshake takes too long", async () => {
      // Server that never responds to the connect frame
      await new Promise<void>((resolve) => {
        wss = new WebSocketServer({ port: 0 }, () => {
          serverPort = (wss.address() as WebSocket.AddressInfo).port;
          resolve();
        });

        wss.on("connection", () => {
          // intentionally do nothing
        });
      });

      const client = new GatewayClient(defaultOptions({ timeoutMs: 500 }));

      await expect(client.connect()).rejects.toThrow(GatewayTimeoutError);
    });

    it("should timeout if request takes too long", async () => {
      await startServer(() => {
        // intentionally never respond to requests
      });

      const client = new GatewayClient(defaultOptions({ timeoutMs: 500 }));
      await client.connect();

      await expect(client.health()).rejects.toThrow(GatewayTimeoutError);

      await client.disconnect();
    });
  });

  // ---- Error response handling ------------------------------------------

  describe("error responses", () => {
    it("should reject with GatewayError on error response", async () => {
      await startServer((ws, msg) => {
        const parsed = JSON.parse(msg) as GatewayMessage;
        ws.send(
          JSON.stringify({
            id: parsed.id,
            error: { code: GatewayErrorCode.NOT_LINKED, message: "No channels linked" },
          }),
        );
      });

      const client = new GatewayClient(defaultOptions());
      await client.connect();

      try {
        await client.send({ channelId: "ch1", content: "test" });
        fail("Expected error");
      } catch (err) {
        expect(err).toBeInstanceOf(GatewayError);
        expect((err as GatewayError).code).toBe(GatewayErrorCode.NOT_LINKED);
      }

      await client.disconnect();
    });
  });

  // ---- isConnected state ------------------------------------------------

  describe("isConnected", () => {
    it("should return false before connect", () => {
      const client = new GatewayClient(defaultOptions());
      expect(client.isConnected()).toBe(false);
    });

    it("should return false after disconnect", async () => {
      await startServer();
      const client = new GatewayClient(defaultOptions());
      await client.connect();
      expect(client.isConnected()).toBe(true);
      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  // ---- Methods when not connected ---------------------------------------

  describe("methods when not connected", () => {
    it("should throw when calling health on disconnected client", async () => {
      const client = new GatewayClient(defaultOptions());
      await expect(client.health()).rejects.toThrow(GatewayConnectionError);
    });
  });
});

// ---- GatewayManager tests -------------------------------------------------

describe("GatewayManager", () => {
  it("should create and cache a client for an instance", async () => {
    await startServer();

    const manager = new GatewayManager();
    const client = await manager.getClient("inst-1", defaultOptions());

    expect(client.isConnected()).toBe(true);
    expect(manager.getConnectedInstances()).toContain("inst-1");

    await manager.disconnectAll();
  });

  it("should return same client for same instance", async () => {
    await startServer();

    const manager = new GatewayManager();
    const client1 = await manager.getClient("inst-1", defaultOptions());
    const client2 = await manager.getClient("inst-1", defaultOptions());

    expect(client1).toBe(client2);

    await manager.disconnectAll();
  });

  it("should remove client from pool", async () => {
    await startServer();

    const manager = new GatewayManager();
    await manager.getClient("inst-1", defaultOptions());

    expect(manager.getConnectedInstances()).toHaveLength(1);

    manager.removeClient("inst-1");

    expect(manager.getConnectedInstances()).toHaveLength(0);

    await manager.disconnectAll();
  });

  it("should disconnect all clients", async () => {
    await startServer();

    const manager = new GatewayManager();
    await manager.getClient("inst-1", defaultOptions());
    await manager.getClient("inst-2", defaultOptions());

    expect(manager.getConnectedInstances()).toHaveLength(2);

    await manager.disconnectAll();

    expect(manager.getConnectedInstances()).toHaveLength(0);
  });
});
