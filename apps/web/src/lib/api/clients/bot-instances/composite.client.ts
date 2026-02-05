/**
 * Bot instances composite client.
 * Backward-compatible facade that delegates to focused sub-clients.
 *
 * @deprecated Use specific sub-clients directly for better adherence to SRP:
 * - botInstancesCrudClient - CRUD operations
 * - botInstancesLifecycleClient - start, stop, reconcile
 * - botInstancesHealthClient - health, drift, diagnostics
 * - botInstancesConfigClient - configuration management
 * - botInstancesEvolutionClient - evolution tracking
 * - botInstancesResourcesClient - resources and usage
 * - botInstancesChannelAuthClient - channel auth and chat
 */

import { botInstancesCrudClient } from './crud.client';
import { botInstancesLifecycleClient } from './lifecycle.client';
import { botInstancesHealthClient } from './health.client';
import { botInstancesConfigClient } from './config.client';
import { botInstancesEvolutionClient } from './evolution.client';
import { botInstancesResourcesClient } from './resources.client';
import { botInstancesChannelAuthClient } from './channel-auth.client';

import type {
  BotInstance,
  ListBotInstancesParams,
  InstanceHealth,
  InstanceDrift,
  DiagnosticsResult,
  BulkActionPayload,
  BulkActionResult,
  DeploymentEvent,
  ProvisioningStatus,
  AiGatewaySettings,
  BotResourcesResponse,
  UpdateBotResourcesPayload,
  BotResourcesUpdateResult,
} from '../../types/bot-instances';
import type { TraceStats } from '../../types/traces';
import type { ChannelAuthStatus } from '../../types/channels';
import type {
  AgentLiveState,
  AgentEvolutionSnapshot,
  TokenUsageSummary,
} from '../../types/evolution';
import type { ChatWithBotResult } from '../../types/chat';

/**
 * @deprecated Use specific sub-clients for better SRP adherence.
 */
export class BotInstancesClient {
  // CRUD - delegate to botInstancesCrudClient
  list = (params?: ListBotInstancesParams): Promise<BotInstance[]> =>
    botInstancesCrudClient.list(params);

  getById = (id: string): Promise<BotInstance> =>
    botInstancesCrudClient.getById(id);

  deleteById = (id: string): Promise<void> =>
    botInstancesCrudClient.deleteById(id);

  compare = (ids: string[]): Promise<BotInstance[]> =>
    botInstancesCrudClient.compare(ids);

  bulkAction = (data: BulkActionPayload): Promise<BulkActionResult[]> =>
    botInstancesCrudClient.bulkAction(data);

  getDeploymentEvents = (instanceId: string): Promise<DeploymentEvent[]> =>
    botInstancesCrudClient.getDeploymentEvents(instanceId);

  // Lifecycle - delegate to botInstancesLifecycleClient
  stop = (id: string): Promise<void> =>
    botInstancesLifecycleClient.stop(id);

  start = (id: string): Promise<void> =>
    botInstancesLifecycleClient.start(id);

  reconcile = (id: string): Promise<void> =>
    botInstancesLifecycleClient.reconcile(id);

  getProvisioningStatus = (instanceId: string): Promise<ProvisioningStatus> =>
    botInstancesLifecycleClient.getProvisioningStatus(instanceId);

  // Health - delegate to botInstancesHealthClient
  getHealth = (id: string): Promise<InstanceHealth> =>
    botInstancesHealthClient.getHealth(id);

  getDrift = (id: string): Promise<InstanceDrift> =>
    botInstancesHealthClient.getDrift(id);

  runDiagnostics = (id: string): Promise<DiagnosticsResult> =>
    botInstancesHealthClient.runDiagnostics(id);

  getMetrics = (id: string, from: Date, to: Date): Promise<TraceStats> =>
    botInstancesHealthClient.getMetrics(id, from, to);

  // Config - delegate to botInstancesConfigClient
  getConfig = (id: string): Promise<{ config: Record<string, unknown>; hash: string }> =>
    botInstancesConfigClient.getConfig(id);

  applyConfig = (id: string, config: string): Promise<void> =>
    botInstancesConfigClient.applyConfig(id, config);

  patchConfig = (id: string, patch: Record<string, unknown>): Promise<BotInstance> =>
    botInstancesConfigClient.patchConfig(id, patch);

  updateAiGatewaySettings = (instanceId: string, settings: AiGatewaySettings): Promise<BotInstance> =>
    botInstancesConfigClient.updateAiGatewaySettings(instanceId, settings);

  // Evolution - delegate to botInstancesEvolutionClient
  getLiveState = (instanceId: string): Promise<AgentLiveState> =>
    botInstancesEvolutionClient.getLiveState(instanceId);

  getEvolution = (instanceId: string): Promise<AgentEvolutionSnapshot> =>
    botInstancesEvolutionClient.getEvolution(instanceId);

  getEvolutionHistory = (instanceId: string, limit = 50): Promise<{ snapshots: AgentEvolutionSnapshot[] }> =>
    botInstancesEvolutionClient.getEvolutionHistory(instanceId, limit);

  syncEvolution = (instanceId: string): Promise<AgentEvolutionSnapshot> =>
    botInstancesEvolutionClient.syncEvolution(instanceId);

  // Resources - delegate to botInstancesResourcesClient
  getResources = (instanceId: string): Promise<BotResourcesResponse> =>
    botInstancesResourcesClient.getResources(instanceId);

  updateResources = (instanceId: string, dto: UpdateBotResourcesPayload): Promise<BotResourcesUpdateResult> =>
    botInstancesResourcesClient.updateResources(instanceId, dto);

  getTokenUsage = (instanceId: string): Promise<TokenUsageSummary> =>
    botInstancesResourcesClient.getTokenUsage(instanceId);

  // Channel Auth - delegate to botInstancesChannelAuthClient
  startChannelAuth = (id: string, channelId: string): Promise<ChannelAuthStatus> =>
    botInstancesChannelAuthClient.startChannelAuth(id, channelId);

  getChannelAuthStatus = (id: string, channelId: string): Promise<ChannelAuthStatus> =>
    botInstancesChannelAuthClient.getChannelAuthStatus(id, channelId);

  chat = (instanceId: string, message: string, sessionId?: string): Promise<ChatWithBotResult> =>
    botInstancesChannelAuthClient.chat(instanceId, message, sessionId);
}

export const botInstancesClient = new BotInstancesClient();
