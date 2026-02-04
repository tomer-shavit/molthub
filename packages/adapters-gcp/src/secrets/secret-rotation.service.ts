import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

export interface StaleSecret {
  name: string;
  lastRotated: Date;
  ageDays: number;
}

export interface SecretRotationServiceConfig {
  projectId: string;
  keyFilename?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
}

/**
 * Service for managing secret rotation in GCP Secret Manager.
 * Tracks rotation timestamps via secret labels and identifies stale secrets.
 */
export class SecretRotationService {
  private readonly client: SecretManagerServiceClient;
  private readonly projectId: string;

  constructor(config: SecretRotationServiceConfig) {
    const clientOptions: { projectId: string; keyFilename?: string; credentials?: { client_email: string; private_key: string } } = {
      projectId: config.projectId,
    };

    if (config.keyFilename) {
      clientOptions.keyFilename = config.keyFilename;
    } else if (config.credentials) {
      clientOptions.credentials = config.credentials;
    }

    this.client = new SecretManagerServiceClient(clientOptions);
    this.projectId = config.projectId;
  }

  /**
   * Rotate a secret by adding a new version and updating the lastRotated label.
   *
   * @param secretName - Secret name
   * @param newValue - New secret value
   */
  async rotateSecret(secretName: string, newValue: string): Promise<void> {
    const sanitizedName = this.sanitizeName(secretName);
    const fullSecretName = `projects/${this.projectId}/secrets/${sanitizedName}`;

    // Get existing secret to preserve labels
    const [secret] = await this.client.getSecret({
      name: fullSecretName,
    });

    // Add new version
    await this.client.addSecretVersion({
      parent: fullSecretName,
      payload: {
        data: Buffer.from(newValue, "utf8"),
      },
    });

    // Update labels with rotation timestamp
    const existingLabels = secret.labels || {};
    await this.client.updateSecret({
      secret: {
        name: fullSecretName,
        labels: {
          ...existingLabels,
          "last-rotated": this.formatDateLabel(new Date()),
        },
      },
      updateMask: {
        paths: ["labels"],
      },
    });
  }

  /**
   * Check if a secret is due for rotation based on its age.
   *
   * @param secretName - Secret name
   * @param maxAgeDays - Maximum age in days before rotation is due
   * @returns True if rotation is due
   */
  async checkRotationDue(secretName: string, maxAgeDays: number): Promise<boolean> {
    const sanitizedName = this.sanitizeName(secretName);
    const fullSecretName = `projects/${this.projectId}/secrets/${sanitizedName}`;

    const [secret] = await this.client.getSecret({
      name: fullSecretName,
    });

    const lastRotatedLabel = secret.labels?.["last-rotated"];
    if (!lastRotatedLabel) {
      // No rotation label means it was never rotated - it's due
      return true;
    }

    const lastRotated = this.parseDateLabel(lastRotatedLabel);
    const ageDays = (Date.now() - lastRotated.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays > maxAgeDays;
  }

  /**
   * List all Clawster-managed secrets that are older than the specified age.
   *
   * @param maxAgeDays - Maximum age in days
   * @returns Array of stale secrets with their age information
   */
  async listStaleSecrets(maxAgeDays: number): Promise<StaleSecret[]> {
    const stale: StaleSecret[] = [];
    const parent = `projects/${this.projectId}`;

    // Filter for Clawster-managed secrets
    const [secrets] = await this.client.listSecrets({
      parent,
      filter: 'labels.managed-by="clawster"',
    });

    for (const secret of secrets) {
      if (!secret.name) continue;

      const shortName = secret.name.split("/").pop() ?? "";
      const lastRotatedLabel = secret.labels?.["last-rotated"];

      let lastRotated: Date;
      if (lastRotatedLabel) {
        lastRotated = this.parseDateLabel(lastRotatedLabel);
      } else if (secret.createTime) {
        // Fall back to creation time if no rotation label
        lastRotated = new Date(
          Number(secret.createTime.seconds) * 1000 +
            Math.floor(Number(secret.createTime.nanos) / 1000000)
        );
      } else {
        lastRotated = new Date(0);
      }

      const ageDays = (Date.now() - lastRotated.getTime()) / (1000 * 60 * 60 * 24);

      if (ageDays > maxAgeDays) {
        stale.push({
          name: shortName,
          lastRotated,
          ageDays: Math.floor(ageDays),
        });
      }
    }

    return stale;
  }

  /**
   * Disable old versions of a secret, keeping only the latest N versions.
   *
   * @param secretName - Secret name
   * @param keepVersions - Number of versions to keep (default: 3)
   */
  async pruneOldVersions(secretName: string, keepVersions: number = 3): Promise<void> {
    const sanitizedName = this.sanitizeName(secretName);
    const fullSecretName = `projects/${this.projectId}/secrets/${sanitizedName}`;

    const [versions] = await this.client.listSecretVersions({
      parent: fullSecretName,
      filter: 'state:ENABLED',
    });

    // Sort by version number descending
    const sortedVersions = versions
      .filter((v) => v.name)
      .sort((a, b) => {
        const aNum = parseInt(a.name?.split("/").pop() ?? "0", 10);
        const bNum = parseInt(b.name?.split("/").pop() ?? "0", 10);
        return bNum - aNum;
      });

    // Disable versions beyond the keep limit
    for (let i = keepVersions; i < sortedVersions.length; i++) {
      const version = sortedVersions[i];
      if (version.name) {
        await this.client.disableSecretVersion({
          name: version.name,
        });
      }
    }
  }

  /**
   * Get rotation history for a secret.
   *
   * @param secretName - Secret name
   * @returns Array of version creation dates
   */
  async getRotationHistory(secretName: string): Promise<Date[]> {
    const sanitizedName = this.sanitizeName(secretName);
    const fullSecretName = `projects/${this.projectId}/secrets/${sanitizedName}`;

    const [versions] = await this.client.listSecretVersions({
      parent: fullSecretName,
    });

    return versions
      .filter((v) => v.createTime)
      .map((v) => {
        return new Date(
          Number(v.createTime!.seconds) * 1000 +
            Math.floor(Number(v.createTime!.nanos) / 1000000)
        );
      })
      .sort((a, b) => b.getTime() - a.getTime());
  }

  /**
   * Sanitize a secret name to comply with GCP naming requirements.
   */
  private sanitizeName(name: string): string {
    const sanitized = name
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 255);

    if (!sanitized) {
      throw new Error(`Invalid secret name: "${name}" produces empty sanitized value`);
    }

    if (!/^[a-zA-Z]/.test(sanitized)) {
      return `s${sanitized}`;
    }

    return sanitized;
  }

  /**
   * Format a date for use as a GCP label value.
   * Labels can only contain lowercase letters, numbers, hyphens, and underscores.
   */
  private formatDateLabel(date: Date): string {
    // Format: 2024-01-15-12-30-45 (ISO without special chars)
    return date.toISOString().replace(/[T:]/g, "-").replace(/\.\d{3}Z$/, "").toLowerCase();
  }

  /**
   * Parse a date from a GCP label value.
   */
  private parseDateLabel(label: string): Date {
    // Parse: 2024-01-15-12-30-45 -> 2024-01-15T12:30:45Z
    const parts = label.split("-");
    if (parts.length >= 6) {
      const isoString = `${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}Z`;
      return new Date(isoString);
    }
    return new Date(label);
  }
}
