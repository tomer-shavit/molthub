/**
 * NestJS injection tokens for repository interfaces.
 * Use these tokens with @Inject() decorator in services.
 */

// Core
export const PRISMA_CLIENT = Symbol("PRISMA_CLIENT");
export const WORKSPACE_REPOSITORY = "IWorkspaceRepository";
export const BOT_INSTANCE_REPOSITORY = "IBotInstanceRepository";
export const FLEET_REPOSITORY = "IFleetRepository";

// Configuration layers
export const CONFIG_LAYER_REPOSITORY = "IConfigLayerRepository";

// Integrations
export const CONNECTOR_REPOSITORY = "IConnectorRepository";
export const CHANNEL_REPOSITORY = "IChannelRepository";
export const SKILL_PACK_REPOSITORY = "ISkillPackRepository";

// Tracing
export const TRACE_REPOSITORY = "ITraceRepository";

// Observability
export const COST_REPOSITORY = "ICostRepository";
export const SLO_REPOSITORY = "ISloRepository";
export const ALERT_REPOSITORY = "IAlertRepository";

// Routing & teams
export const ROUTING_REPOSITORY = "IRoutingRepository";
