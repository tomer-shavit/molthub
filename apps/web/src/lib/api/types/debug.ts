/**
 * Debug and introspection types.
 */

export interface DebugProcessInfo {
  pid: number;
  command: string;
  cpuPercent: number;
  memoryMb: number;
  uptime: string;
}

export interface DebugGatewayProbeResult {
  reachable: boolean;
  latencyMs: number;
  protocolVersion: number;
  healthOk: boolean;
  channelsLinked: number;
  uptime: number;
  error?: string;
}

export interface DebugRedactedConfig {
  config: Record<string, unknown>;
  configHash: string;
  source: "gateway" | "target";
}

export interface DebugEnvVarStatus {
  name: string;
  isSet: boolean;
  category: "required" | "optional" | "channel" | "ai";
}

export interface DebugFileInfo {
  path: string;
  size: number;
  lastModified: string;
  isDirectory: boolean;
}

export interface DebugConnectivityResult {
  gatewayPort: { reachable: boolean; latencyMs: number };
  dns: { resolved: boolean; ip?: string };
  internet: { reachable: boolean };
}
