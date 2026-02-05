import { Injectable, Inject, Logger } from "@nestjs/common";
import {
  BotInstance,
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
} from "@clawster/database";
import { ManifestParserService } from "./manifest-parser.service";
import { LifecycleManagerService } from "../lifecycle-manager.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DoctorCheck {
  name: string;
  status: "pass" | "warn" | "fail" | "skip";
  message: string;
}

export interface DoctorResult {
  instanceId: string;
  checks: DoctorCheck[];
  overallStatus: "healthy" | "degraded" | "unhealthy" | "error";
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * DoctorService — runs diagnostics on a bot instance.
 *
 * Single Responsibility: Execute health checks and diagnostics.
 *
 * Checks performed:
 * - Instance exists in database
 * - Gateway connection record exists
 * - Manifest is valid
 * - Gateway is reachable
 * - Gateway is healthy
 * - Config is in sync
 * - Infrastructure state
 */
@Injectable()
export class DoctorService {
  private readonly logger = new Logger(DoctorService.name);

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    private readonly manifestParser: ManifestParserService,
    private readonly lifecycleManager: LifecycleManagerService,
  ) {}

  /**
   * Run diagnostics on a single bot instance.
   *
   * @param instanceId - The bot instance ID to diagnose
   * @returns DoctorResult with all check outcomes
   */
  async diagnose(instanceId: string): Promise<DoctorResult> {
    const checks: DoctorCheck[] = [];

    // Check 1: Instance exists
    const instance = await this.botInstanceRepo.findById(instanceId);

    if (!instance) {
      return {
        instanceId,
        checks: [{ name: "instance_exists", status: "fail", message: "Instance not found" }],
        overallStatus: "error",
      };
    }
    checks.push({ name: "instance_exists", status: "pass", message: "Instance found in DB" });

    // Check 2: Gateway connection record
    const gatewayConnection = await this.botInstanceRepo.getGatewayConnection(instanceId);
    if (gatewayConnection) {
      checks.push({
        name: "gateway_record",
        status: "pass",
        message: `Gateway record: ${gatewayConnection.host}:${gatewayConnection.port} (${gatewayConnection.status})`,
      });
    } else {
      checks.push({
        name: "gateway_record",
        status: "warn",
        message: "No GatewayConnection record in DB",
      });
    }

    // Check 3: Manifest valid
    try {
      this.manifestParser.parse(instance);
      checks.push({ name: "manifest_valid", status: "pass", message: "Manifest is a valid v2 OpenClawManifest" });
    } catch (err) {
      checks.push({
        name: "manifest_valid",
        status: "fail",
        message: `Invalid manifest: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Check 4: Gateway reachable + healthy
    try {
      const status = await this.lifecycleManager.getStatus(instance);

      if (status.gatewayConnected) {
        checks.push({ name: "gateway_reachable", status: "pass", message: "Gateway WS connection succeeded" });
      } else {
        checks.push({ name: "gateway_reachable", status: "fail", message: "Cannot connect to gateway" });
      }

      if (status.gatewayHealth?.ok) {
        checks.push({ name: "gateway_healthy", status: "pass", message: `Gateway healthy (uptime: ${status.gatewayHealth.uptime}s)` });
      } else if (status.gatewayConnected) {
        checks.push({ name: "gateway_healthy", status: "warn", message: "Gateway connected but reports unhealthy" });
      } else {
        checks.push({ name: "gateway_healthy", status: "skip", message: "Skipped (gateway unreachable)" });
      }

      // Check 5: Config hash
      if (status.configHash && instance.configHash) {
        if (status.configHash === instance.configHash) {
          checks.push({ name: "config_sync", status: "pass", message: "Config hash matches" });
        } else {
          checks.push({
            name: "config_sync",
            status: "warn",
            message: `Config hash mismatch: DB=${instance.configHash?.slice(0, 12)} remote=${status.configHash?.slice(0, 12)}`,
          });
        }
      } else {
        checks.push({ name: "config_sync", status: "skip", message: "No config hash to compare" });
      }

      // Check 6: Infra state
      checks.push({
        name: "infra_state",
        status: status.infraState === "running" ? "pass" : "warn",
        message: `Infrastructure state: ${status.infraState}`,
      });
    } catch (err) {
      checks.push({
        name: "gateway_reachable",
        status: "fail",
        message: `Gateway check error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Determine overall status
    const hasFail = checks.some((c) => c.status === "fail");
    const hasWarn = checks.some((c) => c.status === "warn");
    const overallStatus = hasFail ? "unhealthy" : hasWarn ? "degraded" : "healthy";

    return { instanceId, checks, overallStatus };
  }
}
