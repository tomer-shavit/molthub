/**
 * Bot instances domain - composed of focused sub-clients.
 * Each sub-client handles a single responsibility.
 */

export { BotInstancesCrudClient, botInstancesCrudClient } from './crud.client';
export { BotInstancesLifecycleClient, botInstancesLifecycleClient } from './lifecycle.client';
export { BotInstancesHealthClient, botInstancesHealthClient } from './health.client';
export { BotInstancesConfigClient, botInstancesConfigClient } from './config.client';
export { BotInstancesEvolutionClient, botInstancesEvolutionClient } from './evolution.client';
export { BotInstancesResourcesClient, botInstancesResourcesClient } from './resources.client';
export { BotInstancesChannelAuthClient, botInstancesChannelAuthClient } from './channel-auth.client';

// Backward-compatible composite client
export { BotInstancesClient, botInstancesClient } from './composite.client';
