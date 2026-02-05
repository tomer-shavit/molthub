/**
 * Fleet types.
 */

import type { BotInstance } from './bot-instances';

export type FleetEnvironment = 'dev' | 'staging' | 'prod';
export type FleetStatus = 'ACTIVE' | 'PAUSED' | 'DRAINING' | 'ERROR';

export interface Fleet {
  id: string;
  name: string;
  workspaceId: string;
  environment: FleetEnvironment;
  description?: string;
  status: FleetStatus;
  tags: Record<string, string>;
  defaultProfileId?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { instances: number };
  instances?: BotInstance[];
}

export interface PromoteFleetResult {
  fleet: Fleet;
  botsReconciling: number;
}

export interface FleetHealth {
  fleetId: string;
  totalInstances: number;
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  unknownCount: number;
  status: string;
}

export interface CreateFleetPayload {
  name: string;
  environment: string;
  workspaceId?: string;
  description?: string;
  tags?: Record<string, string>;
}

export interface FleetMetrics {
  totalBots: number;
  messageVolume: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  failureRate: number;
  costPerHour: number;
}
