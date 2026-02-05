/**
 * API Client Module - Re-export
 *
 * This file re-exports from the refactored api/ directory for backward compatibility.
 * All existing imports from '@/lib/api' will continue to work.
 *
 * For new code, prefer importing domain-specific clients directly:
 *
 * ```typescript
 * import { alertsClient, botInstancesClient } from '@/lib/api';
 *
 * // Instead of
 * import { api } from '@/lib/api';
 * await api.listAlerts();
 *
 * // Use
 * await alertsClient.list();
 * ```
 */

export * from './api/index';
