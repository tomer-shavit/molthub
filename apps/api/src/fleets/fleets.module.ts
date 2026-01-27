import { Module } from "@nestjs/common";
import { FleetService } from "./fleets.service";
import { FleetController } from "./fleets.controller";

@Module({
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule {}