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
import { ProfilesService } from "./profiles.service";
import { CreateProfileDto, UpdateProfileDto, ListProfilesQueryDto } from "./profiles.dto";
import { Profile } from "@clawster/database";

@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  create(@Body() dto: CreateProfileDto): Promise<Profile> {
    return this.profilesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListProfilesQueryDto): Promise<Profile[]> {
    return this.profilesService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<Profile> {
    return this.profilesService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProfileDto): Promise<Profile> {
    return this.profilesService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.profilesService.remove(id);
  }
}