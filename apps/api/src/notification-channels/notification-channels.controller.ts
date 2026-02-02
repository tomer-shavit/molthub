import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { NotificationChannelsService } from "./notification-channels.service";
import {
  CreateNotificationChannelDto,
  UpdateNotificationChannelDto,
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
  NotificationChannelQueryDto,
} from "./notification-channels.dto";

/**
 * Hardcoded workspace helper — returns the first workspace ID.
 * Replace with proper auth-based workspace resolution later.
 */
async function getDefaultWorkspaceId(): Promise<string> {
  const { prisma } = await import("@clawster/database");
  const workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    throw new NotFoundException("No workspace found. Complete onboarding first.");
  }
  return workspace.id;
}

@ApiTags("notification-channels")
@Controller("notification-channels")
export class NotificationChannelsController {
  constructor(
    private readonly service: NotificationChannelsService,
  ) {}

  // ---- Channel CRUD --------------------------------------------------------

  @Get()
  @ApiOperation({ summary: "List notification channels with optional filters" })
  async findAll(@Query() query: NotificationChannelQueryDto) {
    const workspaceId = await getDefaultWorkspaceId();
    return this.service.findAll(workspaceId, query);
  }

  @Post()
  @ApiOperation({ summary: "Create a notification channel" })
  async create(@Body() dto: CreateNotificationChannelDto) {
    const workspaceId = await getDefaultWorkspaceId();
    return this.service.create(workspaceId, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a notification channel by ID" })
  @ApiParam({ name: "id", description: "Notification channel ID" })
  async findOne(@Param("id") id: string) {
    const channel = await this.service.findOne(id);
    if (!channel) {
      throw new NotFoundException(`Notification channel ${id} not found`);
    }
    return channel;
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a notification channel" })
  @ApiParam({ name: "id", description: "Notification channel ID" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateNotificationChannelDto,
  ) {
    await this.ensureChannelExists(id);
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a notification channel" })
  @ApiParam({ name: "id", description: "Notification channel ID" })
  async remove(@Param("id") id: string) {
    await this.ensureChannelExists(id);
    await this.service.remove(id);
  }

  // ---- Test ----------------------------------------------------------------

  @Post(":id/test")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send a test message through the notification channel" })
  @ApiParam({ name: "id", description: "Notification channel ID" })
  async testChannel(@Param("id") id: string) {
    await this.ensureChannelExists(id);
    return this.service.testChannel(id);
  }

  // ---- Notification Rules --------------------------------------------------

  @Post(":id/rules")
  @ApiOperation({ summary: "Create a notification rule for a channel" })
  @ApiParam({ name: "id", description: "Notification channel ID" })
  async createRule(
    @Param("id") id: string,
    @Body() dto: CreateNotificationRuleDto,
  ) {
    await this.ensureChannelExists(id);
    // Override channelId from the URL param for consistency
    dto.channelId = id;
    return this.service.createRule(dto);
  }

  @Patch("rules/:ruleId")
  @ApiOperation({ summary: "Update a notification rule" })
  @ApiParam({ name: "ruleId", description: "Notification rule ID" })
  async updateRule(
    @Param("ruleId") ruleId: string,
    @Body() dto: UpdateNotificationRuleDto,
  ) {
    return this.service.updateRule(ruleId, dto);
  }

  @Delete("rules/:ruleId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a notification rule" })
  @ApiParam({ name: "ruleId", description: "Notification rule ID" })
  async removeRule(@Param("ruleId") ruleId: string) {
    await this.service.removeRule(ruleId);
  }

  // ---- Helpers -------------------------------------------------------------

  private async ensureChannelExists(id: string): Promise<void> {
    const channel = await this.service.findOne(id);
    if (!channel) {
      throw new NotFoundException(`Notification channel ${id} not found`);
    }
  }
}
