export interface ThresholdFieldSchema {
  label: string;
  type: "number";
  unit: string;
  min?: number;
  max?: number;
}

export interface AlertRuleDefinition {
  rule: string;
  displayName: string;
  description: string;
  category: "health" | "config" | "channel" | "cost";
  defaultSeverity: string;
  defaultEnabled: boolean;
  defaultThresholds: Record<string, number> | null;
  thresholdSchema: Record<string, ThresholdFieldSchema>;
  remediationAction: string;
}

export const ALERT_RULE_DEFINITIONS: AlertRuleDefinition[] = [
  {
    rule: "unreachable_instance",
    displayName: "Unreachable Instance",
    description:
      "Fires when a bot has no gateway heartbeat for a configurable duration.",
    category: "health",
    defaultSeverity: "CRITICAL",
    defaultEnabled: true,
    defaultThresholds: { thresholdMinutes: 2 },
    thresholdSchema: {
      thresholdMinutes: {
        label: "Threshold (minutes)",
        type: "number",
        unit: "min",
        min: 1,
      },
    },
    remediationAction: "restart",
  },
  {
    rule: "degraded_instance",
    displayName: "Degraded Instance",
    description:
      "Fires when a bot stays in DEGRADED health state for a configurable duration.",
    category: "health",
    defaultSeverity: "WARNING",
    defaultEnabled: true,
    defaultThresholds: { thresholdMinutes: 5 },
    thresholdSchema: {
      thresholdMinutes: {
        label: "Threshold (minutes)",
        type: "number",
        unit: "min",
        min: 1,
      },
    },
    remediationAction: "run-doctor",
  },
  {
    rule: "config_drift",
    displayName: "Config Drift",
    description:
      "Fires when the gateway config hash differs from the expected instance config hash.",
    category: "config",
    defaultSeverity: "ERROR",
    defaultEnabled: true,
    defaultThresholds: null,
    thresholdSchema: {},
    remediationAction: "reconcile",
  },
  {
    rule: "channel_auth_expired",
    displayName: "Channel Auth Expired",
    description:
      "Fires when any channel auth session is expired or in error state.",
    category: "channel",
    defaultSeverity: "ERROR",
    defaultEnabled: true,
    defaultThresholds: null,
    thresholdSchema: {},
    remediationAction: "re-pair-channel",
  },
  {
    rule: "health_check_failed",
    displayName: "Health Check Failed",
    description: "Fires after N consecutive health check failures.",
    category: "health",
    defaultSeverity: "ERROR",
    defaultEnabled: true,
    defaultThresholds: { consecutiveFailures: 3 },
    thresholdSchema: {
      consecutiveFailures: {
        label: "Consecutive failures",
        type: "number",
        unit: "checks",
        min: 1,
      },
    },
    remediationAction: "restart",
  },
  {
    rule: "token_spike",
    displayName: "Token Usage Spike",
    description:
      "Fires when token usage in a recent window exceeds a multiplier over a baseline window.",
    category: "cost",
    defaultSeverity: "WARNING",
    defaultEnabled: true,
    defaultThresholds: {
      multiplier: 2,
      recentWindowMin: 5,
      baselineWindowMin: 30,
      minRecentEvents: 2,
    },
    thresholdSchema: {
      multiplier: {
        label: "Spike multiplier",
        type: "number",
        unit: "x",
        min: 1.1,
      },
      recentWindowMin: {
        label: "Recent window",
        type: "number",
        unit: "min",
        min: 1,
      },
      baselineWindowMin: {
        label: "Baseline window",
        type: "number",
        unit: "min",
        min: 5,
      },
      minRecentEvents: {
        label: "Min recent events",
        type: "number",
        unit: "events",
        min: 1,
      },
    },
    remediationAction: "review_costs",
  },
  {
    rule: "budget_warning",
    displayName: "Budget Warning",
    description:
      "Fires when spend reaches the warning threshold configured in Budget Config.",
    category: "cost",
    defaultSeverity: "WARNING",
    defaultEnabled: true,
    defaultThresholds: null,
    thresholdSchema: {},
    remediationAction: "review_costs",
  },
  {
    rule: "budget_critical",
    displayName: "Budget Critical",
    description:
      "Fires when monthly spend reaches the critical threshold configured in Budget Config.",
    category: "cost",
    defaultSeverity: "CRITICAL",
    defaultEnabled: true,
    defaultThresholds: null,
    thresholdSchema: {},
    remediationAction: "review_costs",
  },
  {
    rule: "budget_daily_warning",
    displayName: "Daily Budget Warning",
    description:
      "Fires when daily spend reaches the warning threshold configured in Budget Config.",
    category: "cost",
    defaultSeverity: "WARNING",
    defaultEnabled: true,
    defaultThresholds: null,
    thresholdSchema: {},
    remediationAction: "review_costs",
  },
  {
    rule: "budget_daily_critical",
    displayName: "Daily Budget Critical",
    description:
      "Fires when daily spend reaches the critical threshold configured in Budget Config.",
    category: "cost",
    defaultSeverity: "CRITICAL",
    defaultEnabled: true,
    defaultThresholds: null,
    thresholdSchema: {},
    remediationAction: "review_costs",
  },
];

/** Lookup a rule definition by rule name. */
export function getAlertRuleDefinition(
  rule: string,
): AlertRuleDefinition | undefined {
  return ALERT_RULE_DEFINITIONS.find((d) => d.rule === rule);
}

/** Remediation action mapping — keyed by rule name. */
export const REMEDIATION_ACTIONS: Record<string, string> = Object.fromEntries(
  ALERT_RULE_DEFINITIONS.map((d) => [d.rule, d.remediationAction]),
);
