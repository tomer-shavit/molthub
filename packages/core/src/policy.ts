import { InstanceManifest, validateManifest } from "./manifest";

// Note: Use PolicyViolation from policy-pack.ts for the enhanced version
export interface LegacyPolicyViolation {
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
  field?: string;
}

export interface PolicyResult {
  valid: boolean;
  violations: LegacyPolicyViolation[];
}

export class PolicyEngine {
  validate(manifest: unknown): PolicyResult {
    const violations: LegacyPolicyViolation[] = [];

    // First validate schema
    try {
      validateManifest(manifest);
    } catch (error) {
      if (error instanceof Error) {
        violations.push({
          code: "SCHEMA_INVALID",
          message: error.message,
          severity: "ERROR",
        });
      }
      return { valid: false, violations };
    }

    const validated = manifest as InstanceManifest;

    // Check 1: Forbid public admin panels
    if (validated.spec.policies?.forbidPublicAdmin !== false) {
      const channels = validated.spec.channels || [];
      for (const channel of channels) {
        if (channel.type === "webhook" && validated.spec.network?.inbound === "WEBHOOK") {
          // Allow webhook but warn about security
          const hasTokenValidation = channel.config && 
            typeof channel.config === "object" && 
            "verifyToken" in channel.config;
          
          if (!hasTokenValidation) {
            violations.push({
              code: "WEBHOOK_NO_TOKEN",
              message: "Webhook channel enabled without token verification. Add verifyToken to channel config.",
              severity: "ERROR",
              field: "spec.channels",
            });
          }
        }
      }
    }

    // Check 2: Block plaintext secrets
    const secrets = validated.spec.secrets || [];
    for (const secret of secrets) {
      if (secret.provider !== "aws-secrets-manager") {
        violations.push({
          code: "INVALID_SECRET_PROVIDER",
          message: `Secret '${secret.name}' must use AWS Secrets Manager`,
          severity: "ERROR",
          field: "spec.secrets",
        });
      }
    }

    // Check 3: Require secret manager
    if (validated.spec.policies?.requireSecretManager !== false) {
      if (secrets.length === 0 && validated.spec.channels.length > 0) {
        violations.push({
          code: "CHANNELS_WITHOUT_SECRETS",
          message: "Channels configured but no secrets referenced. Secrets are required for channel configuration.",
          severity: "WARNING",
          field: "spec.secrets",
        });
      }
    }

    // Check 4: Pin image tags (no latest)
    const image = validated.spec.runtime.image;
    if (image.includes(":latest")) {
      violations.push({
        code: "UNPINNED_IMAGE",
        message: "Image tag 'latest' is not allowed. Use a pinned version like 'v1.2.3'",
        severity: "ERROR",
        field: "spec.runtime.image",
      });
    }

    // Check 5: Skills must be explicit
    if (validated.spec.skills.mode === 'ALLOWLIST' && (!validated.spec.skills.allowlist || validated.spec.skills.allowlist.length === 0)) {
      violations.push({
        code: "NO_SKILLS_ALLOWED",
        message: "At least one skill must be in the allowlist",
        severity: "ERROR",
        field: "spec.skills.allowlist",
      });
    }

    // Check 6: Restricted egress is safer
    if (validated.spec.network?.egressPreset === "DEFAULT") {
      violations.push({
        code: "PERMISSIVE_EGRESS",
        message: "Egress preset is set to DEFAULT (permissive). Consider using RESTRICTED for better security.",
        severity: "WARNING",
        field: "spec.network.egressPreset",
      });
    }

    return {
      valid: violations.filter(v => v.severity === "ERROR").length === 0,
      violations,
    };
  }
}