import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Body,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from "@nestjs/swagger";
import { HealthService, HealthCheckResult } from "./health.service";
import { OpenClawHealthService } from "./openclaw-health.service";
import { HealthAggregatorService } from "./health-aggregator.service";
import { DiagnosticsService } from "./diagnostics.service";
import { AlertingService } from "./alerting.service";

@ApiTags("health")
@Controller()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly openclawHealth: OpenClawHealthService,
    private readonly healthAggregator: HealthAggregatorService,
    private readonly diagnostics: DiagnosticsService,
    private readonly alerting: AlertingService,
  ) {}

  // ---- System health check ----------------------------------------

  @Get("health")
  @ApiOperation({ summary: "System health check endpoint" })
  async check(): Promise<HealthCheckResult> {
    return this.healthService.check();
  }

  // ---- Instance health endpoints -------------------------------------------

  @Get("instances/:id/health")
  @ApiOperation({ summary: "Get latest health snapshot for an instance" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  async getInstanceHealth(@Param("id") id: string) {
    const snapshot = await this.openclawHealth.getHealth(id);
    if (!snapshot) {
      throw new NotFoundException(
        `No health snapshot found for instance ${id}`,
      );
    }
    return snapshot;
  }

  @Get("instances/:id/health/deep")
  @ApiOperation({ summary: "Perform a live deep health check on an instance" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  async getDeepHealth(@Param("id") id: string) {
    return this.openclawHealth.getDeepHealth(id);
  }

  @Get("instances/:id/diagnostics")
  @ApiOperation({ summary: "Run full diagnostics on an instance" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  async runDiagnostics(@Param("id") id: string) {
    return this.diagnostics.runDiagnostics(id);
  }

  @Get("instances/:id/doctor")
  @ApiOperation({ summary: "Run doctor check on an instance" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  async runDoctor(@Param("id") id: string) {
    return this.diagnostics.runDoctor(id);
  }

  @Get("instances/:id/health/history")
  @ApiOperation({ summary: "Get health history time-series for an instance" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  @ApiQuery({ name: "from", required: true, description: "Start date (ISO 8601)" })
  @ApiQuery({ name: "to", required: true, description: "End date (ISO 8601)" })
  async getHealthHistory(
    @Param("id") id: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    if (!from || !to) {
      throw new BadRequestException("Both 'from' and 'to' query parameters are required");
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException("Invalid date format. Use ISO 8601 format.");
    }

    return this.healthAggregator.getHealthHistory(id, fromDate, toDate);
  }

  // ---- Fleet health --------------------------------------------------------

  @Get("fleet/:id/health")
  @ApiOperation({ summary: "Get aggregated health for a fleet" })
  @ApiParam({ name: "id", description: "Fleet ID" })
  async getFleetHealth(@Param("id") id: string) {
    return this.healthAggregator.getFleetHealth(id);
  }

  // ---- Workspace health ----------------------------------------------------

  @Get("workspace/health")
  @ApiOperation({ summary: "Get global workspace health overview" })
  async getWorkspaceHealth() {
    return this.healthAggregator.getWorkspaceHealth();
  }

  // ---- Alerts --------------------------------------------------------------

  @Get("alerts")
  @ApiOperation({ summary: "List active alerts" })
  @ApiQuery({ name: "instanceId", required: false, description: "Filter by instance ID" })
  @ApiQuery({ name: "includeAcknowledged", required: false, description: "Include acknowledged alerts" })
  async getAlerts(
    @Query("instanceId") instanceId?: string,
    @Query("includeAcknowledged") includeAcknowledged?: string,
  ) {
    if (includeAcknowledged === "true") {
      return this.alerting.getAllAlerts(instanceId);
    }
    return this.alerting.getActiveAlerts(instanceId);
  }

  @Post("alerts/:id/acknowledge")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Acknowledge an alert" })
  @ApiParam({ name: "id", description: "Alert ID" })
  async acknowledgeAlert(
    @Param("id") id: string,
    @Body() body?: { acknowledgedBy?: string },
  ) {
    const alert = this.alerting.acknowledgeAlert(id, body?.acknowledgedBy);
    if (!alert) {
      throw new NotFoundException(`Alert ${id} not found`);
    }
    return alert;
  }
}
