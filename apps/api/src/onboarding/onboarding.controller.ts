import { Controller, Get, Post, Body, Param, Request } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { OnboardingService } from "./onboarding.service";
import { OnboardingDeployDto, OnboardingPreviewDto } from "./onboarding.dto";

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

  @Post("deploy")
  async deploy(@Body() dto: OnboardingDeployDto, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id ?? "system";
    return this.onboardingService.deploy(dto, userId);
  }

  @Get("deploy/:instanceId/status")
  async getDeployStatus(@Param("instanceId") instanceId: string) {
    return this.onboardingService.getDeployStatus(instanceId);
  }
}
