import { Module } from "@nestjs/common";
import { PairingController } from "./pairing.controller";
import { PairingService } from "./pairing.service";

@Module({
  controllers: [PairingController],
  providers: [PairingService],
  exports: [PairingService],
})
export class PairingModule {}
