import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import {
  CONNECTOR_REPOSITORY,
  IConnectorRepository,
} from "@clawster/database";
import { CredentialEncryptionService } from "./credential-encryption.service";
import { SaveCredentialDto, ListSavedCredentialsQueryDto } from "./credential-vault.dto";

@Injectable()
export class CredentialVaultService {
  private readonly logger = new Logger(CredentialVaultService.name);

  constructor(
    @Inject(CONNECTOR_REPOSITORY) private readonly connectorRepo: IConnectorRepository,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  /** Save credentials encrypted, return masked version */
  async save(dto: SaveCredentialDto, userId: string) {
    this.validateCredentialShape(dto.type, dto.credentials);

    const encrypted = this.encryption.encrypt(dto.credentials);
    const masked = this.encryption.mask(dto.type, dto.credentials);

    const connector = await this.connectorRepo.createConnector({
      workspace: { connect: { id: dto.workspaceId } },
      name: dto.name,
      description: `Saved ${dto.type} credential`,
      type: dto.type,
      config: encrypted,
      status: "ACTIVE",
      isShared: true,
      tags: JSON.stringify({ credentialVault: true }),
      createdBy: userId,
    });

    this.logger.debug(`Saved ${dto.type} credential "${dto.name}" (${connector.id})`);

    return {
      id: connector.id,
      name: connector.name,
      type: connector.type,
      maskedConfig: masked,
      createdAt: connector.createdAt.toISOString(),
    };
  }

  /** List saved credentials with masked configs */
  async listSaved(query: ListSavedCredentialsQueryDto) {
    const result = await this.connectorRepo.findManyConnectors({
      workspaceId: query.workspaceId,
      type: query.type ? query.type : ["aws-account", "api-key"],
    });

    // Filter by credentialVault tag
    const connectors = result.data.filter((c) => {
      const tags = typeof c.tags === "string" ? c.tags : JSON.stringify(c.tags || {});
      return tags.includes("credentialVault");
    });

    return connectors.map((c) => {
      let maskedConfig: Record<string, unknown> = {};
      try {
        const decrypted = this.encryption.decrypt(c.config);
        maskedConfig = this.encryption.mask(c.type, decrypted);
      } catch (err) {
        this.logger.warn(`Failed to decrypt credential ${c.id}: ${err instanceof Error ? err.message : "unknown"}`);
        maskedConfig = {};
      }

      return {
        id: c.id,
        name: c.name,
        type: c.type,
        maskedConfig,
        createdAt: c.createdAt.toISOString(),
      };
    });
  }

  /** Resolve credentials for internal use only (returns plaintext). Never expose via HTTP. */
  async resolve(id: string, workspaceId: string): Promise<Record<string, unknown>> {
    const connector = await this.connectorRepo.findConnectorById(id);

    if (!connector || connector.workspaceId !== workspaceId) {
      throw new NotFoundException(`Saved credential ${id} not found`);
    }

    // Increment usage
    await this.connectorRepo.incrementUsageCount(id);

    return this.encryption.decrypt(connector.config);
  }

  /** Delete a saved credential */
  async delete(id: string, workspaceId: string): Promise<void> {
    const connector = await this.connectorRepo.findConnectorById(id);

    if (!connector || connector.workspaceId !== workspaceId) {
      throw new NotFoundException(`Saved credential ${id} not found`);
    }

    await this.connectorRepo.deleteConnector(id);

    this.logger.debug(`Deleted saved credential "${connector.name}" (${id})`);
  }

  /** Validate that credential objects contain required fields for their type */
  private validateCredentialShape(type: string, credentials: Record<string, unknown>): void {
    if (type === "aws-account") {
      if (!credentials.accessKeyId || typeof credentials.accessKeyId !== "string") {
        throw new BadRequestException("AWS credentials must include accessKeyId");
      }
      if (!credentials.secretAccessKey || typeof credentials.secretAccessKey !== "string") {
        throw new BadRequestException("AWS credentials must include secretAccessKey");
      }
    } else if (type === "api-key") {
      if (!credentials.apiKey || typeof credentials.apiKey !== "string") {
        throw new BadRequestException("API key credentials must include apiKey");
      }
      if (!credentials.provider || typeof credentials.provider !== "string") {
        throw new BadRequestException("API key credentials must include provider");
      }
    }
  }
}
