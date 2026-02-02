import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { OverlaysService } from "./overlays.service";
import { CreateOverlayDto, UpdateOverlayDto, ListOverlaysQueryDto } from "./overlays.dto";
import { Overlay } from "@clawster/database";

@Controller("overlays")
export class OverlaysController {
  constructor(private readonly overlaysService: OverlaysService) {}

  @Post()
  create(@Body() dto: CreateOverlayDto): Promise<Overlay> {
    return this.overlaysService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListOverlaysQueryDto): Promise<Overlay[]> {
    return this.overlaysService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<Overlay> {
    return this.overlaysService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateOverlayDto): Promise<Overlay> {
    return this.overlaysService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.overlaysService.remove(id);
  }
}