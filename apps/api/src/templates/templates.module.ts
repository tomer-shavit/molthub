import { Module } from "@nestjs/common";
import { TemplatesService } from "./templates.service";
import { TemplatesController } from "./templates.controller";
import { ConfigGenerator } from "./config-generator";

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, ConfigGenerator],
  exports: [TemplatesService, ConfigGenerator],
})
export class TemplatesModule {}
