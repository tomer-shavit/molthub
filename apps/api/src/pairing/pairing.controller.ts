import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
} from "@nestjs/common";
import { PairingService } from "./pairing.service";
import { PairingActionDto, ApproveByCodeDto, ListPairingsQueryDto } from "./pairing.dto";
// PairingState and OpenClawChannelType were enums, now plain strings after SQLite migration

@Controller("bot-instances/:id/pairings")
export class PairingController {
  constructor(private readonly pairingService: PairingService) {}

  @Get()
  async listPairings(
    @Param("id") id: string,
    @Query() query: ListPairingsQueryDto,
  ) {
    await this.pairingService.verifyInstanceExists(id);
    return this.pairingService.listPairings(
      id,
      query.state ? (query.state as string) : undefined,
    );
  }

  @Get("pending")
  async getPendingPairings(@Param("id") id: string) {
    await this.pairingService.verifyInstanceExists(id);
    return this.pairingService.getPendingPairings(id);
  }

  @Post("approve")
  async approvePairing(
    @Param("id") id: string,
    @Body() body: PairingActionDto,
  ) {
    await this.pairingService.verifyInstanceExists(id);
    return this.pairingService.approvePairing(
      id,
      body.channelType as string,
      body.senderId,
    );
  }

  @Post("reject")
  async rejectPairing(
    @Param("id") id: string,
    @Body() body: PairingActionDto,
  ) {
    await this.pairingService.verifyInstanceExists(id);
    return this.pairingService.rejectPairing(
      id,
      body.channelType as string,
      body.senderId,
    );
  }

  @Post("approve-all")
  async batchApproveAll(@Param("id") id: string) {
    await this.pairingService.verifyInstanceExists(id);
    return this.pairingService.batchApproveAll(id);
  }

  @Post("revoke")
  async revokePairing(
    @Param("id") id: string,
    @Body() body: PairingActionDto,
  ) {
    await this.pairingService.verifyInstanceExists(id);
    return this.pairingService.revokePairing(
      id,
      body.channelType as string,
      body.senderId,
    );
  }

  @Post("approve-by-code")
  async approveByCode(
    @Param("id") id: string,
    @Body() body: ApproveByCodeDto,
  ) {
    await this.pairingService.verifyInstanceExists(id);
    return this.pairingService.approveByCode(id, body.code);
  }

  @Post("sync")
  async syncFromGateway(@Param("id") id: string) {
    await this.pairingService.verifyInstanceExists(id);
    return this.pairingService.syncPairingsFromGateway(id);
  }
}
