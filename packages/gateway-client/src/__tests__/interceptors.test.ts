// ---------------------------------------------------------------------------
// Interceptor Tests — Comprehensive coverage for all interceptors
// ---------------------------------------------------------------------------

import { InterceptorChain } from "../interceptors/chain";
import { LoggerInterceptor } from "../interceptors/logger";
import { ErrorTransformerInterceptor } from "../interceptors/error-transformer";
import { TelemetryInterceptor } from "../interceptors/telemetry";
import type {
  GatewayInterceptor,
  OutboundMessage,
  InboundMessage,
  GatewayInterceptorEvent,
  ErrorContext,
} from "../interceptors/interface";

// ---- Helpers ----------------------------------------------------------------

function makeOutbound(overrides?: Partial<OutboundMessage>): OutboundMessage {
  return {
    method: "health",
    id: "req-1",
    ...overrides,
  };
}

function makeInbound(overrides?: Partial<InboundMessage>): InboundMessage {
  return {
    id: "req-1",
    result: { ok: true },
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<GatewayInterceptorEvent>): GatewayInterceptorEvent {
  return {
    type: "keepalive",
    data: { timestamp: Date.now() },
    ...overrides,
  };
}

// ---- InterceptorChain -------------------------------------------------------

describe("InterceptorChain", () => {
  describe("constructor and management", () => {
    it("should start empty with no interceptors", () => {
      const chain = new InterceptorChain();
      expect(chain.length).toBe(0);
    });

    it("should accept initial interceptors", () => {
      const chain = new InterceptorChain([
        { name: "a" },
        { name: "b" },
      ]);
      expect(chain.length).toBe(2);
    });

    it("should add interceptors", () => {
      const chain = new InterceptorChain();
      chain.add({ name: "test" });
      expect(chain.length).toBe(1);
    });

    it("should remove interceptors by name", () => {
      const chain = new InterceptorChain([{ name: "a" }, { name: "b" }]);
      const removed = chain.remove("a");
      expect(removed).toBe(true);
      expect(chain.length).toBe(1);
    });

    it("should return false when removing non-existent interceptor", () => {
      const chain = new InterceptorChain();
      expect(chain.remove("nonexistent")).toBe(false);
    });
  });

  describe("processOutbound", () => {
    it("should pass message through interceptors in order", async () => {
      const order: string[] = [];
      const chain = new InterceptorChain([
        {
          name: "first",
          async onOutbound(msg) {
            order.push("first");
            return msg;
          },
        },
        {
          name: "second",
          async onOutbound(msg) {
            order.push("second");
            return msg;
          },
        },
      ]);

      await chain.processOutbound(makeOutbound());
      expect(order).toEqual(["first", "second"]);
    });

    it("should short-circuit when interceptor returns null", async () => {
      const order: string[] = [];
      const chain = new InterceptorChain([
        {
          name: "blocker",
          async onOutbound() {
            order.push("blocker");
            return null;
          },
        },
        {
          name: "never-called",
          async onOutbound(msg) {
            order.push("never-called");
            return msg;
          },
        },
      ]);

      const result = await chain.processOutbound(makeOutbound());
      expect(result).toBeNull();
      expect(order).toEqual(["blocker"]);
    });

    it("should allow interceptors to transform the message", async () => {
      const chain = new InterceptorChain([
        {
          name: "transformer",
          async onOutbound(msg) {
            return { ...msg, method: "status" };
          },
        },
      ]);

      const result = await chain.processOutbound(makeOutbound({ method: "health" }));
      expect(result?.method).toBe("status");
    });

    it("should handle interceptor errors gracefully", async () => {
      const chain = new InterceptorChain([
        {
          name: "thrower",
          async onOutbound() {
            throw new Error("boom");
          },
        },
      ]);

      // Should not throw — error is passed to processError
      const result = await chain.processOutbound(makeOutbound());
      // On error, processing stops but returns the last valid message
      expect(result).not.toBeNull();
    });

    it("should skip interceptors without onOutbound", async () => {
      const chain = new InterceptorChain([
        { name: "no-outbound" },
        {
          name: "has-outbound",
          async onOutbound(msg) {
            return { ...msg, method: "modified" };
          },
        },
      ]);

      const result = await chain.processOutbound(makeOutbound());
      expect(result?.method).toBe("modified");
    });
  });

  describe("processInbound", () => {
    it("should pass message through interceptors in order", async () => {
      const order: string[] = [];
      const chain = new InterceptorChain([
        {
          name: "first",
          async onInbound(msg) {
            order.push("first");
            return msg;
          },
        },
        {
          name: "second",
          async onInbound(msg) {
            order.push("second");
            return msg;
          },
        },
      ]);

      await chain.processInbound(makeInbound());
      expect(order).toEqual(["first", "second"]);
    });

    it("should allow interceptors to transform inbound message", async () => {
      const chain = new InterceptorChain([
        {
          name: "transformer",
          async onInbound(msg) {
            return { ...msg, result: { transformed: true } };
          },
        },
      ]);

      const result = await chain.processInbound(makeInbound());
      expect(result.result).toEqual({ transformed: true });
    });

    it("should handle interceptor errors gracefully", async () => {
      const chain = new InterceptorChain([
        {
          name: "thrower",
          async onInbound() {
            throw new Error("boom");
          },
        },
      ]);

      // Should not throw
      const result = await chain.processInbound(makeInbound());
      expect(result).toBeDefined();
    });
  });

  describe("processEvent", () => {
    it("should call all interceptors for events", async () => {
      const called: string[] = [];
      const chain = new InterceptorChain([
        {
          name: "a",
          async onEvent() {
            called.push("a");
          },
        },
        {
          name: "b",
          async onEvent() {
            called.push("b");
          },
        },
      ]);

      await chain.processEvent(makeEvent());
      expect(called).toEqual(["a", "b"]);
    });

    it("should continue calling remaining interceptors after error", async () => {
      const called: string[] = [];
      const chain = new InterceptorChain([
        {
          name: "thrower",
          async onEvent() {
            called.push("thrower");
            throw new Error("boom");
          },
        },
        {
          name: "survivor",
          async onEvent() {
            called.push("survivor");
          },
        },
      ]);

      await chain.processEvent(makeEvent());
      expect(called).toEqual(["thrower", "survivor"]);
    });
  });

  describe("processError", () => {
    it("should call all error handlers", async () => {
      const called: string[] = [];
      const chain = new InterceptorChain([
        {
          name: "a",
          async onError() {
            called.push("a");
          },
        },
        {
          name: "b",
          async onError() {
            called.push("b");
          },
        },
      ]);

      await chain.processError(new Error("test"), { phase: "outbound" });
      expect(called).toEqual(["a", "b"]);
    });

    it("should swallow errors in error handlers", async () => {
      const chain = new InterceptorChain([
        {
          name: "double-thrower",
          async onError() {
            throw new Error("meta-boom");
          },
        },
      ]);

      // Should not throw
      await chain.processError(new Error("test"), { phase: "outbound" });
    });
  });
});

// ---- LoggerInterceptor ------------------------------------------------------

describe("LoggerInterceptor", () => {
  it("should log outbound with method and id", async () => {
    const logs: string[] = [];
    const logger = new LoggerInterceptor({ logFn: (msg) => logs.push(msg) });

    await logger.onOutbound!(makeOutbound({ method: "health", id: "r1" }));

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("[GW:OUT]");
    expect(logs[0]).toContain("method=health");
    expect(logs[0]).toContain("id=r1");
  });

  it("should include params in verbose mode", async () => {
    const logs: string[] = [];
    const logger = new LoggerInterceptor({ verbose: true, logFn: (msg) => logs.push(msg) });

    await logger.onOutbound!(makeOutbound({ params: { key: "val" } }));

    expect(logs[0]).toContain("params=");
    expect(logs[0]).toContain("key");
  });

  it("should NOT include params in non-verbose mode", async () => {
    const logs: string[] = [];
    const logger = new LoggerInterceptor({ logFn: (msg) => logs.push(msg) });

    await logger.onOutbound!(makeOutbound({ params: { key: "val" } }));

    expect(logs[0]).not.toContain("params=");
  });

  it("should log inbound with ok status", async () => {
    const logs: string[] = [];
    const logger = new LoggerInterceptor({ logFn: (msg) => logs.push(msg) });

    await logger.onInbound!(makeInbound());

    expect(logs[0]).toContain("[GW:IN]");
    expect(logs[0]).toContain("ok=true");
  });

  it("should log inbound error with ok=false", async () => {
    const logs: string[] = [];
    const logger = new LoggerInterceptor({ logFn: (msg) => logs.push(msg) });

    await logger.onInbound!(makeInbound({
      result: undefined,
      error: { code: -32001, message: "Not linked" },
    }));

    expect(logs[0]).toContain("ok=false");
  });

  it("should log events with type", async () => {
    const logs: string[] = [];
    const logger = new LoggerInterceptor({ logFn: (msg) => logs.push(msg) });

    await logger.onEvent!(makeEvent({ type: "presence" }));

    expect(logs[0]).toContain("[GW:EVT]");
    expect(logs[0]).toContain("type=presence");
  });

  it("should log errors with phase", async () => {
    const logs: string[] = [];
    const logger = new LoggerInterceptor({ logFn: (msg) => logs.push(msg) });

    await logger.onError!(new Error("test error"), { phase: "outbound" });

    expect(logs[0]).toContain("[GW:ERR]");
    expect(logs[0]).toContain("phase=outbound");
    expect(logs[0]).toContain("error=test error");
  });

  it("should truncate long bodies", async () => {
    const logs: string[] = [];
    const logger = new LoggerInterceptor({
      verbose: true,
      maxBodyLength: 20,
      logFn: (msg) => logs.push(msg),
    });

    await logger.onOutbound!(makeOutbound({
      params: { longKey: "a".repeat(100) },
    }));

    expect(logs[0]).toContain("...(truncated)");
  });

  it("should return message unchanged", async () => {
    const logger = new LoggerInterceptor({ logFn: () => {} });
    const msg = makeOutbound({ method: "test", id: "x" });
    const result = await logger.onOutbound!(msg);
    expect(result).toEqual(msg);
  });
});

// ---- ErrorTransformerInterceptor --------------------------------------------

describe("ErrorTransformerInterceptor", () => {
  it("should pass through successful messages unchanged", async () => {
    const transformer = new ErrorTransformerInterceptor();
    const msg = makeInbound({ result: { ok: true } });
    const result = await transformer.onInbound!(msg);
    expect(result).toEqual(msg);
  });

  it("should transform -32001 error to friendly message", async () => {
    const transformer = new ErrorTransformerInterceptor();
    const msg = makeInbound({
      result: undefined,
      error: { code: -32001, message: "NOT_LINKED" },
    });

    const result = await transformer.onInbound!(msg);
    expect(result.error?.message).toBe("Bot is not connected to Gateway. Check deployment status.");
    expect(result.error?.originalError?.message).toBe("NOT_LINKED");
    expect(result.error?.originalError?.code).toBe(-32001);
  });

  it("should transform -32002 error (timeout)", async () => {
    const transformer = new ErrorTransformerInterceptor();
    const msg = makeInbound({
      result: undefined,
      error: { code: -32002, message: "AGENT_TIMEOUT" },
    });

    const result = await transformer.onInbound!(msg);
    expect(result.error?.message).toBe("Agent operation timed out.");
  });

  it("should transform -32600 error (invalid request)", async () => {
    const transformer = new ErrorTransformerInterceptor();
    const msg = makeInbound({
      result: undefined,
      error: { code: -32600, message: "INVALID_REQUEST" },
    });

    const result = await transformer.onInbound!(msg);
    expect(result.error?.message).toBe("Invalid request format.");
  });

  it("should transform -32003 error (unavailable)", async () => {
    const transformer = new ErrorTransformerInterceptor();
    const msg = makeInbound({
      result: undefined,
      error: { code: -32003, message: "UNAVAILABLE" },
    });

    const result = await transformer.onInbound!(msg);
    expect(result.error?.message).toBe("Gateway is temporarily unavailable.");
  });

  it("should preserve unknown error codes unchanged", async () => {
    const transformer = new ErrorTransformerInterceptor();
    const msg = makeInbound({
      result: undefined,
      error: { code: -99999, message: "Unknown" },
    });

    const result = await transformer.onInbound!(msg);
    expect(result.error?.message).toBe("Unknown");
    expect(result.error?.originalError).toBeUndefined();
  });

  it("should allow custom error map overrides", async () => {
    const transformer = new ErrorTransformerInterceptor({
      errorMap: { [-32001]: "Custom not linked message" },
    });

    const msg = makeInbound({
      result: undefined,
      error: { code: -32001, message: "NOT_LINKED" },
    });

    const result = await transformer.onInbound!(msg);
    expect(result.error?.message).toBe("Custom not linked message");
  });

  it("should preserve original error in originalError field", async () => {
    const transformer = new ErrorTransformerInterceptor();
    const msg = makeInbound({
      result: undefined,
      error: { code: -32001, message: "Original message" },
    });

    const result = await transformer.onInbound!(msg);
    expect(result.error?.originalError).toEqual({
      code: -32001,
      message: "Original message",
    });
  });
});

// ---- TelemetryInterceptor ---------------------------------------------------

describe("TelemetryInterceptor", () => {
  it("should track outbound/inbound request counts", async () => {
    const telemetry = new TelemetryInterceptor();

    await telemetry.onOutbound!(makeOutbound({ method: "health", id: "r1" }));
    await telemetry.onInbound!(makeInbound({ id: "r1" }));

    const metrics = telemetry.getMetrics();
    expect(metrics["health"]).toBeDefined();
    expect(metrics["health"].count).toBe(1);
    expect(metrics["health"].errorCount).toBe(0);
  });

  it("should track error counts", async () => {
    const telemetry = new TelemetryInterceptor();

    await telemetry.onOutbound!(makeOutbound({ method: "send", id: "r1" }));
    await telemetry.onInbound!(makeInbound({
      id: "r1",
      result: undefined,
      error: { code: -32001, message: "err" },
    }));

    const metrics = telemetry.getMetrics();
    expect(metrics["send"].errorCount).toBe(1);
  });

  it("should track latency", async () => {
    const telemetry = new TelemetryInterceptor();

    await telemetry.onOutbound!(makeOutbound({ method: "health", id: "r1" }));
    // Small delay to ensure measurable latency
    await new Promise((resolve) => setTimeout(resolve, 10));
    await telemetry.onInbound!(makeInbound({ id: "r1" }));

    const metrics = telemetry.getMetrics();
    expect(metrics["health"].totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("should compute p95 latency", async () => {
    const telemetry = new TelemetryInterceptor({ bufferSize: 10 });

    // Send 10 requests with varying "latencies"
    for (let i = 0; i < 10; i++) {
      const id = `r-${i}`;
      await telemetry.onOutbound!(makeOutbound({ method: "health", id }));
      await telemetry.onInbound!(makeInbound({ id }));
    }

    const metrics = telemetry.getMetrics();
    expect(metrics["health"].p95LatencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics["health"].count).toBe(10);
  });

  it("should track multiple methods independently", async () => {
    const telemetry = new TelemetryInterceptor();

    await telemetry.onOutbound!(makeOutbound({ method: "health", id: "r1" }));
    await telemetry.onInbound!(makeInbound({ id: "r1" }));

    await telemetry.onOutbound!(makeOutbound({ method: "status", id: "r2" }));
    await telemetry.onInbound!(makeInbound({ id: "r2" }));

    const metrics = telemetry.getMetrics();
    expect(metrics["health"].count).toBe(1);
    expect(metrics["status"].count).toBe(1);
  });

  it("should ignore inbound without matching outbound", async () => {
    const telemetry = new TelemetryInterceptor();

    await telemetry.onInbound!(makeInbound({ id: "unknown" }));

    const metrics = telemetry.getMetrics();
    expect(Object.keys(metrics)).toHaveLength(0);
  });

  it("should reset metrics", async () => {
    const telemetry = new TelemetryInterceptor();

    await telemetry.onOutbound!(makeOutbound({ method: "health", id: "r1" }));
    await telemetry.onInbound!(makeInbound({ id: "r1" }));

    expect(Object.keys(telemetry.getMetrics())).toHaveLength(1);

    telemetry.resetMetrics();

    expect(Object.keys(telemetry.getMetrics())).toHaveLength(0);
  });

  it("should return message unchanged", async () => {
    const telemetry = new TelemetryInterceptor();
    const outbound = makeOutbound();
    const inbound = makeInbound();

    const outResult = await telemetry.onOutbound!(outbound);
    const inResult = await telemetry.onInbound!(inbound);

    expect(outResult).toEqual(outbound);
    expect(inResult).toEqual(inbound);
  });
});



// ---- Full chain integration -------------------------------------------------

describe("Full chain integration", () => {
  it("should run logger + error-transformer + telemetry together", async () => {
    const logs: string[] = [];
    const chain = new InterceptorChain([
      new LoggerInterceptor({ logFn: (msg) => logs.push(msg) }),
      new ErrorTransformerInterceptor(),
      new TelemetryInterceptor(),
    ]);

    const outbound = makeOutbound({ method: "health", id: "r1" });
    const processedOut = await chain.processOutbound(outbound);
    expect(processedOut).not.toBeNull();

    const inbound = makeInbound({ id: "r1" });
    const processedIn = await chain.processInbound(inbound);
    expect(processedIn.result).toEqual({ ok: true });

    // Logger should have logged both outbound and inbound
    expect(logs.some((l) => l.includes("[GW:OUT]"))).toBe(true);
    expect(logs.some((l) => l.includes("[GW:IN]"))).toBe(true);
  });

  it("should transform errors and log them", async () => {
    const logs: string[] = [];
    const chain = new InterceptorChain([
      new LoggerInterceptor({ logFn: (msg) => logs.push(msg) }),
      new ErrorTransformerInterceptor(),
    ]);

    const inbound = makeInbound({
      id: "r1",
      result: undefined,
      error: { code: -32001, message: "NOT_LINKED" },
    });

    const result = await chain.processInbound(inbound);

    // Error transformer should have mapped the message
    expect(result.error?.message).toBe("Bot is not connected to Gateway. Check deployment status.");
    // Logger should have logged
    expect(logs.some((l) => l.includes("[GW:IN]"))).toBe(true);
  });

  it("should run all three interceptors together", async () => {
    const logs: string[] = [];

    const chain = new InterceptorChain([
      new LoggerInterceptor({ logFn: (msg) => logs.push(msg) }),
      new ErrorTransformerInterceptor(),
      new TelemetryInterceptor(),
    ]);

    await chain.processOutbound(makeOutbound({ method: "config.apply", id: "r1" }));
    await chain.processInbound(makeInbound({ id: "r1", result: { success: true } }));

    await chain.processOutbound(makeOutbound({ method: "health", id: "r2" }));
    await chain.processInbound(makeInbound({ id: "r2" }));

    // Logger: 4 log lines (2 outbound + 2 inbound)
    expect(logs.filter((l) => l.includes("[GW:OUT]"))).toHaveLength(2);
    expect(logs.filter((l) => l.includes("[GW:IN]"))).toHaveLength(2);
  });

  it("should process events through all interceptors", async () => {
    const logs: string[] = [];
    const chain = new InterceptorChain([
      new LoggerInterceptor({ logFn: (msg) => logs.push(msg) }),
    ]);

    await chain.processEvent(makeEvent({ type: "shutdown" }));
    expect(logs.some((l) => l.includes("[GW:EVT]") && l.includes("type=shutdown"))).toBe(true);
  });
});
