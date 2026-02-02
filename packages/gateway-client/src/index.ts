// ---------------------------------------------------------------------------
// @clawster/gateway-client — Public API
// ---------------------------------------------------------------------------

// Client
export { GatewayClient } from "./client";

// Manager
export { GatewayManager } from "./manager";

// Interceptors
export * from "./interceptors";

// Auth helpers
export { buildAuth, buildConnectFrame, buildGatewayUrl } from "./auth";

// Errors
export {
  GatewayError,
  GatewayConnectionError,
  GatewayTimeoutError,
  GatewayAuthError,
} from "./errors";

// Protocol types & constants
export {
  DEFAULT_GATEWAY_PORT,
  PROTOCOL_VERSION,
  GatewayErrorCode,
} from "./protocol";

export type {
  GatewayAuth,
  GatewayConnectionOptions,
  ReconnectOptions,
  GatewayMessage,
  GatewayResponse,
  GatewayResponseSuccess,
  GatewayResponseError,
  ConnectFrame,
  ConnectResult,
  ConnectResultSuccess,
  ConnectResultError,
  ChannelHealth,
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
  AgentAck,
  AgentCompletion,
  AgentResult,
  AgentOutputEvent,
  PresenceSnapshot,
  PresenceUser,
  PresenceEvent,
  PresenceDelta,
  ShutdownEvent,
  KeepaliveEvent,
  GatewayEvent,
  AgentIdentityResult,
  CostUsageTotals,
  CostUsageDailyEntry,
  CostUsageSummary,
} from "./protocol";
