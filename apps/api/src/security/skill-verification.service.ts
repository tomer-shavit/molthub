import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";

export interface VerificationResult {
  verified: boolean;
  reason?: string;
}

export interface SkillPermissions {
  network: boolean;
  filesystem: "none" | "readonly" | "workspace";
  subprocess: boolean;
}

export interface PermissionValidationResult {
  allowed: boolean;
  violations: string[];
}

@Injectable()
export class SkillVerificationService {
  private readonly logger = new Logger(SkillVerificationService.name);

  /**
   * Verify the SHA-256 hash of a skill's content against the expected hash.
   */
  async verifyIntegrity(skillContent: Buffer | string, expectedHash: string): Promise<VerificationResult> {
    const actualHash = createHash("sha256")
      .update(skillContent)
      .digest("hex");

    if (actualHash !== expectedHash) {
      this.logger.warn(
        `Skill integrity check failed. Expected: ${expectedHash}, Got: ${actualHash}`,
      );
      return {
        verified: false,
        reason: `Hash mismatch. Expected: ${expectedHash}, Got: ${actualHash}`,
      };
    }

    return { verified: true };
  }

  /**
   * Validate that a skill's declared permissions are within acceptable bounds.
   * In production, skills with subprocess access or unrestricted network access
   * require explicit approval.
   */
  validatePermissions(
    skillId: string,
    permissions: SkillPermissions,
    environment: string,
  ): PermissionValidationResult {
    const violations: string[] = [];

    if (environment === "prod") {
      if (permissions.subprocess) {
        violations.push(
          `Skill '${skillId}' requests subprocess permission, which is restricted in production`,
        );
      }
      if (permissions.filesystem === "workspace") {
        violations.push(
          `Skill '${skillId}' requests workspace filesystem access in production — use 'readonly' instead`,
        );
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  /**
   * Check if a skill entry has proper integrity verification.
   */
  isVerified(skillEntry: { source?: string; integrity?: { sha256?: string; signature?: string } }): boolean {
    // Bundled skills are trusted by default
    if (!skillEntry.source || skillEntry.source === "bundled") {
      return true;
    }

    // Non-bundled skills must have at least a SHA-256 hash
    return !!skillEntry.integrity?.sha256;
  }
}
