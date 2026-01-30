import { Controller, Get, Post, Body, Param } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ManifestsService } from "./manifests.service";
import { CreateManifestDto, ManifestResponseDto } from "./manifests.dto";
import { ManifestVersion } from "@molthub/database";

@ApiTags("manifests")
@Controller("instances/:instanceId/manifests")
export class ManifestsController {
  constructor(private readonly manifestsService: ManifestsService) {}

  @Get()
  @ApiOperation({ summary: "List manifest versions for an instance" })
  @ApiResponse({ status: 200, type: [ManifestResponseDto] })
  async findAll(@Param("instanceId") instanceId: string): Promise<ManifestVersion[]> {
    return this.manifestsService.findAll(instanceId);
  }

  @Post()
  @ApiOperation({ summary: "Create new manifest version" })
  @ApiResponse({ status: 201, type: ManifestResponseDto })
  @ApiResponse({ status: 400, description: "Invalid manifest or policy violation" })
  async create(
    @Param("instanceId") instanceId: string,
    @Body() dto: CreateManifestDto,
  ): Promise<ManifestVersion> {
    return this.manifestsService.create(instanceId, dto);
  }

  @Get("latest")
  @ApiOperation({ summary: "Get latest manifest version" })
  @ApiResponse({ status: 200, type: ManifestResponseDto })
  async getLatest(@Param("instanceId") instanceId: string): Promise<ManifestVersion> {
    return this.manifestsService.getLatest(instanceId);
  }

  @Post("reconcile")
  @ApiOperation({ summary: "Trigger reconcile for current manifest" })
  @ApiResponse({ status: 202, description: "Reconcile initiated" })
  async reconcile(@Param("instanceId") instanceId: string): Promise<void> {
    await this.manifestsService.triggerReconcile(instanceId);
  }
}