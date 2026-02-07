/**
 * Dashboard types.
 */

export interface DashboardMetrics {
  totalBots: number;
  totalFleets: number;
  healthyBots: number;
  degradedBots: number;
  unhealthyBots: number;
  messageVolume: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  failureRate: number;
  costPerHour: number;
  failedDeployments: number;
}

export interface DashboardHealth {
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  fleetHealth: Array<{
    fleetId: string;
    fleetName: string;
    totalInstances: number;
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
  }>;
  recentAlerts: Array<{
    id: string;
    severity: "CRITICAL" | "WARNING" | "INFO";
    message: string;
    timestamp: string;
    resourceId?: string;
    resourceType?: string;
  }>;
}

export interface DashboardActivity {
  traces: Array<{
    id: string;
    traceId: string;
    botName: string;
    name: string;
    type: string;
    status: string;
    durationMs?: number;
    timestamp: string;
  }>;
}
