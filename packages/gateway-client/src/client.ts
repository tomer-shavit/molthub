// ---------------------------------------------------------------------------
// GatewayClient — WebSocket client for the OpenClaw Gateway protocol
// ---------------------------------------------------------------------------

import { EventEmitter } from "events";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

import { InterceptorChain } from "./interceptors/chain";
import type { GatewayInterceptor, OutboundMessage, InboundMessage, GatewayInterceptorEvent } from "./interceptors/interface";
import { PendingRequestTracker } from "./connection/pending-request-tracker";
import type { PendingRequest } from "./connection/pending-request-tracker";
import type { IGatewayClient } from "./interfaces/gateway-client.interface";
import { type IWebSocketFactory, DefaultWebSocketFactory } from "./interfaces/websocket-factory.interface";

import type {
  GatewayConnectionOptions,
  GatewayEvent,
  ConnectResult,
  GatewayHealthSnapshot,
  GatewayStatusSummary,
  ConfigGetResult,
  ConfigApplyRequest,
  ConfigApplyResult,
  ConfigPatchRequest,
  ConfigPatchResult,
  SendRequest,
  SendResult,
  AgentRequest,
  AgentResult,
  AgentAck,
  AgentCompletion,
  AgentOutputEvent,
  PresenceEvent,
  ShutdownEvent,
  ReconnectOptions,
  CostUsageSummary,
  AgentIdentityResult,
} from "./protocol";
import { GatewayErrorCode } from "./protocol";
import { buildConnectFrame, buildGatewayUrl } from "./auth";
import {
  GatewayError,
  GatewayConnectionError,
  GatewayTimeoutError,
  GatewayAuthError,
} from "./errors";

// ---- Defaults -------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RECONNECT: ReconnectOptions = {
  enabled: true,
  maxAttempts: 10,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
};

// ---- Client ---------------------------------------------------------------

export class GatewayClient extends EventEmitter implements IGatewayClient {
  private readonly options: GatewayConnectionOptions;
  private readonly reconnectOpts: ReconnectOptions;
  private readonly timeoutMs: number;
  private readonly wsFactory: IWebSocketFactory;

  private ws: WebSocket | null = null;
  private connected = false;
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly pending: PendingRequestTracker;
  private readonly interceptorChain: InterceptorChain;

  constructor(
    options: GatewayConnectionOptions,
    interceptors?: GatewayInterceptor[],
    wsFactory?: IWebSocketFactory,
  ) {
    super();
    this.options = options;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.reconnectOpts = options.reconnect
      ? { ...DEFAULT_RECONNECT, ...options.reconnect }
      : DEFAULT_RECONNECT;
    this.interceptorChain = new InterceptorChain(interceptors);
    this.pending = new PendingRequestTracker();
    this.wsFactory = wsFactory ?? new DefaultWebSocketFactory();
  }

  /** Access the interceptor chain for adding/removing interceptors at runtime. */
  get interceptors(): InterceptorChain {
    return this.interceptorChain;
  }

  // ------------------------------------------------------------------
  // Connection lifecycle
  // ------------------------------------------------------------------

  /**
   * Open the WebSocket, perform the protocol handshake, and return the
   * connect result (presence snapshot, health, state version).
   */
  connect(): Promise<ConnectResult> {
    return new Promise<ConnectResult>((resolve, reject) => {
      const url = buildGatewayUrl(this.options.host, this.options.port);

      this.intentionalClose = false;
      this.reconnectAttempt = 0;

      try {
        this.ws = this.wsFactory.create(url);
      } catch (err) {
        reject(
          new GatewayConnectionError(
            `Failed to create WebSocket: ${(err as Error).message}`,
          ),
        );
        return;
      }

      const connectTimeout = setTimeout(() => {
        if (this.ws) {
          this.ws.terminate();
        }
        reject(new GatewayTimeoutError("Connect handshake timed out"));
      }, this.timeoutMs);

      // OpenClaw handshake flow:
      // 1. WebSocket opens
      // 2. Gateway sends connect.challenge event with nonce
      // 3. Client sends connect frame (with nonce in device field if needed)
      // 4. Gateway responds with connect result
      this.ws.once("open", () => {
        // Don't send anything yet — wait for the challenge
      });

      // First message is the connect.challenge from the gateway
      this.ws.once("message", (challengeRaw: WebSocket.Data) => {
        let challengeData: Record<string, unknown>;
        try {
          challengeData = JSON.parse(challengeRaw.toString()) as Record<string, unknown>;
        } catch {
          reject(new GatewayConnectionError("Invalid challenge message"));
          return;
        }

        // Send connect frame (challenge is acknowledged by responding, no nonce echo needed)
        const frame = buildConnectFrame(this.options);
        this.ws!.send(JSON.stringify(frame));

        // Second message is the connect result
        this.ws!.once("message", (resultRaw: WebSocket.Data) => {
          clearTimeout(connectTimeout);

          let data: Record<string, unknown>;
          try {
            data = JSON.parse(resultRaw.toString()) as Record<string, unknown>;
          } catch {
            reject(new GatewayConnectionError("Invalid connect response"));
            return;
          }

          // OpenClaw response format: { type: "res", id, ok, payload/error }
          if (data.type === "res" && data.ok === false) {
            this.cleanup();
            const err = data.error as { code?: string; message?: string } | undefined;
            const msg = err?.message ?? "Connection rejected";
            const code = err?.code ?? "";
            if (code === "UNAVAILABLE" || msg.toLowerCase().includes("auth")) {
              reject(new GatewayAuthError(msg, code as GatewayErrorCode));
            } else {
              reject(new GatewayConnectionError(msg, code as GatewayErrorCode));
            }
            return;
          }

          // Normalize to ConnectResult for callers
          const result: ConnectResult = data as unknown as ConnectResult;

          this.connected = true;
          this.reconnectAttempt = 0;
          this.attachListeners();
          resolve(result);
        });
      });

      this.ws.once("error", (err: Error) => {
        clearTimeout(connectTimeout);
        reject(new GatewayConnectionError(err.message));
      });

      this.ws.once("close", () => {
        clearTimeout(connectTimeout);
        if (!this.connected) {
          reject(new GatewayConnectionError("Connection closed before handshake completed"));
        }
      });
    });
  }

  /**
   * Gracefully close the WebSocket connection. Rejects all pending requests.
   */
  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.cancelReconnectTimer();
    this.pending.rejectAll("Client disconnected");
    await this.closeSocket();
  }

  /** Returns `true` if the underlying WebSocket is open and handshake completed. */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  // ------------------------------------------------------------------
  // RPC methods
  // ------------------------------------------------------------------

  /** Request a health snapshot. */
  async health(): Promise<GatewayHealthSnapshot> {
    return this.request<GatewayHealthSnapshot>("health");
  }

  /** Request a status summary. */
  async status(): Promise<GatewayStatusSummary> {
    return this.request<GatewayStatusSummary>("status");
  }

  /** Get current configuration and its hash. */
  async configGet(): Promise<ConfigGetResult> {
    return this.request<ConfigGetResult>("config.get");
  }

  /** Replace the full configuration (optimistic concurrency via baseHash). */
  async configApply(config: ConfigApplyRequest): Promise<ConfigApplyResult> {
    return this.request<ConfigApplyResult>("config.apply", config as unknown as Record<string, unknown>);
  }

  /** Merge-patch the configuration (optimistic concurrency via baseHash). */
  async configPatch(patch: ConfigPatchRequest): Promise<ConfigPatchResult> {
    return this.request<ConfigPatchResult>("config.patch", patch as unknown as Record<string, unknown>);
  }

  /** Get the resolved agent identity (name + avatar from IDENTITY.md / config). */
  async agentIdentityGet(agentId?: string): Promise<AgentIdentityResult> {
    return this.request<AgentIdentityResult>(
      "agent.identity.get",
      agentId ? { agentId } : undefined,
    );
  }

  /** Request token usage / cost summary. */
  async usageCost(days?: number): Promise<CostUsageSummary> {
    return this.request<CostUsageSummary>("usage.cost", days ? { days } : undefined);
  }

  /** Send a message via an active channel. */
  async send(message: SendRequest): Promise<SendResult> {
    return this.request<SendResult>("send", message as unknown as Record<string, unknown>);
  }

  /**
   * Execute an agent prompt. The gateway acknowledges immediately, then
   * streams `agentOutput` events, and finally sends a completion response.
   * This method resolves with both the ack and the completion.
   */
  async agent(request: AgentRequest): Promise<AgentResult> {
    const id = uuidv4();

    // Strip _localTimeoutMs before sending — it's a client-only field.
    const { _localTimeoutMs, ...wireParams } = request;
    const msg: Record<string, unknown> = { type: "req", id, method: "agent", params: wireParams as unknown as Record<string, unknown> };

    this.ensureConnected();

    // Phase 1: Get the ack (first res frame).
    const ack = await new Promise<AgentAck>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.remove(id);
        reject(new GatewayTimeoutError("Agent ack timed out"));
      }, this.timeoutMs);

      this.pending.add(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.ws!.send(JSON.stringify(msg));
    });

    // Phase 2: Wait for the completion (second res frame with the SAME id).
    // OpenClaw sends two res frames for agent requests — re-register on the
    // same message id to catch the completion.
    const agentTimeoutMs = _localTimeoutMs ?? request.timeout ?? 60_000;
    const completion = await new Promise<AgentCompletion>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.remove(id);
        reject(new GatewayTimeoutError("Agent completion timed out"));
      }, agentTimeoutMs);

      this.pending.add(id, {
        resolve: (raw: unknown) => {
          clearTimeout(timer);
          const payload = raw as Record<string, unknown> | undefined;

          // Extract the agent text output from the completion payload.
          // OpenClaw completion: { status: "ok", summary: "completed",
          //   result: { payloads: [{ text: "...", mediaUrl: ... }], meta: {...} } }
          let output: string | undefined;
          const result = payload?.result as Record<string, unknown> | undefined;
          if (result) {
            const payloads = result.payloads as Array<Record<string, unknown>> | undefined;
            if (payloads?.[0]?.text) {
              output = payloads.map((p) => p.text as string).join("\n");
            } else if (typeof result === "string") {
              output = result;
            }
          }

          resolve({
            runId: (payload?.runId ?? ack.runId) as string,
            status: payload?.status === "error" ? "failed" : "completed",
            output,
            error: payload?.error as string | undefined,
          });
        },
        reject: (err: unknown) => {
          clearTimeout(timer);
          // Map gateway errors to a failed completion instead of throwing.
          resolve({
            runId: ack.runId,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
        },
        timer,
      });
    });

    return { ack, completion };
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new GatewayConnectionError("Not connected to gateway");
    }
  }

  /**
   * Generic request/response helper. Sends a JSON message over the WebSocket
   * and returns a promise that resolves with the `result` field of the
   * response, or rejects with a typed error.
   */
  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    this.ensureConnected();

    const id = uuidv4();
    const outbound: OutboundMessage = { id, method, params };

    // Run outbound interceptors
    const processed = await this.interceptorChain.processOutbound(outbound);
    if (processed === null) {
      return null as unknown as T; // Short-circuited by interceptor
    }

    // OpenClaw expects: { type: "req", id, method, params }
    const msg: Record<string, unknown> = { type: "req", id: processed.id, method: processed.method };
    if (processed.params !== undefined) {
      msg.params = processed.params;
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.remove(id);
        reject(new GatewayTimeoutError(`Request "${method}" timed out`));
      }, this.timeoutMs);

      this.pending.add(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.ws!.send(JSON.stringify(msg));
    });
  }

  /**
   * Attach message / close / error listeners after successful handshake.
   * These handle incoming responses, events, and reconnection logic.
   */
  private attachListeners(): void {
    if (!this.ws) return;

    this.ws.on("message", (raw: WebSocket.Data) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return; // silently drop unparseable frames
      }

      // OpenClaw response: { type: "res", id, ok, payload/error }
      // Legacy response: { id, result/error }
      if (typeof data.id === "string" && this.pending.has(data.id)) {
        this.handleResponse(data);
        return;
      }

      // OpenClaw event: { type: "event", event: "...", payload: {...} }
      // Legacy event: { type: "agentOutput" | "presence" | ... }
      if (data.type === "event" && typeof data.event === "string") {
        // Normalize OpenClaw event format to legacy format
        const normalized = {
          type: data.event as string,
          ...(data.payload as Record<string, unknown> ?? {}),
        };
        this.handleEvent(normalized as unknown as GatewayEvent);
        return;
      }

      if (typeof data.type === "string" && data.type !== "res") {
        this.handleEvent(data as unknown as GatewayEvent);
      }
    });

    this.ws.on("close", () => {
      this.connected = false;
      this.emit("disconnect");
      this.pending.rejectAll("Connection closed");

      if (!this.intentionalClose && this.reconnectOpts.enabled) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err: Error) => {
      this.emit("error", new GatewayConnectionError(err.message));
    });
  }

  private handleResponse(response: Record<string, unknown>): void {
    const id = response.id as string;
    const pendingReq = this.pending.get(id);
    if (!pendingReq) return;

    // Remove from tracker (clears timer)
    this.pending.remove(id);

    // OpenClaw uses { type: "res", id, ok, payload/error }
    // Legacy format uses { id, result/error }
    const isOk = response.ok !== undefined ? response.ok === true : !response.error;
    const result = response.payload ?? response.result;
    const error = response.error as { code?: string; message?: string } | undefined;

    // Build inbound message for interceptor chain
    const inbound: InboundMessage = { id };
    if (!isOk && error) {
      inbound.error = { code: error.code ?? "UNKNOWN", message: error.message ?? "Unknown error" };
    } else {
      inbound.result = result;
    }

    // Run inbound interceptors, then resolve/reject
    this.interceptorChain
      .processInbound(inbound)
      .then((processed) => {
        if (processed.error) {
          pendingReq.reject(
            new GatewayError(processed.error.message, processed.error.code as GatewayErrorCode),
          );
        } else {
          pendingReq.resolve(processed.result);
        }
      })
      .catch((err) => {
        pendingReq.reject(err);
      });
  }

  private handleEvent(event: GatewayEvent): void {
    // Run event interceptors (fire-and-forget)
    const interceptorEvent: GatewayInterceptorEvent = {
      type: event.type,
      data: event as unknown as Record<string, unknown>,
    };
    this.interceptorChain.processEvent(interceptorEvent).catch(() => {
      // Swallow interceptor errors for events
    });

    switch (event.type) {
      case "agentOutput":
        this.emit("agentOutput", event as AgentOutputEvent);
        break;
      case "presence":
        this.emit("presence", event as PresenceEvent);
        break;
      case "keepalive":
        this.emit("keepalive");
        break;
      case "shutdown":
        this.emit("shutdown", event as ShutdownEvent);
        break;
    }
  }

  // ------------------------------------------------------------------
  // Reconnect
  // ------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= this.reconnectOpts.maxAttempts) {
      this.emit(
        "error",
        new GatewayConnectionError(
          `Max reconnect attempts (${this.reconnectOpts.maxAttempts}) reached`,
        ),
      );
      return;
    }

    const delay = Math.min(
      this.reconnectOpts.baseDelayMs * Math.pow(2, this.reconnectAttempt),
      this.reconnectOpts.maxDelayMs,
    );

    this.reconnectAttempt++;
    this.emit("reconnect", this.reconnectAttempt);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // connect() failure will trigger another close -> scheduleReconnect
      }
    }, delay);
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ------------------------------------------------------------------
  // Cleanup helpers
  // ------------------------------------------------------------------

  private cleanup(): void {
    this.connected = false;
    if (this.ws) {
      this.ws.removeAllListeners();
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.terminate();
      }
      this.ws = null;
    }
  }

  private closeSocket(): Promise<void> {
    return new Promise((resolve) => {
      if (
        !this.ws ||
        this.ws.readyState === WebSocket.CLOSED ||
        this.ws.readyState === WebSocket.CLOSING
      ) {
        this.cleanup();
        resolve();
        return;
      }

      this.ws.once("close", () => {
        this.cleanup();
        resolve();
      });

      this.ws.close();

      // Safety: force-terminate if close doesn't complete quickly
      setTimeout(() => {
        this.cleanup();
        resolve();
      }, 3_000);
    });
  }
}
