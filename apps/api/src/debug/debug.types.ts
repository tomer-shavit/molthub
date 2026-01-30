// ---------------------------------------------------------------------------
// Debug / Introspection Types
// ---------------------------------------------------------------------------

export interface ProcessInfo {
  pid: number;
  command: string;
  cpuPercent: number;
  memoryMb: number;
  uptime: string;
}

export interface GatewayProbeResult {
  reachable: boolean;
  latencyMs: number;
  protocolVersion: number;
  healthOk: boolean;
  channelsLinked: number;
  uptime: number;
  error?: string;
}

export interface RedactedConfig {
  config: Record<string, unknown>;
  configHash: string;
  source: "gateway" | "target";
}

export interface EnvVarStatus {
  name: string;
  isSet: boolean;
  category: "required" | "optional" | "channel" | "ai";
}

export interface FileInfo {
  path: string;
  size: number;
  lastModified: Date;
  isDirectory: boolean;
}

export interface ConnectivityResult {
  gatewayPort: { reachable: boolean; latencyMs: number };
  dns: { resolved: boolean; ip?: string };
  internet: { reachable: boolean };
}
