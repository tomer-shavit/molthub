import { Module } from "@nestjs/common";
import { ChannelsController } from "./channels.controller";
import { ChannelsService } from "./channels.service";
import { ChannelAuthService } from "./channel-auth.service";
import { ChannelConfigGenerator } from "./channel-config-generator";
import { SecurityModule } from "../security/security.module";

@Module({
  imports: [SecurityModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, ChannelAuthService, ChannelConfigGenerator],
  exports: [ChannelsService, ChannelAuthService, ChannelConfigGenerator],
})
export class ChannelsModule {}
