import { Module } from "@nestjs/common";
import { InputSanitizerService } from "./input-sanitizer.service";
import { ContentFilterService } from "./content-filter.service";
import { SkillVerificationService } from "./skill-verification.service";

@Module({
  providers: [
    InputSanitizerService,
    ContentFilterService,
    SkillVerificationService,
  ],
  exports: [
    InputSanitizerService,
    ContentFilterService,
    SkillVerificationService,
  ],
})
export class SecurityModule {}
