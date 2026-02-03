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
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { Request } from "express";
import { BotTeamsService } from "./bot-teams.service";
import {
  CreateBotTeamMemberDto,
  UpdateBotTeamMemberDto,
  BotTeamQueryDto,
  DelegateTaskDto,
} from "./bot-teams.dto";

// Hardcoded workspace ID for now (same pattern used across the API)
const WORKSPACE_ID = "default";

@ApiTags("bot-teams")
@Controller("bot-teams")
export class BotTeamsController {
  constructor(private readonly botTeamsService: BotTeamsService) {}

  // ---- Delegate (must be before :id route) ---------------------------------

  @Post("delegate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delegate a task to a team member (called by bots)" })
  async delegate(@Body() dto: DelegateTaskDto, @Req() req: Request) {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing API key");
    }
    const apiKey = authHeader.slice(7);
    return this.botTeamsService.delegateToMember(dto, apiKey);
  }

  // ---- List ----------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: "List team members with optional filters" })
  async findAll(@Query() query: BotTeamQueryDto) {
    return this.botTeamsService.findAll(WORKSPACE_ID, query);
  }

  // ---- Create --------------------------------------------------------------

  @Post()
  @ApiOperation({ summary: "Add a team member to a bot" })
  async create(@Body() dto: CreateBotTeamMemberDto) {
    return this.botTeamsService.create(WORKSPACE_ID, dto);
  }

  // ---- Get one -------------------------------------------------------------

  @Get(":id")
  @ApiOperation({ summary: "Get a team member by ID" })
  @ApiParam({ name: "id", description: "Team member ID" })
  async findOne(@Param("id") id: string) {
    return this.botTeamsService.findOne(id);
  }

  // ---- Update --------------------------------------------------------------

  @Patch(":id")
  @ApiOperation({ summary: "Update a team member" })
  @ApiParam({ name: "id", description: "Team member ID" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateBotTeamMemberDto,
  ) {
    return this.botTeamsService.update(id, dto);
  }

  // ---- Delete --------------------------------------------------------------

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a team member" })
  @ApiParam({ name: "id", description: "Team member ID" })
  async remove(@Param("id") id: string) {
    await this.botTeamsService.remove(id);
  }
}
