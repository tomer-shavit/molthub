import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { VaultService } from "./vault.service";
import { VaultApiKeyGuard } from "./vault-api-key.guard";
import { StoreSecretSchema, SecretKeySchema } from "./vault.dto";

@Controller("vault/:instanceId/secrets")
@UseGuards(VaultApiKeyGuard)
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  @Post()
  async storeSecret(
    @Param("instanceId") instanceId: string,
    @Body() body: unknown,
  ): Promise<{ success: boolean; key: string }> {
    const parsed = StoreSecretSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    await this.vaultService.storeSecret(instanceId, parsed.data.key, parsed.data.value);
    return { success: true, key: parsed.data.key };
  }

  @Get(":key")
  async getSecret(
    @Param("instanceId") instanceId: string,
    @Param("key") key: string,
  ): Promise<{ key: string; value: string }> {
    this.validateKey(key);
    const value = await this.vaultService.getSecret(instanceId, key);
    if (value === undefined) {
      throw new NotFoundException(`Secret "${key}" not found`);
    }
    return { key, value };
  }

  @Delete(":key")
  async deleteSecret(
    @Param("instanceId") instanceId: string,
    @Param("key") key: string,
  ): Promise<{ success: boolean; key: string }> {
    this.validateKey(key);
    await this.vaultService.deleteSecret(instanceId, key);
    return { success: true, key };
  }

  private validateKey(key: string): void {
    const parsed = SecretKeySchema.safeParse(key);
    if (!parsed.success) {
      throw new BadRequestException(`Invalid key: ${parsed.error.issues[0]?.message}`);
    }
  }
}
