/**
 * OpenClaw Policy Types
 *
 * Interfaces and types used for OpenClaw policy evaluation.
 */

import type { PolicyViolation } from "../policy-pack";

// ── OpenClaw config shape (used for evaluation) ─────────────────────────
export interface OpenClawConfig {
  gateway?: {
    port?: number;
    host?: string;
    auth?: {
      token?: string;
      password?: string;
    };
  };
  channels?: Array<{
    name?: string;
    dmPolicy?: string;
    groupPolicy?: string;
    [key: string]: unknown;
  }>;
  tools?: {
    profile?: string;
    allow?: string[];
    elevated?: {
      enabled?: boolean;
      allowFrom?: string[];
    };
  };
  tokenRotation?: {
    enabled?: boolean;
    [key: string]: unknown;
  };
  skills?: {
    entries?: Record<string, { source?: string; integrity?: { sha256?: string } }>;
    allowUnverified?: boolean;
    [key: string]: unknown;
  };
  agents?: {
    defaults?: {
      sandbox?: {
        mode?: string;
      };
      workspace?: string;
      model?: {
        maxTokens?: number;
        temperature?: number;
        [key: string]: unknown;
      };
    };
  };
  filePermissions?: {
    configFileMode?: string;
    stateDirMode?: string;
  };
  sandbox?: {
    mode?: string;
    docker?: {
      readOnlyRootfs?: boolean;
      noNewPrivileges?: boolean;
      dropCapabilities?: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── Evaluation context ──────────────────────────────────────────────────
export interface OpenClawEvaluationContext {
  environment: "dev" | "staging" | "prod";
  /** Other instances used for cross-instance checks */
  otherInstances?: Array<{
    instanceId: string;
    workspace?: string;
    gatewayPort?: number;
  }>;
}

// ── Rule evaluation result ──────────────────────────────────────────────
export interface OpenClawRuleResult {
  passed: boolean;
  violation?: PolicyViolation;
}

// ── Full pack evaluation result ─────────────────────────────────────────
export interface OpenClawPolicyEvaluationResult {
  packId: string;
  packName: string;
  instanceId: string;
  valid: boolean;
  violations: PolicyViolation[];
  warnings: PolicyViolation[];
  evaluatedAt: Date;
}
