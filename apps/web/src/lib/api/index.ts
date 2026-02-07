/**
 * API Client Module
 *
 * This module provides domain-specific API clients following SOLID principles.
 *
 * ## Usage
 *
 * ### Recommended: Use domain-specific clients (tree-shakeable)
 * ```typescript
 * import { alertsClient, botInstancesClient } from '@/lib/api';
 *
 * // Alerts
 * const alerts = await alertsClient.list({ status: 'ACTIVE' });
 * await alertsClient.acknowledge(alertId);
 *
 * // Bot Instances
 * const instances = await botInstancesClient.list();
 * const health = await botInstancesClient.getHealth(instanceId);
 * ```
 *
 * ### Legacy: Use unified api object (backward compatible)
 * ```typescript
 * import { api } from '@/lib/api';
 *
 * const alerts = await api.listAlerts({ status: 'ACTIVE' });
 * await api.acknowledgeAlert(alertId);
 * ```
 *
 * ## Available Clients
 *
 * - `adaptersClient` - Deployment adapter metadata
 * - `alertsClient` - Health alerts, acknowledgment, remediation
 * - `a2aClient` - Agent-to-agent communication, streaming
 * - `botInstancesClient` - Bot CRUD, lifecycle, health, drift
 * - `budgetsClient` - Budget configuration
 * - `channelsClient` - Channel CRUD, bindings
 * - `connectorsClient` - Connector management
 * - `costsClient` - Cost tracking, summaries
 * - `credentialsClient` - Credential vault
 * - `dashboardClient` - Dashboard metrics, health, activity
 * - `debugClient` - Debug introspection
 * - `fleetsClient` - Fleet CRUD, health, promotion
 * - `healthClient` - API health checks
 * - `notificationsClient` - Notification channels and rules
 * - `onboardingClient` - Onboarding flow
 * - `overlaysClient` - Config overlays
 * - `pairingsClient` - Device pairing management
 * - `policiesClient` - Policy packs
 * - `profilesClient` - Profile CRUD
 * - `slosClient` - SLO management
 * - `teamsClient` - Bot team members
 * - `templatesClient` - Template CRUD
 * - `tracesClient` - Trace retrieval
 * - `userContextClient` - User context
 */

// Base client exports
export { BaseHttpClient, ApiError, API_URL } from './base-client';

// Domain client exports
export {
  adaptersClient,
  AdaptersClient,
  alertsClient,
  AlertsClient,
  a2aClient,
  A2aClient,
  botInstancesClient,
  BotInstancesClient,
  budgetsClient,
  BudgetsClient,
  channelsClient,
  ChannelsClient,
  connectorsClient,
  ConnectorsClient,
  costsClient,
  CostsClient,
  credentialsClient,
  CredentialsClient,
  dashboardClient,
  DashboardClient,
  debugClient,
  DebugClient,
  fleetsClient,
  FleetsClient,
  healthClient,
  HealthClient,
  notificationsClient,
  NotificationsClient,
  onboardingClient,
  OnboardingClient,
  overlaysClient,
  OverlaysClient,
  pairingsClient,
  PairingsClient,
  policiesClient,
  PoliciesClient,
  profilesClient,
  ProfilesClient,
  slosClient,
  SlosClient,
  teamsClient,
  TeamsClient,
  templatesClient,
  TemplatesClient,
  tracesClient,
  TracesClient,
  userContextClient,
  UserContextClient,
  personaTemplatesClient,
  PersonaTemplatesClient,
  middlewaresClient,
  MiddlewaresClient,
} from './clients';

// Backward-compatible facade export
export { api, ApiClient } from './facade';

// Type exports
export * from './types';
