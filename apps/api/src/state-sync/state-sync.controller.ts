import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { StateSyncService } from "./state-sync.service";

class BackupRestoreDto {
  instanceId!: string;
  localPath!: string;
}

@ApiTags("state-sync")
@Controller("state-sync")
export class StateSyncController {
  constructor(private readonly stateSyncService: StateSyncService) {}

  @Get("status")
  @ApiOperation({ summary: "Get state sync status" })
  getStatus() {
    return this.stateSyncService.getStatus();
  }

  @Get("health")
  @ApiOperation({ summary: "Check state sync backend health" })
  async healthCheck() {
    const healthy = await this.stateSyncService.healthCheck();
    return { healthy, timestamp: new Date().toISOString() };
  }

  @Post("backup")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Manually trigger backup for an instance" })
  async backup(@Body() body: BackupRestoreDto) {
    if (!body.instanceId || !body.localPath) {
      throw new BadRequestException("instanceId and localPath are required");
    }
    return this.stateSyncService.backupInstance(body.instanceId, body.localPath);
  }

  @Post("restore")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Manually trigger restore for an instance" })
  async restore(@Body() body: BackupRestoreDto) {
    if (!body.instanceId || !body.localPath) {
      throw new BadRequestException("instanceId and localPath are required");
    }
    return this.stateSyncService.restoreInstance(
      body.instanceId,
      body.localPath,
    );
  }

  @Post("backup-all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Run backup cycle for all registered instances",
  })
  async backupAll() {
    return this.stateSyncService.runBackupCycle();
  }

  @Get("last-backup/:instanceId")
  @ApiOperation({ summary: "Get last backup timestamp for an instance" })
  @ApiParam({ name: "instanceId", description: "Bot instance ID" })
  async getLastBackup(@Param("instanceId") instanceId: string) {
    const timestamp =
      await this.stateSyncService.getLastBackupTimestamp(instanceId);
    return { instanceId, lastBackup: timestamp };
  }

  @Post("scheduler/start")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Start the periodic backup scheduler" })
  startScheduler() {
    this.stateSyncService.startScheduler();
    return { message: "Scheduler started" };
  }

  @Post("scheduler/stop")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Stop the periodic backup scheduler" })
  stopScheduler() {
    this.stateSyncService.stopScheduler();
    return { message: "Scheduler stopped" };
  }
}
