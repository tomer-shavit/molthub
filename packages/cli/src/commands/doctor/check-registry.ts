/**
 * Check Registry
 *
 * Manages available doctor checks and supports extension.
 */

import type { IDoctorCheck } from "./checks/check.interface";
import { NodeVersionCheck } from "./checks/node-version.check";
import { DockerCheck } from "./checks/docker.check";
import { DockerComposeCheck } from "./checks/docker-compose.check";
import { SysboxCheck } from "./checks/sysbox.check";
import { AwsCredentialsCheck } from "./checks/aws-credentials.check";
import { ClawsterConfigCheck } from "./checks/clawster-config.check";
import { EnvironmentVarsCheck } from "./checks/environment-vars.check";
import { PnpmCheck } from "./checks/pnpm.check";
import { SshPermissionsCheck } from "./checks/ssh-permissions.check";
import { DockerSocketCheck } from "./checks/docker-socket.check";
import { PlaintextSecretsCheck } from "./checks/plaintext-secrets.check";
import { Fail2banCheck } from "./checks/fail2ban.check";

export interface CheckFilter {
  securityOnly?: boolean;
  platform?: NodeJS.Platform;
}

export class CheckRegistry {
  private checks: Map<string, IDoctorCheck> = new Map();

  /**
   * Create a registry.
   * @param registerDefaults - If true, registers built-in checks. Set to false for testing.
   */
  constructor(registerDefaults: boolean = true) {
    if (registerDefaults) {
      this.registerDefaultChecks();
    }
  }

  /**
   * Create a registry with custom checks only (for testing).
   */
  static createEmpty(): CheckRegistry {
    return new CheckRegistry(false);
  }

  /**
   * Create a registry with specific checks (for testing).
   */
  static withChecks(checks: IDoctorCheck[]): CheckRegistry {
    const registry = new CheckRegistry(false);
    for (const check of checks) {
      registry.register(check);
    }
    return registry;
  }

  /**
   * Register a check.
   */
  register(check: IDoctorCheck): void {
    this.checks.set(check.id, check);
  }

  /**
   * Unregister a check by ID.
   */
  unregister(checkId: string): void {
    this.checks.delete(checkId);
  }

  /**
   * Get a specific check by ID.
   */
  getCheck(id: string): IDoctorCheck | undefined {
    return this.checks.get(id);
  }

  /**
   * Get all checks matching the filter.
   */
  getChecks(filter?: CheckFilter): IDoctorCheck[] {
    let result = Array.from(this.checks.values());

    // Filter by security mode
    if (filter?.securityOnly) {
      // In security mode, show only security checks
      result = result.filter((check) => check.securityOnly);
    } else if (filter?.securityOnly === false) {
      // In normal mode, exclude security-only checks
      // Actually, we want to run all checks in normal mode
      // Security-only checks are run in both modes
    }

    // Filter by platform
    if (filter?.platform) {
      result = result.filter((check) => {
        if (!check.platforms) return true;
        return check.platforms.includes(filter.platform!);
      });
    }

    return result;
  }

  /**
   * Get checks for normal mode (non-security and all).
   */
  getNormalChecks(platform: NodeJS.Platform): IDoctorCheck[] {
    return Array.from(this.checks.values()).filter((check) => {
      // Include check if it's not security-only
      if (check.securityOnly) return false;
      // Filter by platform
      if (check.platforms && !check.platforms.includes(platform)) return false;
      return true;
    });
  }

  /**
   * Get security checks.
   */
  getSecurityChecks(platform: NodeJS.Platform): IDoctorCheck[] {
    return Array.from(this.checks.values()).filter((check) => {
      // Include all security checks
      if (!check.securityOnly) return false;
      // Filter by platform
      if (check.platforms && !check.platforms.includes(platform)) return false;
      return true;
    });
  }

  /**
   * Get all checks for both modes (normal + security).
   */
  getAllChecks(platform: NodeJS.Platform): IDoctorCheck[] {
    return Array.from(this.checks.values()).filter((check) => {
      // Filter by platform
      if (check.platforms && !check.platforms.includes(platform)) return false;
      return true;
    });
  }

  private registerDefaultChecks(): void {
    // System checks (non-security)
    this.register(new NodeVersionCheck());
    this.register(new DockerCheck());
    this.register(new DockerComposeCheck());
    this.register(new SysboxCheck());
    this.register(new AwsCredentialsCheck());
    this.register(new ClawsterConfigCheck());
    this.register(new EnvironmentVarsCheck());
    this.register(new PnpmCheck());

    // Security checks
    this.register(new SshPermissionsCheck());
    this.register(new DockerSocketCheck());
    this.register(new PlaintextSecretsCheck());
    this.register(new Fail2banCheck());
  }
}
