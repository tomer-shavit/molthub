import { Module } from '@nestjs/common';
import { SkillPacksService } from './skill-packs.service';
import { SkillPacksController } from './skill-packs.controller';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [SkillPacksController],
  providers: [SkillPacksService],
  exports: [SkillPacksService],
})
export class SkillPacksModule {}
