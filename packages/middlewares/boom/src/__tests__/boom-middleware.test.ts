import type { WsFrame } from "@clawster/middleware-sdk";
import { BoomMiddleware } from "../boom-middleware";

function makeFrame(parsed: Record<string, unknown>): WsFrame {
  return { raw: JSON.stringify(parsed), parsed };
}

function completionFrame(text: string, extra: Record<string, unknown> = {}): WsFrame {
  return makeFrame({
    type: "res",
    id: "test-id",
    ok: true,
    payload: {
      runId: "run-1",
      status: "completed",
      result: { payloads: [{ text, ...extra }] },
    },
  });
}

describe("BoomMiddleware", () => {
  let boom: BoomMiddleware;

  beforeEach(() => {
    boom = new BoomMiddleware();
  });

  it("has name 'boom'", () => {
    expect(boom.name).toBe("boom");
  });

  it('appends " BOOM" to agent completion response text', async () => {
    const frame = completionFrame("Hello there!");

    const result = await boom.onResponse(frame);

    expect(result.action).toBe("modify");
    if (result.action === "modify") {
      const payload = result.data.parsed.payload as Record<string, unknown>;
      const res = payload.result as Record<string, unknown>;
      const payloads = res.payloads as Array<{ text: string }>;
      expect(payloads[0].text).toBe("Hello there! BOOM");
    }
  });

  it("does NOT modify ack responses (status: accepted)", async () => {
    const frame = makeFrame({
      type: "res",
      id: "test-id",
      ok: true,
      payload: { runId: "run-1", status: "accepted", acceptedAt: 123 },
    });

    const result = await boom.onResponse(frame);

    expect(result.action).toBe("pass");
  });

  it("does NOT modify error responses (ok: false)", async () => {
    const frame = makeFrame({
      type: "res",
      id: "test-id",
      ok: false,
      error: { code: "FAILED", message: "something broke" },
    });

    const result = await boom.onResponse(frame);

    expect(result.action).toBe("pass");
  });

  it("does NOT modify event frames", async () => {
    const frame = makeFrame({
      type: "event",
      event: "agentOutput",
      payload: { requestId: "req-1", seq: 0, chunk: "hello" },
    });

    const result = await boom.onResponse(frame);

    expect(result.action).toBe("pass");
  });

  it("does NOT modify request frames", async () => {
    const frame = makeFrame({
      type: "req",
      id: "test-id",
      method: "agent",
      params: { message: "hi" },
    });

    const result = await boom.onResponse(frame);

    expect(result.action).toBe("pass");
  });

  it("does NOT modify responses without text payloads", async () => {
    const frame = makeFrame({
      type: "res",
      id: "test-id",
      ok: true,
      payload: {
        runId: "run-1",
        status: "completed",
        result: { payloads: [{ image: "base64..." }] },
      },
    });

    const result = await boom.onResponse(frame);

    expect(result.action).toBe("pass");
  });

  it("handles multiple text payloads — all get BOOM", async () => {
    const frame = makeFrame({
      type: "res",
      id: "test-id",
      ok: true,
      payload: {
        runId: "run-1",
        status: "completed",
        result: {
          payloads: [{ text: "Hello" }, { text: "World" }, { image: "data" }],
        },
      },
    });

    const result = await boom.onResponse(frame);

    expect(result.action).toBe("modify");
    if (result.action === "modify") {
      const payload = result.data.parsed.payload as Record<string, unknown>;
      const res = payload.result as Record<string, unknown>;
      const payloads = res.payloads as Array<Record<string, unknown>>;
      expect(payloads[0].text).toBe("Hello BOOM");
      expect(payloads[1].text).toBe("World BOOM");
      expect(payloads[2].image).toBe("data");
      expect(payloads[2].text).toBeUndefined();
    }
  });

  it("preserves all other fields immutably", async () => {
    const frame = completionFrame("Hi");

    const result = await boom.onResponse(frame);

    expect(result.action).toBe("modify");
    if (result.action === "modify") {
      expect(result.data.parsed.id).toBe("test-id");
      expect(result.data.parsed.ok).toBe(true);
      const payload = result.data.parsed.payload as Record<string, unknown>;
      expect(payload.runId).toBe("run-1");
      // Original frame unchanged
      const origPayload = frame.parsed.payload as Record<string, unknown>;
      const origResult = origPayload.result as Record<string, unknown>;
      const origPayloads = origResult.payloads as Array<{ text: string }>;
      expect(origPayloads[0].text).toBe("Hi");
    }
  });

  it("returns pass for responses without result", async () => {
    const frame = makeFrame({
      type: "res",
      id: "test-id",
      ok: true,
      payload: { status: "completed" },
    });

    const result = await boom.onResponse(frame);

    expect(result.action).toBe("pass");
  });

  it("provides correct metadata", () => {
    const meta = boom.getMetadata();

    expect(meta.displayName).toBe("BOOM");
    expect(meta.hooks).toEqual(["onResponse"]);
    expect(meta.version).toBe("0.1.0");
  });
});
