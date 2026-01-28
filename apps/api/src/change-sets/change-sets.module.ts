import { Module } from "@nestjs/common";
import { ChangeSetsService } from "./change-sets.service";
import { ChangeSetsController } from "./change-sets.controller";

@Module({
  controllers: [ChangeSetsController],
  providers: [ChangeSetsService],
  exports: [ChangeSetsService],
})
export class ChangeSetsModule {}