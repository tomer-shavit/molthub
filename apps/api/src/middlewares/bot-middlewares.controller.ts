import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from "@nestjs/common";
import { MiddlewareAssignmentService } from "./middleware-assignment.service";
import {
  AssignMiddlewareDto,
  UpdateMiddlewareAssignmentDto,
} from "./middlewares.dto";

@Controller("bot-instances/:instanceId/middlewares")
export class BotMiddlewaresController {
  constructor(
    private readonly assignmentService: MiddlewareAssignmentService,
  ) {}

  @Get()
  getAssignments(@Param("instanceId") instanceId: string) {
    return this.assignmentService.getAssignments(instanceId);
  }

  @Post()
  assign(
    @Param("instanceId") instanceId: string,
    @Body() dto: AssignMiddlewareDto,
  ) {
    return this.assignmentService.assignMiddleware(instanceId, dto);
  }

  @Patch(":package")
  update(
    @Param("instanceId") instanceId: string,
    @Param("package") packageName: string,
    @Body() dto: UpdateMiddlewareAssignmentDto,
  ) {
    return this.assignmentService.updateMiddleware(
      instanceId,
      decodeURIComponent(packageName),
      dto,
    );
  }

  @Delete(":package")
  remove(
    @Param("instanceId") instanceId: string,
    @Param("package") packageName: string,
  ) {
    return this.assignmentService.removeMiddleware(
      instanceId,
      decodeURIComponent(packageName),
    );
  }
}
