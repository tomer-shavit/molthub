import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { AlertsService } from "./alerts.service";
import { RemediationService } from "./remediation.service";
import { AlertQueryDto, AcknowledgeAlertDto, BulkAlertActionDto } from "./alerts.dto";

@ApiTags("alerts")
@Controller("alerts")
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly remediationService: RemediationService,
  ) {}

  // ---- List / Query --------------------------------------------------------

  @Get()
  @ApiOperation({ summary: "List alerts with filters and pagination" })
  async listAlerts(@Query() query: AlertQueryDto) {
    return this.alertsService.listAlerts(query);
  }

  @Get("summary")
  @ApiOperation({ summary: "Get alert counts by severity and status" })
  async getAlertSummary() {
    return this.alertsService.getAlertSummary();
  }

  @Get("active-count")
  @ApiOperation({ summary: "Get count of active alerts (for badge display)" })
  async getActiveAlertCount() {
    const count = await this.alertsService.getActiveAlertCount();
    return { count };
  }

  // ---- Bulk actions (must be before :id to avoid param conflicts) ----------

  @Post("bulk-acknowledge")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bulk acknowledge multiple alerts" })
  async bulkAcknowledge(@Body() body: BulkAlertActionDto) {
    const result = await this.alertsService.bulkAcknowledge(
      body.ids,
      body.acknowledgedBy,
    );
    return { updated: result.count };
  }

  @Post("bulk-resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bulk resolve multiple alerts" })
  async bulkResolve(@Body() body: BulkAlertActionDto) {
    const result = await this.alertsService.bulkResolve(body.ids);
    return { updated: result.count };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single alert by ID" })
  @ApiParam({ name: "id", description: "Alert ID" })
  async getAlert(@Param("id") id: string) {
    const alert = await this.alertsService.getAlert(id);
    if (!alert) {
      throw new NotFoundException(`Alert ${id} not found`);
    }
    return alert;
  }

  // ---- Status transitions --------------------------------------------------

  @Post(":id/acknowledge")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Acknowledge an alert" })
  @ApiParam({ name: "id", description: "Alert ID" })
  async acknowledgeAlert(
    @Param("id") id: string,
    @Body() body: AcknowledgeAlertDto,
  ) {
    await this.ensureAlertExists(id);
    return this.alertsService.acknowledgeAlert(id, body.acknowledgedBy);
  }

  @Post(":id/resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resolve an alert" })
  @ApiParam({ name: "id", description: "Alert ID" })
  async resolveAlert(@Param("id") id: string) {
    await this.ensureAlertExists(id);
    return this.alertsService.resolveAlert(id);
  }

  @Post(":id/suppress")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Suppress an alert" })
  @ApiParam({ name: "id", description: "Alert ID" })
  async suppressAlert(@Param("id") id: string) {
    await this.ensureAlertExists(id);
    return this.alertsService.suppressAlert(id);
  }

  // ---- Remediation ---------------------------------------------------------

  @Post(":id/remediate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Execute the remediation action for an alert" })
  @ApiParam({ name: "id", description: "Alert ID" })
  async remediateAlert(@Param("id") id: string) {
    await this.ensureAlertExists(id);
    return this.remediationService.executeRemediation(id);
  }

  // ---- Helpers -------------------------------------------------------------

  private async ensureAlertExists(id: string): Promise<void> {
    const alert = await this.alertsService.getAlert(id);
    if (!alert) {
      throw new NotFoundException(`Alert ${id} not found`);
    }
  }
}
