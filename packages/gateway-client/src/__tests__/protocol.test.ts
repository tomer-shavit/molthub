import {
  DEFAULT_GATEWAY_PORT,
  PROTOCOL_VERSION,
  GatewayErrorCode,
} from "../protocol";
import type {
  GatewayMessage,
  GatewayResponseSuccess,
  GatewayResponseError,
  ConnectFrame,
  ConnectResultSuccess,
  ConnectResultError,
  GatewayHealthSnapshot,
  GatewayStatusSummary,
  ConfigGetResult,
  ConfigApplyRequest,
  ConfigPatchRequest,
  SendRequest,
  AgentOutputEvent,
  PresenceEvent,
  ShutdownEvent,
  KeepaliveEvent,
  GatewayEvent,
  GatewayAuth,
  GatewayConnectionOptions,
  ReconnectOptions,
} from "../protocol";

describe("Protocol constants", () => {
  it("DEFAULT_GATEWAY_PORT is 18789", () => {
    expect(DEFAULT_GATEWAY_PORT).toBe(18789);
  });

  it("PROTOCOL_VERSION is 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe("GatewayErrorCode", () => {
  it("defines NOT_LINKED", () => {
    expect(GatewayErrorCode.NOT_LINKED).toBe("NOT_LINKED");
  });

  it("defines AGENT_TIMEOUT", () => {
    expect(GatewayErrorCode.AGENT_TIMEOUT).toBe("AGENT_TIMEOUT");
  });

  it("defines INVALID_REQUEST", () => {
    expect(GatewayErrorCode.INVALID_REQUEST).toBe("INVALID_REQUEST");
  });

  it("defines UNAVAILABLE", () => {
    expect(GatewayErrorCode.UNAVAILABLE).toBe("UNAVAILABLE");
  });

  it("has exactly 4 error codes", () => {
    const codes = Object.values(GatewayErrorCode);
    expect(codes).toHaveLength(4);
  });
});

describe("Message type structures", () => {
  it("GatewayMessage has required fields", () => {
    const msg: GatewayMessage = {
      id: "msg-1",
      method: "health",
      params: { deep: true },
    };
    expect(msg.id).toBe("msg-1");
    expect(msg.method).toBe("health");
    expect(msg.params).toEqual({ deep: true });
  });

  it("GatewayMessage works without params", () => {
    const msg: GatewayMessage = { id: "msg-2", method: "status" };
    expect(msg.params).toBeUndefined();
  });
});

describe("Connect frame structure", () => {
  it("ConnectFrame has correct shape", () => {
    const frame: ConnectFrame = {
      type: "connect",
      protocolVersion: { min: 1, max: 1 },
      auth: { mode: "token", token: "test-token" },
      clientMetadata: { name: "molthub", version: "0.1.0" },
      capabilities: ["health", "config"],
    };
    expect(frame.type).toBe("connect");
    expect(frame.protocolVersion.min).toBe(1);
    expect(frame.auth.mode).toBe("token");
  });

  it("ConnectResultSuccess has type 'connected'", () => {
    const result: ConnectResultSuccess = {
      type: "connected",
      presence: { users: [], stateVersion: 1 },
      health: { ok: true, channels: [], uptime: 3600 },
      stateVersion: 1,
    };
    expect(result.type).toBe("connected");
    expect(result.health.ok).toBe(true);
  });

  it("ConnectResultError has type 'error'", () => {
    const result: ConnectResultError = {
      type: "error",
      code: GatewayErrorCode.UNAVAILABLE,
      message: "Service unavailable",
    };
    expect(result.type).toBe("error");
    expect(result.code).toBe("UNAVAILABLE");
  });
});

describe("Response types", () => {
  it("success response has result", () => {
    const response: GatewayResponseSuccess = {
      id: "resp-1",
      result: { ok: true },
    };
    expect(response.result).toEqual({ ok: true });
    expect(response.error).toBeUndefined();
  });

  it("error response has error", () => {
    const response: GatewayResponseError = {
      id: "resp-2",
      error: {
        code: GatewayErrorCode.INVALID_REQUEST,
        message: "Bad request",
      },
    };
    expect(response.error.code).toBe("INVALID_REQUEST");
    expect(response.result).toBeUndefined();
  });
});

describe("Health and status types", () => {
  it("GatewayHealthSnapshot has correct structure", () => {
    const snapshot: GatewayHealthSnapshot = {
      ok: true,
      channels: [
        { id: "ch-1", name: "whatsapp", type: "whatsapp", ok: true, latencyMs: 50 },
      ],
      uptime: 7200,
    };
    expect(snapshot.ok).toBe(true);
    expect(snapshot.channels).toHaveLength(1);
    expect(snapshot.uptime).toBe(7200);
  });

  it("GatewayStatusSummary has correct structure", () => {
    const status: GatewayStatusSummary = {
      state: "running",
      version: "1.2.3",
      configHash: "abc123def",
    };
    expect(status.state).toBe("running");
  });
});

describe("Config types", () => {
  it("ConfigGetResult has config and hash", () => {
    const result: ConfigGetResult = {
      config: { gateway: { port: 18789 } },
      hash: "sha256-hash",
    };
    expect(result.hash).toBe("sha256-hash");
  });

  it("ConfigApplyRequest has required fields", () => {
    const request: ConfigApplyRequest = {
      raw: '{"gateway":{"port":18789}}',
      baseHash: "old-hash",
      sessionKey: "session-1",
      restartDelayMs: 2000,
    };
    expect(request.raw).toBeDefined();
    expect(request.baseHash).toBe("old-hash");
  });

  it("ConfigPatchRequest has patch and baseHash", () => {
    const request: ConfigPatchRequest = {
      patch: { gateway: { port: 19000 } },
      baseHash: "current-hash",
    };
    expect(request.patch).toBeDefined();
  });
});

describe("Event types", () => {
  it("AgentOutputEvent has seq for gap detection", () => {
    const event: AgentOutputEvent = {
      type: "agentOutput",
      requestId: "req-1",
      seq: 1,
      chunk: "Hello, world!",
    };
    expect(event.type).toBe("agentOutput");
    expect(event.seq).toBe(1);
  });

  it("PresenceEvent has delta and stateVersion", () => {
    const event: PresenceEvent = {
      type: "presence",
      delta: {
        joined: [{ id: "user-1", name: "Alice", status: "online" }],
        left: ["user-2"],
      },
      stateVersion: 42,
    };
    expect(event.type).toBe("presence");
    expect(event.delta.joined).toHaveLength(1);
  });

  it("ShutdownEvent has reason and grace period", () => {
    const event: ShutdownEvent = {
      type: "shutdown",
      reason: "restart",
      gracePeriodMs: 5000,
    };
    expect(event.type).toBe("shutdown");
  });

  it("KeepaliveEvent has timestamp", () => {
    const event: KeepaliveEvent = {
      type: "keepalive",
      timestamp: Date.now(),
    };
    expect(event.type).toBe("keepalive");
  });
});

describe("Auth types", () => {
  it("token auth mode", () => {
    const auth: GatewayAuth = { mode: "token", token: "my-secret" };
    expect(auth.mode).toBe("token");
  });

  it("password auth mode", () => {
    const auth: GatewayAuth = { mode: "password", password: "my-password" };
    expect(auth.mode).toBe("password");
  });
});

describe("Connection options", () => {
  it("GatewayConnectionOptions has required fields", () => {
    const options: GatewayConnectionOptions = {
      host: "localhost",
      port: 18789,
      auth: { mode: "token", token: "test" },
    };
    expect(options.host).toBe("localhost");
    expect(options.port).toBe(18789);
  });

  it("ReconnectOptions has all fields", () => {
    const reconnect: ReconnectOptions = {
      enabled: true,
      maxAttempts: 10,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
    };
    expect(reconnect.enabled).toBe(true);
  });
});

describe("Message serialization", () => {
  it("GatewayMessage can be JSON serialized", () => {
    const msg: GatewayMessage = {
      id: "test-id",
      method: "health",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe("test-id");
    expect(parsed.method).toBe("health");
  });

  it("ConnectFrame can be JSON serialized", () => {
    const frame: ConnectFrame = {
      type: "connect",
      protocolVersion: { min: 1, max: 1 },
      auth: { mode: "token", token: "test" },
    };
    const json = JSON.stringify(frame);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe("connect");
    expect(parsed.auth.token).toBe("test");
  });

  it("Events can be JSON deserialized", () => {
    const eventJson = '{"type":"agentOutput","requestId":"r1","seq":0,"chunk":"hi"}';
    const event = JSON.parse(eventJson) as GatewayEvent;
    expect(event.type).toBe("agentOutput");
  });
});
