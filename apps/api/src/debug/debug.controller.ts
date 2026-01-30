import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { DebugService } from "./debug.service";
import type {
  ProcessInfo,
  GatewayProbeResult,
  RedactedConfig,
  EnvVarStatus,
  FileInfo,
  ConnectivityResult,
} from "./debug.types";

@ApiTags("debug")
@Controller("instances/:id/debug")
export class DebugController {
  constructor(private readonly debugService: DebugService) {}

  @Get("processes")
  @ApiOperation({ summary: "List processes on the instance deployment target" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  async getProcesses(@Param("id") id: string): Promise<ProcessInfo[]> {
    return this.debugService.getProcesses(id);
  }

  @Get("gateway-probe")
  @ApiOperation({ summary: "Probe the Gateway WebSocket connection" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  async probeGateway(@Param("id") id: string): Promise<GatewayProbeResult> {
    return this.debugService.probeGateway(id);
  }

  @Get("config")
  @ApiOperation({ summary: "Get resolved config with secrets redacted" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  async getConfig(@Param("id") id: string): Promise<RedactedConfig> {
    return this.debugService.getConfig(id);
  }

  @Get("env")
  @ApiOperation({ summary: "Get environment variable status (set/unset)" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  async getEnvStatus(@Param("id") id: string): Promise<EnvVarStatus[]> {
    return this.debugService.getEnvStatus(id);
  }

  @Get("state-files")
  @ApiOperation({ summary: "List state files for the instance" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  async getStateFiles(@Param("id") id: string): Promise<FileInfo[]> {
    return this.debugService.getStateFiles(id);
  }

  @Get("connectivity")
  @ApiOperation({ summary: "Test network connectivity for the instance" })
  @ApiParam({ name: "id", description: "Bot instance ID" })
  async testConnectivity(@Param("id") id: string): Promise<ConnectivityResult> {
    return this.debugService.testConnectivity(id);
  }
}
