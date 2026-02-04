/**
 * BotInstance Module
 *
 * Exports segregated interfaces and schemas for BotInstance.
 * Follows Interface Segregation Principle (ISP).
 */

// Status enums (shared)
export { BotStatus, BotHealth } from "./status";
export type { BotStatus as BotStatusType, BotHealth as BotHealthType } from "./status";

// Interfaces
export type {
  IBotIdentity,
  IBotConfigRefs,
  IBotRuntimeState,
  IBotHealthMetrics,
  IBotDeploymentInfo,
  IBotEcsResources,
  IBotInstance,
  BotInstanceListView,
  BotInstanceConfigView,
  BotInstanceHealthView,
  BotInstanceDeploymentView,
} from "./interfaces";

// Schemas
export {
  BotIdentitySchema,
  BotConfigRefsSchema,
  BotRuntimeStateSchema,
  BotHealthMetricsSchema,
  BotDeploymentInfoSchema,
  BotEcsResourcesSchema,
  BotInstanceListViewSchema,
  BotInstanceConfigViewSchema,
  BotInstanceHealthViewSchema,
  BotInstanceDeploymentViewSchema,
  validateBotIdentity,
  validateBotConfigRefs,
  validateBotRuntimeState,
  validateBotHealthMetrics,
  validateBotDeploymentInfo,
  validateBotInstanceListView,
  validateBotInstanceConfigView,
  validateBotInstanceHealthView,
  validateBotInstanceDeploymentView,
} from "./schemas";

export type {
  BotIdentity,
  BotConfigRefs,
  BotRuntimeState,
  BotHealthMetrics,
  BotDeploymentInfo,
  BotEcsResources,
} from "./schemas";
