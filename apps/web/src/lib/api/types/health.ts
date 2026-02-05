/**
 * Health check types.
 */

export interface HealthCheckResult {
  status: string;
  checks: Record<string, unknown>;
}
