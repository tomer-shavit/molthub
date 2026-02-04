/**
 * GCE Secret Manager Adapter
 *
 * Wraps @clawster/adapters-gcp SecretManagerService to implement
 * the IGceSecretManager interface. Use this when you want to inject
 * the adapters-gcp service instead of using direct SDK imports.
 */

import type { IGceSecretManager } from "./interfaces";

/**
 * Interface for the SecretManagerService from @clawster/adapters-gcp.
 * We define this here to avoid a hard dependency on the package.
 */
export interface ISecretManagerService {
  createSecret(name: string, value: string, labels?: Record<string, string>): Promise<string>;
  updateSecret(name: string, value: string): Promise<string>;
  getSecret(name: string): Promise<string | undefined>;
  deleteSecret(name: string): Promise<void>;
  secretExists(name: string): Promise<boolean>;
}

/**
 * Adapter that wraps @clawster/adapters-gcp SecretManagerService.
 *
 * This allows the GceTarget to use the adapters-gcp package for secret
 * management instead of direct @google-cloud/secret-manager SDK imports.
 *
 * @example
 * ```typescript
 * import { SecretManagerService } from "@clawster/adapters-gcp";
 *
 * const secretService = new SecretManagerService({ projectId: "my-project" });
 * const adapter = new GceSecretManagerAdapter(secretService);
 *
 * const target = new GceTarget({
 *   config: gceConfig,
 *   managers: {
 *     ...otherManagers,
 *     secretManager: adapter,
 *   },
 * });
 * ```
 */
export class GceSecretManagerAdapter implements IGceSecretManager {
  constructor(private readonly secretService: ISecretManagerService) {}

  async ensureSecret(name: string, value: string): Promise<void> {
    const exists = await this.secretService.secretExists(name);
    if (exists) {
      await this.secretService.updateSecret(name, value);
    } else {
      await this.secretService.createSecret(name, value, {
        "managed-by": "clawster",
      });
    }
  }

  async getSecret(name: string): Promise<string | undefined> {
    return this.secretService.getSecret(name);
  }

  async deleteSecret(name: string): Promise<void> {
    return this.secretService.deleteSecret(name);
  }

  async secretExists(name: string): Promise<boolean> {
    return this.secretService.secretExists(name);
  }
}
