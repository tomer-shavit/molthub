import { Controller, Post, Param, Body } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { ReconcilerService, ReconcileResult } from "./reconciler.service";

@ApiTags("reconciler")
@Controller("reconciler")
export class ReconcilerController {
  constructor(private readonly reconcilerService: ReconcilerService) {}

  @Post("reconcile/:instanceId")
  @ApiOperation({ summary: "Manually trigger reconciliation" })
  async reconcile(@Param("instanceId") instanceId: string): Promise<ReconcileResult> {
    return this.reconcilerService.reconcile(instanceId);
  }
}