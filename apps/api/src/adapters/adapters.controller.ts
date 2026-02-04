import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AdaptersService } from "./adapters.service";
import type { AdapterMetadataDto } from "./dto/adapter-metadata.dto";

@ApiTags("adapters")
@Controller("adapters")
export class AdaptersController {
  constructor(private readonly adaptersService: AdaptersService) {}

  /**
   * This endpoint is intentionally public (no authentication required).
   * The deploy wizard needs to display available deployment options before
   * the user is authenticated (first-time setup flow).
   */
  @Get()
  @ApiOperation({
    summary: "Get all available deployment target adapters",
    description:
      "Returns metadata for all registered deployment target adapters, including capabilities, credential requirements, and tier specifications. This endpoint is public to support the pre-auth wizard flow.",
  })
  @ApiResponse({
    status: 200,
    description: "List of adapter metadata",
  })
  getAllAdapters(): AdapterMetadataDto[] {
    return this.adaptersService.getAllAdapters();
  }
}
