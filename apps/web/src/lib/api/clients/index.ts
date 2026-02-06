/**
 * Central export for all domain clients.
 */

export { adaptersClient, AdaptersClient } from './adapters.client';
export { alertsClient, AlertsClient } from './alerts.client';
export { a2aClient, A2aClient } from './a2a.client';
export { auditClient, AuditClient } from './audit.client';
// Bot instances - composite client for backward compatibility
export { botInstancesClient, BotInstancesClient } from './bot-instances/composite.client';

// Bot instances - focused sub-clients (recommended for SRP adherence)
export {
  botInstancesCrudClient,
  BotInstancesCrudClient,
  botInstancesLifecycleClient,
  BotInstancesLifecycleClient,
  botInstancesHealthClient,
  BotInstancesHealthClient,
  botInstancesConfigClient,
  BotInstancesConfigClient,
  botInstancesEvolutionClient,
  BotInstancesEvolutionClient,
  botInstancesResourcesClient,
  BotInstancesResourcesClient,
  botInstancesChannelAuthClient,
  BotInstancesChannelAuthClient,
} from './bot-instances';
export { budgetsClient, BudgetsClient } from './budgets.client';
export { changeSetsClient, ChangeSetsClient } from './change-sets.client';
export { channelsClient, ChannelsClient } from './channels.client';
export { connectorsClient, ConnectorsClient } from './connectors.client';
export { costsClient, CostsClient } from './costs.client';
export { credentialsClient, CredentialsClient } from './credentials.client';
export { dashboardClient, DashboardClient } from './dashboard.client';
export { debugClient, DebugClient } from './debug.client';
export { fleetsClient, FleetsClient } from './fleets.client';
export { healthClient, HealthClient } from './health.client';
export { notificationsClient, NotificationsClient } from './notifications.client';
export { onboardingClient, OnboardingClient } from './onboarding.client';
export { overlaysClient, OverlaysClient } from './overlays.client';
export { pairingsClient, PairingsClient } from './pairings.client';
export { policiesClient, PoliciesClient } from './policies.client';
export { profilesClient, ProfilesClient } from './profiles.client';
export { slosClient, SlosClient } from './slos.client';
export { teamsClient, TeamsClient } from './teams.client';
export { templatesClient, TemplatesClient } from './templates.client';
export { tracesClient, TracesClient } from './traces.client';
export { userContextClient, UserContextClient } from './user-context.client';
export { personaTemplatesClient, PersonaTemplatesClient } from './persona-templates.client';
