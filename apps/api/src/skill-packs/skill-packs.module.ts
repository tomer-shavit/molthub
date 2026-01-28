import { Module } from '@nestjs/common';
import { SkillPacksService } from './skill-packs.service';
import { SkillPacksController } from './skill-packs.controller';

@Module({
  controllers: [SkillPacksController],
  providers: [SkillPacksService],
  exports: [SkillPacksService],
})
export class SkillPacksModule {}
