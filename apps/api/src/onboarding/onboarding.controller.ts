import { Controller, Get, Post, Body, Param, Req } from "@nestjs/common";
import { Request as ExpressRequest } from "express";
import { Public } from "../auth/public.decorator";
import { OnboardingService } from "./onboarding.service";
import { OnboardingDeployDto, OnboardingPreviewDto, ValidateAwsDto } from "./onboarding.dto";

@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Public()
  @Get("status")
  async getStatus() {
    return this.onboardingService.checkFirstRun();
  }

  @Public()
  @Get("templates")
  getTemplates() {
    return this.onboardingService.getTemplates();
  }

  @Post("preview")
  async preview(@Body() dto: OnboardingPreviewDto) {
    return this.onboardingService.preview(dto);
  }

  @Post("validate-aws")
  async validateAwsCredentials(@Body() dto: ValidateAwsDto) {
    return this.onboardingService.validateAwsCredentials(dto);
  }

  @Post("deploy")
  async deploy(@Body() dto: OnboardingDeployDto, @Req() req: ExpressRequest) {
    const user = (req as unknown as Record<string, unknown>).user as Record<string, string> | undefined;
    const userId = user?.sub ?? user?.id ?? "system";
    return this.onboardingService.deploy(dto, userId);
  }

  @Get("deploy/:instanceId/status")
  async getDeployStatus(@Param("instanceId") instanceId: string) {
    return this.onboardingService.getDeployStatus(instanceId);
  }
}
