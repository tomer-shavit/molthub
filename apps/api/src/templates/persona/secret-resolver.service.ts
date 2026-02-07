import { Injectable, Inject, Logger, Optional } from "@nestjs/common";
import type { ISecretResolver } from "./interfaces";
import { VaultService } from "../../vault/vault.service";

// =============================================================================
// Secret Resolver Service
// =============================================================================

/**
 * SecretResolverService — resolves and stores secrets based on deployment type.
 *
 * Single Responsibility: Manage secret references and storage across deployment targets.
 * Delegates actual storage to VaultService which routes to the correct cloud provider.
 */
@Injectable()
export class SecretResolverService implements ISecretResolver {
  private readonly logger = new Logger(SecretResolverService.name);

  constructor(
    @Optional() @Inject(VaultService) private readonly vaultService?: VaultService,
  ) {}

  /**
   * Resolve a secret reference to its value or environment variable reference.
   *
   * @param secretKey - The key identifying the secret (e.g., "bufferApiKey")
   * @param secretValue - The actual secret value
   * @param deploymentType - The deployment target type
   * @returns The resolved reference format for the deployment type
   */
  async resolveSecretRef(
    secretKey: string,
    secretValue: string,
    deploymentType: string,
  ): Promise<string> {
    switch (deploymentType) {
      case "local":
      case "docker":
        // For local/docker, use environment variable reference
        const envVarName = this.toEnvVarName(secretKey);
        return `\${${envVarName}}`;

      case "ecs-ec2":
        // For ECS, use AWS Secrets Manager reference
        // Format: ${aws:secretsmanager:secret-name:key}
        return `\${aws:secretsmanager:clawster/${secretKey}}`;

      case "gce":
        // For GCE, use Secret Manager reference
        return `\${gcp:secretmanager:clawster-${secretKey}}`;

      case "azure-vm":
        // For Azure, use Key Vault reference
        return `\${azure:keyvault:clawster-${secretKey}}`;

      default:
        // Default to env var reference
        this.logger.warn(
          `Unknown deployment type "${deploymentType}", using env var reference`,
        );
        return `\${${this.toEnvVarName(secretKey)}}`;
    }
  }

  /**
   * Store a secret in the appropriate secret store for the deployment type.
   *
   * @param instanceId - The bot instance ID
   * @param secretKey - The key identifying the secret
   * @param secretValue - The actual secret value
   * @param deploymentType - The deployment target type
   */
  async storeSecret(
    instanceId: string,
    secretKey: string,
    secretValue: string,
    _deploymentType: string,
  ): Promise<void> {
    if (!this.vaultService) {
      this.logger.warn(
        `VaultService not available — secret "${secretKey}" for instance ${instanceId} not stored`,
      );
      return;
    }

    await this.vaultService.storeSecret(instanceId, secretKey, secretValue);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert a camelCase secret key to SCREAMING_SNAKE_CASE env var name.
   * Example: "bufferApiKey" -> "BUFFER_API_KEY"
   */
  private toEnvVarName(secretKey: string): string {
    return secretKey
      .replace(/([A-Z])/g, "_$1")
      .toUpperCase()
      .replace(/^_/, "");
  }
}
