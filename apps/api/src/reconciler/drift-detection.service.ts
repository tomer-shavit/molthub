import { Injectable, Inject, Logger } from "@nestjs/common";
import {
  BotInstance,
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
} from "@clawster/database";
import type { OpenClawManifest } from "@clawster/core";
import { ConfigGeneratorService } from "./config-generator.service";
import {
  GATEWAY_CONNECTION_SERVICE,
  type IGatewayConnectionService,
} from "./interfaces";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriftFinding {
  field: string;
  expected: unknown;
  actual: unknown;
  severity: "CRITICAL" | "WARNING" | "INFO";
}

export interface DriftCheckResult {
  hasDrift: boolean;
  findings: DriftFinding[];
  configHashExpected?: string;
  configHashActual?: string;
  gatewayReachable: boolean;
  gatewayHealthy?: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * DriftDetectionService (v2) — detects configuration drift and health
 * issues by communicating with the OpenClaw Gateway over WebSocket rather
 * than inspecting ECS task counts.
 *
 * Drift sources:
 *  - Config hash mismatch (desired vs actual via `config.get`)
 *  - Instance unreachable (gateway WS not connectable)
 *  - Instance unhealthy (gateway `health` reports not ok)
 *  - Status mismatch (gateway `status.state` != expected)
 *
 * The legacy ECS-based drift path is retained as a fallback for instances
 * with `deploymentType === "ECS_EC2"`.
 */
@Injectable()
export class DriftDetectionService {
  private readonly logger = new Logger(DriftDetectionService.name);

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    @Inject(GATEWAY_CONNECTION_SERVICE) private readonly gatewayConnection: IGatewayConnectionService,
    private readonly configGenerator: ConfigGeneratorService,
  ) {}

  // ------------------------------------------------------------------
  // Per-instance drift check
  // ------------------------------------------------------------------

  async checkDrift(
    instance: BotInstance,
    manifest: OpenClawManifest,
  ): Promise<DriftCheckResult> {
    const findings: DriftFinding[] = [];

    // Generate desired config hash
    const desiredConfig = this.configGenerator.generateOpenClawConfig(manifest);
    const desiredHash = this.configGenerator.generateConfigHash(desiredConfig);

    // Check: stored hash already mismatches
    if (instance.configHash && instance.configHash !== desiredHash) {
      findings.push({
        field: "configHash",
        expected: desiredHash,
        actual: instance.configHash,
        severity: "WARNING",
      });
    }

    // Attempt gateway connection
    let gatewayReachable = false;
    let gatewayHealthy: boolean | undefined;
    let actualHash: string | undefined;

    try {
      const client = await this.gatewayConnection.getGatewayClient(instance, 10_000);
      gatewayReachable = true;

      // Config drift via remote hash
      try {
        const remoteConfig = await client.configGet();
        actualHash = remoteConfig.hash;

        if (remoteConfig.hash !== desiredHash) {
          findings.push({
            field: "remoteConfigHash",
            expected: desiredHash,
            actual: remoteConfig.hash,
            severity: "CRITICAL",
          });
        }
      } catch (err) {
        this.logger.warn(`config.get failed for ${instance.id}: ${err}`);
        findings.push({
          field: "configGet",
          expected: "accessible",
          actual: "error",
          severity: "WARNING",
        });
      }

      // Health drift
      try {
        const health = await client.health();
        gatewayHealthy = health.ok;

        if (!health.ok) {
          findings.push({
            field: "gatewayHealth",
            expected: true,
            actual: false,
            severity: "CRITICAL",
          });
        }
      } catch (err) {
        this.logger.warn(`health check failed for ${instance.id}: ${err}`);
        findings.push({
          field: "healthCheck",
          expected: "accessible",
          actual: "error",
          severity: "WARNING",
        });
      }

      // Status drift
      try {
        const status = await client.status();
        if (status.state !== "running") {
          findings.push({
            field: "gatewayState",
            expected: "running",
            actual: status.state,
            severity: "CRITICAL",
          });
        }
      } catch {
        // status check is best-effort
      }
    } catch {
      // Gateway unreachable
      findings.push({
        field: "gatewayConnection",
        expected: "reachable",
        actual: "unreachable",
        severity: "CRITICAL",
      });
    }

    // Update instance health based on findings
    await this.updateHealthFromFindings(instance, findings, gatewayReachable, gatewayHealthy);

    return {
      hasDrift: findings.length > 0,
      findings,
      configHashExpected: desiredHash,
      configHashActual: actualHash,
      gatewayReachable,
      gatewayHealthy,
    };
  }

  // ------------------------------------------------------------------
  // Fleet-wide drift check
  // ------------------------------------------------------------------

  async checkAllInstances(): Promise<{ instanceId: string; result: DriftCheckResult }[]> {
    const { data: instances } = await this.botInstanceRepo.findMany({
      status: ["RUNNING", "DEGRADED"],
    });

    const results: { instanceId: string; result: DriftCheckResult }[] = [];

    for (const instance of instances) {
      // Parse the desired manifest from the JSON field
      let manifest: OpenClawManifest;
      try {
        manifest = instance.desiredManifest as unknown as OpenClawManifest;
        if (!manifest?.apiVersion) {
          this.logger.debug(`Skipping ${instance.id}: no valid v2 manifest`);
          continue;
        }
      } catch {
        continue;
      }

      try {
        const result = await this.checkDrift(instance, manifest);
        results.push({ instanceId: instance.id, result });

        if (result.hasDrift) {
          this.logger.warn(
            `Drift detected for ${instance.id}: ${result.findings.map((f) => f.field).join(", ")}`,
          );
        }
      } catch (error) {
        this.logger.error(`Drift check failed for ${instance.id}: ${error}`);
      }
    }

    return results;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async updateHealthFromFindings(
    instance: BotInstance,
    findings: DriftFinding[],
    gatewayReachable: boolean,
    gatewayHealthy: boolean | undefined,
  ): Promise<void> {
    const hasCritical = findings.some((f) => f.severity === "CRITICAL");

    let newHealth: string;
    if (!gatewayReachable) {
      newHealth = "UNKNOWN";
    } else if (gatewayHealthy === false || hasCritical) {
      newHealth = "UNHEALTHY";
    } else if (findings.length > 0) {
      newHealth = "DEGRADED";
    } else {
      newHealth = "HEALTHY";
    }

    // Only update if health actually changed
    if (instance.health !== newHealth) {
      await this.botInstanceRepo.updateHealth(instance.id, newHealth, new Date());
    }

    // Update GatewayConnection status
    const gwStatus = gatewayReachable
      ? "CONNECTED"
      : "DISCONNECTED";

    await this.botInstanceRepo.upsertGatewayConnection(instance.id, {
      status: gwStatus,
      lastHeartbeat: gatewayReachable ? new Date() : undefined,
    });
  }
}
