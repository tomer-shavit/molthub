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
import { PolicyPacksService } from "./policy-packs.service";
import { CreatePolicyPackDto, UpdatePolicyPackDto, ListPolicyPacksQueryDto, EvaluatePolicyDto } from "./policy-packs.dto";
import { PolicyPack } from "@molthub/database";

@Controller("policy-packs")
export class PolicyPacksController {
  constructor(private readonly policyPacksService: PolicyPacksService) {}

  @Post()
  create(@Body() dto: CreatePolicyPackDto): Promise<PolicyPack> {
    return this.policyPacksService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListPolicyPacksQueryDto): Promise<PolicyPack[]> {
    return this.policyPacksService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<PolicyPack> {
    return this.policyPacksService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePolicyPackDto): Promise<PolicyPack> {
    return this.policyPacksService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.policyPacksService.remove(id);
  }

  @Post("evaluate")
  evaluate(@Body() dto: EvaluatePolicyDto): Promise<Record<string, unknown>> {
    return this.policyPacksService.evaluate(dto);
  }
}