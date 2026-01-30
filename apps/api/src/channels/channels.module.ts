import { Module } from "@nestjs/common";
import { ChannelsController } from "./channels.controller";
import { ChannelsService } from "./channels.service";
import { ChannelAuthService } from "./channel-auth.service";
import { ChannelConfigGenerator } from "./channel-config-generator";
import { SecurityModule } from "../security/security.module";
import { WhatsAppAuthService } from "./auth/whatsapp-auth.service";
import { TelegramAuthService } from "./auth/telegram-auth.service";
import { DiscordAuthService } from "./auth/discord-auth.service";
import { SlackAuthService } from "./auth/slack-auth.service";
import { ChannelAuthFactory } from "./auth/auth-factory";

@Module({
  imports: [SecurityModule],
  controllers: [ChannelsController],
  providers: [
    ChannelsService,
    ChannelAuthService,
    ChannelConfigGenerator,
    WhatsAppAuthService,
    TelegramAuthService,
    DiscordAuthService,
    SlackAuthService,
    ChannelAuthFactory,
  ],
  exports: [
    ChannelsService,
    ChannelAuthService,
    ChannelConfigGenerator,
    ChannelAuthFactory,
  ],
})
export class ChannelsModule {}
