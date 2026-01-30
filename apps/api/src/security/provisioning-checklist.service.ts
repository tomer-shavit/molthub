import { Injectable, Logger } from "@nestjs/common";

export interface ChecklistItem {
  id: string;
  category: string;
  description: string;
  status: "pass" | "fail" | "warn" | "skip";
  remediation?: string;
  attackVector?: string;
}

export interface ChecklistResult {
  passed: boolean;
  score: number;
  items: ChecklistItem[];
}

@Injectable()
export class ProvisioningChecklistService {
  private readonly logger = new Logger(ProvisioningChecklistService.name);

  /**
   * Generate a security checklist for a Moltbot config before deployment.
   */
  generateChecklist(config: Record<string, unknown>, environment: string): ChecklistResult {
    const items: ChecklistItem[] = [];

    // 1. Gateway Auth (Hack #2)
    const gateway = config.gateway as any;
    items.push({
      id: "gateway-auth",
      category: "Authentication",
      description: "Gateway has authentication configured",
      status: gateway?.auth?.token || gateway?.auth?.password ? "pass" : "fail",
      remediation: "Add gateway.auth.token to your config",
      attackVector: "Hack #2: Exposed control gateway",
    });

    // 2. Gateway Host Binding (Hack #2)
    items.push({
      id: "gateway-host",
      category: "Network",
      description: "Gateway bound to localhost (not 0.0.0.0)",
      status: !gateway?.host || gateway.host === "127.0.0.1" || gateway.host === "localhost" ? "pass" : "warn",
      remediation: "Set gateway.host to '127.0.0.1'",
      attackVector: "Hack #2: Exposed control gateway",
    });

    // 3. DM Policy (Hack #3)
    const channels = config.channels as any;
    const channelKeys = channels ? Object.keys(channels).filter(k => channels[k]?.enabled) : [];
    const hasOpenDm = channelKeys.some(k => channels[k]?.dmPolicy === "open");
    items.push({
      id: "dm-policy",
      category: "Access Control",
      description: "No channels use open DM policy",
      status: hasOpenDm ? "fail" : "pass",
      remediation: "Set dmPolicy to 'allowlist' or 'pairing' on all channels",
      attackVector: "Hack #3: No user ID allowlist",
    });

    // 4. Group Policy (Hack #3)
    const hasOpenGroup = channelKeys.some(k => channels[k]?.groupPolicy === "open");
    items.push({
      id: "group-policy",
      category: "Access Control",
      description: "No channels use open group policy",
      status: hasOpenGroup ? "fail" : "pass",
      remediation: "Set groupPolicy to 'allowlist' on all channels",
      attackVector: "Hack #3: No user ID allowlist",
    });

    // 5. Sandbox Mode (Hack #7)
    const sandbox = config.sandbox as any;
    items.push({
      id: "sandbox-mode",
      category: "Isolation",
      description: "Sandbox is enabled",
      status: sandbox?.mode && sandbox.mode !== "off" ? "pass" : environment === "dev" ? "warn" : "fail",
      remediation: "Set sandbox.mode to 'all' or 'non-main'",
      attackVector: "Hack #7: No sandbox",
    });

    // 6. Docker Security Options (Hack #7)
    items.push({
      id: "docker-security",
      category: "Isolation",
      description: "Docker containers have security hardening",
      status: sandbox?.docker?.readOnlyRootfs && sandbox?.docker?.noNewPrivileges ? "pass" : sandbox?.mode === "off" ? "skip" : "warn",
      remediation: "Set sandbox.docker.readOnlyRootfs and noNewPrivileges to true",
      attackVector: "Hack #7: No sandbox",
    });

    // 7. Tool Profile (Hack #5, #6)
    const tools = config.tools as any;
    items.push({
      id: "tool-profile",
      category: "Access Control",
      description: "Tool profile is not 'full'",
      status: tools?.profile === "full" ? (environment === "prod" ? "fail" : "warn") : "pass",
      remediation: "Use 'coding' or 'minimal' tool profile",
      attackVector: "Hack #5/#6: Excessive tool access",
    });

    // 8. Elevated Tools (Hack #5)
    items.push({
      id: "elevated-tools",
      category: "Access Control",
      description: "Elevated tools have allowFrom restrictions",
      status: tools?.elevated?.enabled && (!tools.elevated.allowFrom || tools.elevated.allowFrom.length === 0) ? "fail" : "pass",
      remediation: "Add user IDs to tools.elevated.allowFrom or disable elevated tools",
      attackVector: "Hack #5: Unrestricted tool access",
    });

    // 9. Sensitive Redaction (General)
    const logging = config.logging as any;
    items.push({
      id: "redact-sensitive",
      category: "Data Protection",
      description: "Sensitive data redaction is enabled in logs",
      status: logging?.redactSensitive === "tools" ? "pass" : "warn",
      remediation: "Set logging.redactSensitive to 'tools'",
      attackVector: "General: Log leakage",
    });

    // 10. Skills Verification (Hack #9)
    const skills = config.skills as any;
    items.push({
      id: "skill-verification",
      category: "Supply Chain",
      description: "Unverified skills are not allowed",
      status: skills?.allowUnverified === true ? (environment === "prod" ? "fail" : "warn") : "pass",
      remediation: "Set skills.allowUnverified to false",
      attackVector: "Hack #9: Backdoored skills",
    });

    const failures = items.filter(i => i.status === "fail").length;
    const total = items.filter(i => i.status !== "skip").length;
    const passed = items.filter(i => i.status === "pass").length;

    return {
      passed: failures === 0,
      score: total > 0 ? Math.round((passed / total) * 100) : 100,
      items,
    };
  }
}
