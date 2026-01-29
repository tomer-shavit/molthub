import { Controller, Post, Get, Param, Body } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiBody } from "@nestjs/swagger";
import {
  ReconcilerService,
  ReconcileResult,
  DoctorResult,
  UpdateMoltbotResult,
} from "./reconciler.service";
import type { DriftCheckResult } from "./drift-detection.service";

@ApiTags("reconciler")
@Controller("instances")
export class ReconcilerController {
  constructor(private readonly reconcilerService: ReconcilerService) {}

  // ------------------------------------------------------------------
  // POST /instances/:id/reconcile
  // ------------------------------------------------------------------

  @Post(":id/reconcile")
  @ApiOperation({
    summary: "Trigger reconciliation for a bot instance",
    description:
      "Runs the v2 Moltbot-aware reconciliation flow: validate manifest, " +
      "generate config, provision or update via Gateway WS, health check.",
  })
  @ApiParam({ name: "id", description: "BotInstance ID" })
  async reconcile(@Param("id") instanceId: string): Promise<ReconcileResult> {
    return this.reconcilerService.reconcile(instanceId);
  }

  // ------------------------------------------------------------------
  // POST /instances/:id/doctor
  // ------------------------------------------------------------------

  @Post(":id/doctor")
  @ApiOperation({
    summary: "Run diagnostics on a bot instance",
    description:
      "Performs a series of health checks: manifest validation, gateway " +
      "reachability, config hash comparison, and infrastructure state.",
  })
  @ApiParam({ name: "id", description: "BotInstance ID" })
  async doctor(@Param("id") instanceId: string): Promise<DoctorResult> {
    return this.reconcilerService.doctor(instanceId);
  }

  // ------------------------------------------------------------------
  // POST /instances/:id/update
  // ------------------------------------------------------------------

  @Post(":id/update")
  @ApiOperation({
    summary: "Update Moltbot version on a bot instance",
    description:
      "Changes the Moltbot binary version and triggers a full restart.",
  })
  @ApiParam({ name: "id", description: "BotInstance ID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        version: { type: "string", example: "0.2.0" },
      },
      required: ["version"],
    },
  })
  async updateVersion(
    @Param("id") instanceId: string,
    @Body("version") version: string,
  ): Promise<UpdateMoltbotResult> {
    return this.reconcilerService.updateMoltbotVersion(instanceId, version);
  }

  // ------------------------------------------------------------------
  // GET /instances/:id/drift
  // ------------------------------------------------------------------

  @Get(":id/drift")
  @ApiOperation({
    summary: "Check configuration drift for a bot instance",
    description:
      "Compares the desired config hash with the actual config on the " +
      "running gateway. Reports findings including config mismatch, " +
      "unhealthy state, and unreachable gateway.",
  })
  @ApiParam({ name: "id", description: "BotInstance ID" })
  async checkDrift(@Param("id") instanceId: string): Promise<DriftCheckResult> {
    return this.reconcilerService.checkDrift(instanceId);
  }

  // ------------------------------------------------------------------
  // POST /instances/:id/stop
  // ------------------------------------------------------------------

  @Post(":id/stop")
  @ApiOperation({
    summary: "Stop a running bot instance",
    description: "Gracefully stops the instance via its deployment target.",
  })
  @ApiParam({ name: "id", description: "BotInstance ID" })
  async stop(@Param("id") instanceId: string): Promise<{ success: boolean }> {
    await this.reconcilerService.stop(instanceId);
    return { success: true };
  }

  // ------------------------------------------------------------------
  // POST /instances/:id/delete  (kept for backward compat)
  // ------------------------------------------------------------------

  @Post(":id/delete")
  @ApiOperation({
    summary: "Delete a bot instance and tear down its infrastructure",
    description: "Destroys the deployment target, cleans up DB records, and removes the instance.",
  })
  @ApiParam({ name: "id", description: "BotInstance ID" })
  async delete(@Param("id") instanceId: string): Promise<{ success: boolean }> {
    await this.reconcilerService.delete(instanceId);
    return { success: true };
  }
}
