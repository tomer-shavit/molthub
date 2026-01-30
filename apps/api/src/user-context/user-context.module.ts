import { Module } from "@nestjs/common";
import { UserContextController } from "./user-context.controller";
import { UserContextService } from "./user-context.service";

@Module({
  controllers: [UserContextController],
  providers: [UserContextService],
  exports: [UserContextService],
})
export class UserContextModule {}
