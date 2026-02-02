import { Injectable, Logger } from "@nestjs/common";
import {
  prisma,
} from "@clawster/database";
import {
  GatewayClient,
  GatewayConnectionError,
  GatewayTimeoutError,
} from "@clawster/gateway-client";
import type {
  GatewayConnectionOptions,
  GatewayAuth,
  GatewayHealthSnapshot,
  GatewayStatusSummary,
} from "@clawster/gateway-client";

// ---- Types -----------------------------------------------------------------

export type DiagnosticSeverity = "info" | "warning" | "error" | "critical";

export interface DiagnosticFinding {
  category: string;
  severity: DiagnosticSeverity;
  message: string;
  detail?: string;
  repairAction?: string;
}

export interface DiagnosticsResult {
  instanceId: string;
  instanceName: string;
  ranAt: Date;
  durationMs: number;
  findings: DiagnosticFinding[];
  summary: {
    info: number;
    warning: number;
    error: number;
    critical: number;
  };
}

export interface DoctorResult {
  instanceId: string;
  ranAt: Date;
  configValid: boolean;
  configErrors: string[];
  serviceStatus: string;
  serviceType: string | null;
  authChecks: Array<{
    channelType: string;
    state: string;
    ok: boolean;
    message: string;
  }>;
  gatewayReachable: boolean;
  overallPass: boolean;
}

// ---- Connection timeout for diagnostics ------------------------------------

const DIAG_TIMEOUT_MS = 15_000;

// ---- Service ---------------------------------------------------------------

@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name);

  /**
   * Run a full diagnostic check on an instance. This includes:
   * - Gateway connection test
   * - Config validation (current vs desired)
   * - Channel auth status check
   * - Service status
   * Returns structured findings with severity levels.
   */
  async runDiagnostics(instanceId: string): Promise<DiagnosticsResult> {
    const startMs = Date.now();
    const findings: DiagnosticFinding[] = [];

    // Load instance with relations
    const instance = await prisma.botInstance.findUniqueOrThrow({
      where: { id: instanceId },
      include: {
        gatewayConnection: true,
        openclawProfile: true,
        channelAuthSessions: true,
      },
    });

    // 1. Gateway connection test
    await this.checkGatewayConnection(instance, findings);

    // 2. Config validation (current vs desired)
    await this.checkConfigDrift(instance, findings);

    // 3. Channel auth status check
    this.checkChannelAuth(instance.channelAuthSessions, findings);

    // 4. Service status (profile / deployment)
    this.checkServiceStatus(instance, findings);

    // 5. Instance status sanity
    this.checkInstanceStatus(instance, findings);

    const summary = { info: 0, warning: 0, error: 0, critical: 0 };
    for (const f of findings) {
      summary[f.severity]++;
    }

    return {
      instanceId,
      instanceName: instance.name,
      ranAt: new Date(),
      durationMs: Date.now() - startMs,
      findings,
      summary,
    };
  }

  /**
   * Run a doctor check (simplified openclaw doctor equivalent).
   */
  async runDoctor(instanceId: string): Promise<DoctorResult> {
    const instance = await prisma.botInstance.findUniqueOrThrow({
      where: { id: instanceId },
      include: {
        gatewayConnection: true,
        openclawProfile: true,
        channelAuthSessions: true,
      },
    });

    // Config validation
    const configErrors: string[] = [];
    let configValid = true;

    if (!instance.desiredManifest) {
      configErrors.push("No desired manifest configured");
      configValid = false;
    }

    if (!instance.gatewayConnection) {
      configErrors.push("No gateway connection configured");
      configValid = false;
    }

    if (instance.gatewayConnection && !instance.gatewayConnection.authToken) {
      configErrors.push("Gateway auth token is missing");
      configValid = false;
    }

    // Service audit
    const profile = instance.openclawProfile;
    const serviceType = profile?.serviceType ?? null;
    let serviceStatus = "unknown";
    if (profile) {
      serviceStatus = profile.serviceName ? "configured" : "not_configured";
    } else {
      serviceStatus = "no_profile";
    }

    // Auth checks
    const authChecks = instance.channelAuthSessions.map((session) => {
      const ok = session.state === "PAIRED";
      let message = `State: ${session.state}`;
      if (session.state === "EXPIRED") {
        message = "Authentication has expired — re-pair required";
      } else if (session.state === "ERROR") {
        message = session.lastError ?? "Authentication error";
      } else if (session.state === "PENDING") {
        message = "Pairing not yet completed";
      }
      return {
        channelType: session.channelType,
        state: session.state,
        ok,
        message,
      };
    });

    // Gateway reachability
    let gatewayReachable = false;
    if (instance.gatewayConnection) {
      gatewayReachable = await this.testGatewayReachability(instance.gatewayConnection);
    }

    const overallPass =
      configValid &&
      gatewayReachable &&
      authChecks.every((a) => a.ok || a.state === "PENDING".toString());

    return {
      instanceId,
      ranAt: new Date(),
      configValid,
      configErrors,
      serviceStatus,
      serviceType,
      authChecks,
      gatewayReachable,
      overallPass,
    };
  }

  // ---- Private checks ------------------------------------------------------

  private async checkGatewayConnection(
    instance: {
      id: string;
      name: string;
      gatewayConnection: {
        host: string;
        port: number;
        authMode: string;
        authToken: string | null;
        status: string;
      } | null;
    },
    findings: DiagnosticFinding[],
  ): Promise<void> {
    if (!instance.gatewayConnection) {
      findings.push({
        category: "gateway",
        severity: "critical",
        message: "No gateway connection configured",
        repairAction: "Configure a gateway connection for this instance with host, port, and auth credentials.",
      });
      return;
    }

    const conn = instance.gatewayConnection;

    if (!conn.authToken) {
      findings.push({
        category: "gateway",
        severity: "error",
        message: "Gateway auth token is missing",
        repairAction: "Set the gateway auth token in the connection configuration.",
      });
    }

    // Attempt a live connection test
    const reachable = await this.testGatewayReachability(conn);

    if (reachable) {
      findings.push({
        category: "gateway",
        severity: "info",
        message: `Gateway at ${conn.host}:${conn.port} is reachable`,
      });
    } else {
      findings.push({
        category: "gateway",
        severity: "critical",
        message: `Gateway at ${conn.host}:${conn.port} is unreachable`,
        detail: "Could not establish a WebSocket connection within the timeout period.",
        repairAction:
          "Verify the gateway process is running. Check the host/port. Ensure network/firewall allows connections.",
      });
    }
  }

  private async checkConfigDrift(
    instance: {
      id: string;
      configHash: string | null;
      desiredManifest: unknown;
      appliedManifestVersion: string | null;
      gatewayConnection: {
        host: string;
        port: number;
        authMode: string;
        authToken: string | null;
        configHash: string | null;
      } | null;
    },
    findings: DiagnosticFinding[],
  ): Promise<void> {
    if (!instance.desiredManifest) {
      findings.push({
        category: "config",
        severity: "warning",
        message: "No desired manifest set for this instance",
        repairAction: "Assign a manifest/template to this instance.",
      });
      return;
    }

    // Check config hash drift between instance and gateway
    const gwHash = instance.gatewayConnection?.configHash;
    const instanceHash = instance.configHash;

    if (gwHash && instanceHash && gwHash !== instanceHash) {
      findings.push({
        category: "config",
        severity: "error",
        message: "Configuration drift detected",
        detail: `Instance config hash: ${instanceHash}, Gateway config hash: ${gwHash}`,
        repairAction: "Re-apply the desired configuration to the gateway using a config.apply call.",
      });
    } else if (!instanceHash) {
      findings.push({
        category: "config",
        severity: "warning",
        message: "Instance config hash not set — cannot verify drift",
        repairAction: "Run a config apply to establish a baseline config hash.",
      });
    } else {
      findings.push({
        category: "config",
        severity: "info",
        message: "Configuration hashes match — no drift detected",
      });
    }

    if (!instance.appliedManifestVersion) {
      findings.push({
        category: "config",
        severity: "warning",
        message: "No applied manifest version recorded",
        repairAction: "Deploy the desired manifest to this instance.",
      });
    }
  }

  private checkChannelAuth(
    sessions: Array<{
      channelType: string;
      state: string;
      expiresAt: Date | null;
      lastError: string | null;
    }>,
    findings: DiagnosticFinding[],
  ): void {
    if (sessions.length === 0) {
      findings.push({
        category: "channels",
        severity: "info",
        message: "No channel auth sessions found",
      });
      return;
    }

    for (const session of sessions) {
      if (session.state === "EXPIRED") {
        findings.push({
          category: "channels",
          severity: "error",
          message: `${session.channelType} auth has expired`,
          repairAction: `Re-pair the ${session.channelType} channel by initiating a new auth flow.`,
        });
      } else if (session.state === "ERROR") {
        findings.push({
          category: "channels",
          severity: "error",
          message: `${session.channelType} auth is in ERROR state`,
          detail: session.lastError ?? undefined,
          repairAction: `Reset and re-pair the ${session.channelType} channel.`,
        });
      } else if (session.state === "PENDING") {
        findings.push({
          category: "channels",
          severity: "warning",
          message: `${session.channelType} auth is pending — pairing not completed`,
          repairAction: `Complete the ${session.channelType} pairing flow.`,
        });
      } else if (session.state === "PAIRED") {
        // Check if about to expire
        if (session.expiresAt && session.expiresAt.getTime() < Date.now() + 24 * 60 * 60 * 1000) {
          findings.push({
            category: "channels",
            severity: "warning",
            message: `${session.channelType} auth expires within 24 hours`,
            repairAction: `Renew the ${session.channelType} auth before it expires.`,
          });
        } else {
          findings.push({
            category: "channels",
            severity: "info",
            message: `${session.channelType} auth is valid and paired`,
          });
        }
      }
    }
  }

  private checkServiceStatus(
    instance: {
      status: string;
      openclawProfile: {
        serviceName: string | null;
        serviceType: string | null;
      } | null;
      deploymentType: string | null;
    },
    findings: DiagnosticFinding[],
  ): void {
    const profile = instance.openclawProfile;

    if (!profile) {
      findings.push({
        category: "service",
        severity: "warning",
        message: "No openclaw profile configured for this instance",
        repairAction: "Create an openclaw profile to enable service management.",
      });
      return;
    }

    if (!profile.serviceName) {
      findings.push({
        category: "service",
        severity: "warning",
        message: "No service name configured in the openclaw profile",
        detail: `Service type: ${profile.serviceType ?? "not set"}`,
        repairAction: "Configure the service name in the openclaw profile for process management.",
      });
    } else {
      findings.push({
        category: "service",
        severity: "info",
        message: `Service configured: ${profile.serviceName} (${profile.serviceType ?? "unknown type"})`,
      });
    }

    if (!instance.deploymentType) {
      findings.push({
        category: "service",
        severity: "info",
        message: "No deployment type set — assuming local deployment",
      });
    }
  }

  private checkInstanceStatus(
    instance: {
      status: string;
      health: string;
      errorCount: number;
      lastError: string | null;
    },
    findings: DiagnosticFinding[],
  ): void {
    if (instance.status === "ERROR") {
      findings.push({
        category: "instance",
        severity: "critical",
        message: "Instance is in ERROR state",
        detail: instance.lastError ?? undefined,
        repairAction: "Investigate the error and reconcile the instance.",
      });
    } else if (instance.status === "STOPPED") {
      findings.push({
        category: "instance",
        severity: "warning",
        message: "Instance is stopped",
        repairAction: "Start the instance if it should be running.",
      });
    }

    if (instance.errorCount > 5) {
      findings.push({
        category: "instance",
        severity: "error",
        message: `Instance has ${instance.errorCount} consecutive errors`,
        repairAction: "Review recent logs and health snapshots. Consider restarting the instance.",
      });
    }
  }

  // ---- Helpers -------------------------------------------------------------

  private async testGatewayReachability(conn: {
    host: string;
    port: number;
    authMode: string;
    authToken: string | null;
  }): Promise<boolean> {
    const auth: GatewayAuth = conn.authMode === "token"
      ? { mode: "token", token: conn.authToken ?? "" }
      : { mode: "password", password: conn.authToken ?? "" };

    const options: GatewayConnectionOptions = {
      host: conn.host,
      port: conn.port,
      auth,
      timeoutMs: DIAG_TIMEOUT_MS,
      reconnect: { enabled: false, maxAttempts: 0, baseDelayMs: 0, maxDelayMs: 0 },
    };

    let client: GatewayClient | null = null;
    try {
      client = new GatewayClient(options);
      await client.connect();
      return true;
    } catch {
      return false;
    } finally {
      if (client) {
        try { await client.disconnect(); } catch { /* ignore */ }
      }
    }
  }
}
