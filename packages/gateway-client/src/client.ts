// ---------------------------------------------------------------------------
// GatewayClient — WebSocket client for the Moltbot Gateway protocol
// ---------------------------------------------------------------------------

import { EventEmitter } from "events";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

import { InterceptorChain } from "./interceptors/chain";
import type { GatewayInterceptor, OutboundMessage, InboundMessage, GatewayInterceptorEvent } from "./interceptors/interface";

import type {
  GatewayConnectionOptions,
  GatewayMessage,
  GatewayResponse,
  GatewayEvent,
  ConnectResult,
  ConnectResultSuccess,
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

// ---- Pending request tracker ----------------------------------------------

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ---- Client ---------------------------------------------------------------

export class GatewayClient extends EventEmitter {
  private readonly options: GatewayConnectionOptions;
  private readonly reconnectOpts: ReconnectOptions;
  private readonly timeoutMs: number;

  private ws: WebSocket | null = null;
  private connected = false;
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly pending = new Map<string, PendingRequest>();
  private readonly agentCompletions = new Map<
    string,
    {
      resolve: (value: AgentCompletion) => void;
      reject: (reason: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private readonly interceptorChain: InterceptorChain;

  constructor(options: GatewayConnectionOptions, interceptors?: GatewayInterceptor[]) {
    super();
    this.options = options;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.reconnectOpts = options.reconnect
      ? { ...DEFAULT_RECONNECT, ...options.reconnect }
      : DEFAULT_RECONNECT;
    this.interceptorChain = new InterceptorChain(interceptors);
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
        this.ws = new WebSocket(url);
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

      this.ws.once("open", () => {
        const frame = buildConnectFrame(this.options);
        this.ws!.send(JSON.stringify(frame));
      });

      // The very first message after we send the connect frame is the
      // connect result from the gateway.
      this.ws.once("message", (raw: WebSocket.Data) => {
        clearTimeout(connectTimeout);

        let result: ConnectResult;
        try {
          result = JSON.parse(raw.toString()) as ConnectResult;
        } catch {
          reject(new GatewayConnectionError("Invalid connect response"));
          return;
        }

        if (result.type === "error") {
          this.cleanup();
          if (
            result.code === GatewayErrorCode.UNAVAILABLE ||
            result.message?.toLowerCase().includes("auth")
          ) {
            reject(new GatewayAuthError(result.message, result.code));
          } else {
            reject(new GatewayConnectionError(result.message, result.code));
          }
          return;
        }

        this.connected = true;
        this.reconnectAttempt = 0;
        this.attachListeners();
        resolve(result);
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
    this.rejectAllPending("Client disconnected");
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
    const msg: GatewayMessage = { id, method: "agent", params: request as unknown as Record<string, unknown> };

    this.ensureConnected();

    // First we get the ack via the normal request/response path.
    const ack = await new Promise<AgentAck>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new GatewayTimeoutError("Agent ack timed out"));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.ws!.send(JSON.stringify(msg));
    });

    // Then we wait for the completion event which arrives as a separate
    // response keyed by the ack's requestId.
    const agentTimeoutMs = request.timeoutMs ?? this.timeoutMs;
    const completion = await new Promise<AgentCompletion>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.agentCompletions.delete(ack.requestId);
        reject(new GatewayTimeoutError("Agent completion timed out"));
      }, agentTimeoutMs);

      this.agentCompletions.set(ack.requestId, { resolve, reject, timer });
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

    const msg: GatewayMessage = { id: processed.id, method: processed.method };
    if (processed.params !== undefined) {
      msg.params = processed.params;
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new GatewayTimeoutError(`Request "${method}" timed out`));
      }, this.timeoutMs);

      this.pending.set(id, {
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

      // Response to a pending request
      if (typeof data.id === "string" && this.pending.has(data.id)) {
        this.handleResponse(data as unknown as GatewayResponse);
        return;
      }

      // Agent completion event (keyed by requestId)
      if (
        typeof data.requestId === "string" &&
        (data.status === "completed" || data.status === "failed") &&
        this.agentCompletions.has(data.requestId as string)
      ) {
        this.handleAgentCompletion(data as unknown as AgentCompletion);
        return;
      }

      // Event
      if (typeof data.type === "string") {
        this.handleEvent(data as unknown as GatewayEvent);
      }
    });

    this.ws.on("close", () => {
      this.connected = false;
      this.emit("disconnect");
      this.rejectAllPending("Connection closed");

      if (!this.intentionalClose && this.reconnectOpts.enabled) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err: Error) => {
      this.emit("error", new GatewayConnectionError(err.message));
    });
  }

  private handleResponse(response: GatewayResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    // Build inbound message for interceptor chain
    const inbound: InboundMessage = { id: response.id };
    if (response.error) {
      inbound.error = { code: response.error.code, message: response.error.message };
    } else {
      inbound.result = response.result;
    }

    // Run inbound interceptors, then resolve/reject
    this.interceptorChain
      .processInbound(inbound)
      .then((processed) => {
        if (processed.error) {
          pending.reject(
            new GatewayError(processed.error.message, processed.error.code as GatewayErrorCode),
          );
        } else {
          pending.resolve(processed.result);
        }
      })
      .catch((err) => {
        pending.reject(err);
      });
  }

  private handleAgentCompletion(completion: AgentCompletion): void {
    const entry = this.agentCompletions.get(completion.requestId);
    if (!entry) return;

    clearTimeout(entry.timer);
    this.agentCompletions.delete(completion.requestId);
    entry.resolve(completion);
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

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new GatewayConnectionError(reason));
      this.pending.delete(id);
    }
    for (const [id, entry] of this.agentCompletions) {
      clearTimeout(entry.timer);
      entry.reject(new GatewayConnectionError(reason));
      this.agentCompletions.delete(id);
    }
  }

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
