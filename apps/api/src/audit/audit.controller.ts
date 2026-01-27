import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuditService } from "./audit.service";
import { AuditEventResponseDto, ListAuditEventsQueryDto } from "./audit.dto";

@ApiTags("audit")
@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: "List audit events" })
  @ApiResponse({ status: 200, type: [AuditEventResponseDto] })
  async findAll(@Query() query: ListAuditEventsQueryDto): Promise<AuditEventResponseDto[]> {
    return this.auditService.findAll(query);
  }
}