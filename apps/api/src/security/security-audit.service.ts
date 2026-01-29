import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@molthub/database";
import {
  BUILTIN_MOLTBOT_POLICY_PACKS,
  MoltbotConfig,
  MoltbotEvaluationContext,
  MoltbotManifest,
  evaluateMoltbotPolicyPack,
} from "@molthub/core";
import * as crypto from "crypto";

// ── Interfaces ──────────────────────────────────────────────────────────

export interface SecurityFinding {
  ruleId: string;
  ruleName: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
  field?: string;
  currentValue?: unknown;
  suggestedFix?: Record<string, unknown>;
}

export interface SecurityAuditResult {
  instanceId: string;
  findings: SecurityFinding[];
  totalErrors: number;
  totalWarnings: number;
  totalInfo: number;
  auditedAt: Date;
  configHash?: string;
}

export interface SecurityFix {
  findingId: string;
  description: string;
  patch: Record<string, unknown>;
}

export interface ApplyFixResult {
  instanceId: string;
  appliedFixes: string[];
  failedFixes: Array<{ fixId: string; reason: string }>;
  newAudit: SecurityAuditResult;
}

// ── Service ─────────────────────────────────────────────────────────────

@Injectable()
export class MoltbotSecurityAuditService {
  /**
   * Run a full security audit on a Moltbot instance.
   * Evaluates all built-in Moltbot policy packs against the instance config.
   */
  async audit(instanceId: string): Promise<SecurityAuditResult> {
    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new NotFoundException(`Instance '${instanceId}' not found`);
    }

    const config = (instance.config as Record<string, unknown>) || {};
    const moltbotConfig = config as unknown as MoltbotConfig;
    const environment = ((instance as any).environment || "dev") as "dev" | "staging" | "prod";

    // Gather other instances for cross-instance checks
    const otherInstances = await prisma.botInstance.findMany({
      where: { id: { not: instanceId } },
      select: { id: true, config: true },
    });

    const context: MoltbotEvaluationContext = {
      environment,
      otherInstances: otherInstances.map((inst) => {
        const otherConfig = (inst.config as Record<string, unknown>) || {};
        const otherMoltbot = otherConfig as unknown as MoltbotConfig;
        return {
          instanceId: inst.id,
          workspace: otherMoltbot.agents?.defaults?.workspace,
          gatewayPort: otherMoltbot.gateway?.port,
        };
      }),
    };

    const findings: SecurityFinding[] = [];

    // Evaluate each built-in Moltbot policy pack
    for (const pack of BUILTIN_MOLTBOT_POLICY_PACKS) {
      // Check if the pack applies to this environment
      if (pack.targetEnvironments && !pack.targetEnvironments.includes(environment)) {
        continue;
      }

      const result = evaluateMoltbotPolicyPack(pack, instanceId, moltbotConfig, context);

      for (const violation of result.violations) {
        findings.push({
          ruleId: violation.ruleId,
          ruleName: violation.ruleName,
          severity: "ERROR",
          message: violation.message,
          field: violation.field ?? undefined,
          currentValue: violation.currentValue ?? undefined,
          suggestedFix: violation.suggestedValue
            ? this.buildMergePatch(violation.field ?? "", violation.suggestedValue)
            : undefined,
        });
      }

      for (const warning of result.warnings) {
        findings.push({
          ruleId: warning.ruleId,
          ruleName: warning.ruleName,
          severity: "WARNING",
          message: warning.message,
          field: warning.field ?? undefined,
          currentValue: warning.currentValue ?? undefined,
          suggestedFix: warning.suggestedValue
            ? this.buildMergePatch(warning.field ?? "", warning.suggestedValue)
            : undefined,
        });
      }
    }

    const configHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(config))
      .digest("hex")
      .slice(0, 16);

    return {
      instanceId,
      findings,
      totalErrors: findings.filter((f) => f.severity === "ERROR").length,
      totalWarnings: findings.filter((f) => f.severity === "WARNING").length,
      totalInfo: findings.filter((f) => f.severity === "INFO").length,
      auditedAt: new Date(),
      configHash,
    };
  }

  /**
   * Generate fix suggestions for all findings from an audit.
   */
  async suggestFixes(instanceId: string): Promise<SecurityFix[]> {
    const auditResult = await this.audit(instanceId);
    const fixes: SecurityFix[] = [];

    for (const finding of auditResult.findings) {
      const patch = finding.suggestedFix || this.generateDefaultFix(finding);
      if (patch && Object.keys(patch).length > 0) {
        fixes.push({
          findingId: finding.ruleId,
          description: `Fix: ${finding.message}`,
          patch,
        });
      }
    }

    return fixes;
  }

  /**
   * Apply selected fixes to an instance configuration.
   */
  async applyFixes(instanceId: string, fixIds: string[]): Promise<ApplyFixResult> {
    const fixes = await this.suggestFixes(instanceId);
    const appliedFixes: string[] = [];
    const failedFixes: Array<{ fixId: string; reason: string }> = [];

    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new NotFoundException(`Instance '${instanceId}' not found`);
    }

    let config = (instance.config as Record<string, unknown>) || {};

    for (const fixId of fixIds) {
      const fix = fixes.find((f) => f.findingId === fixId);
      if (!fix) {
        failedFixes.push({ fixId, reason: "Fix not found" });
        continue;
      }

      try {
        config = this.applyMergePatch(config, fix.patch);
        appliedFixes.push(fixId);
      } catch (error) {
        failedFixes.push({
          fixId,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Save updated config
    if (appliedFixes.length > 0) {
      await prisma.botInstance.update({
        where: { id: instanceId },
        data: { config: config as any },
      });
    }

    // Re-audit after applying fixes
    const newAudit = await this.audit(instanceId);

    return {
      instanceId,
      appliedFixes,
      failedFixes,
      newAudit,
    };
  }

  /**
   * Evaluate a manifest BEFORE provisioning to determine if it meets
   * security requirements. Returns blockers (must fix) and warnings (should fix).
   */
  async preProvisioningAudit(manifest: MoltbotManifest): Promise<{
    allowed: boolean;
    blockers: Array<{ ruleId: string; message: string; field?: string }>;
    warnings: Array<{ ruleId: string; message: string; field?: string }>;
  }> {
    // Extract the moltbot config from the manifest
    const config = manifest.spec.moltbotConfig;
    const rawEnv = manifest.metadata.environment ?? "dev";
    // Map "local" to "dev" for policy evaluation (MoltbotEvaluationContext only accepts dev/staging/prod)
    const environment: "dev" | "staging" | "prod" = rawEnv === "local" ? "dev" : rawEnv as "dev" | "staging" | "prod";

    const context: MoltbotEvaluationContext = { environment };

    const blockers: Array<{ ruleId: string; message: string; field?: string }> = [];
    const warnings: Array<{ ruleId: string; message: string; field?: string }> = [];

    // Evaluate all built-in policy packs
    for (const pack of BUILTIN_MOLTBOT_POLICY_PACKS) {
      // Skip packs that don't apply to this environment
      if (pack.targetEnvironments && !pack.targetEnvironments.includes(environment)) {
        continue;
      }

      const result = evaluateMoltbotPolicyPack(
        pack,
        "pre-provisioning",
        config as any,
        context,
      );

      for (const v of result.violations) {
        blockers.push({ ruleId: v.ruleId, message: v.message, field: v.field });
      }
      for (const w of result.warnings) {
        warnings.push({ ruleId: w.ruleId, message: w.message, field: w.field });
      }
    }

    return {
      allowed: blockers.length === 0,
      blockers,
      warnings,
    };
  }

  /**
   * Calculate a 0-100 security score for an instance based on its configuration.
   */
  calculateSecurityScore(config: Record<string, unknown>): number {
    let score = 0;

    // Gateway auth configured (20 points)
    const gateway = config.gateway as any;
    if (gateway?.auth?.token || gateway?.auth?.password) {
      score += 20;
    }

    // Sandbox enabled (20 points)
    const sandbox = config.sandbox as any;
    if (sandbox?.mode && sandbox.mode !== "off") {
      score += 15;
      // Bonus for Docker security options
      if (sandbox.docker?.readOnlyRootfs && sandbox.docker?.noNewPrivileges) {
        score += 5;
      }
    }

    // Allowlists configured (15 points)
    const channels = config.channels as any;
    if (channels) {
      const channelKeys = Object.keys(channels).filter(k => channels[k]?.enabled);
      const hasAllowlists = channelKeys.every(k => {
        const ch = channels[k];
        return ch.dmPolicy !== "open" && ch.groupPolicy !== "open";
      });
      if (channelKeys.length === 0 || hasAllowlists) {
        score += 15;
      }
    } else {
      score += 15; // No channels = no risk
    }

    // Tool profile not "full" (10 points)
    const tools = config.tools as any;
    if (!tools?.profile || tools.profile !== "full") {
      score += 10;
    }

    // Sensitive data redaction enabled (10 points)
    const logging = config.logging as any;
    if (logging?.redactSensitive === "tools") {
      score += 10;
    }

    // Gateway bound to localhost (10 points)
    if (!gateway?.host || gateway.host === "127.0.0.1" || gateway.host === "localhost") {
      score += 10;
    }

    // Skills verification (15 points)
    const skills = config.skills as any;
    if (skills?.allowUnverified !== true) {
      score += 15;
    }

    return Math.min(score, 100);
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private buildMergePatch(field: string, value: unknown): Record<string, unknown> {
    if (!field) return {};
    const parts = field.split(".");
    let patch: Record<string, unknown> = {};
    let current = patch;

    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
    return patch;
  }

  private applyMergePatch(
    target: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };

    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete result[key];
      } else if (typeof value === "object" && !Array.isArray(value) && value !== null) {
        result[key] = this.applyMergePatch(
          (result[key] as Record<string, unknown>) || {},
          value as Record<string, unknown>,
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private generateDefaultFix(finding: SecurityFinding): Record<string, unknown> {
    switch (finding.ruleId) {
      case "moltbot-require-gateway-auth":
        return { gateway: { auth: { token: "<REPLACE_WITH_SECURE_TOKEN>" } } };

      case "moltbot-require-dm-policy":
      case "moltbot-channel-dm-policy":
        return { channels: [{ dmPolicy: "pairing" }] };

      case "moltbot-forbid-elevated-tools":
        return { tools: { elevated: { allowFrom: ["admin"] } } };

      case "moltbot-require-sandbox":
        return { agents: { defaults: { sandbox: { mode: "docker" } } } };

      case "moltbot-limit-tool-profile":
        return { tools: { profile: "standard" } };

      case "moltbot-require-model-guardrails":
        return { agents: { defaults: { model: { maxTokens: 4096, temperature: 0.7 } } } };

      case "moltbot-require-workspace-isolation":
        return { agents: { defaults: { workspace: `/var/moltbot/workspaces/${finding.ruleId}-${Date.now()}` } } };

      case "moltbot-forbid-open-group-policy":
        return { channels: [{ groupPolicy: "allowlist" }] };

      default:
        return {};
    }
  }
}
