import {
  InstancesClient,
  DisksClient,
  ZoneOperationsClient,
  protos,
} from "@google-cloud/compute";

export interface VmInstanceConfig {
  /** Instance name */
  name: string;
  /** Machine type (e.g., "e2-small", "e2-medium") */
  machineType: string;
  /** Boot disk configuration */
  bootDisk: {
    /** Source image (e.g., "projects/cos-cloud/global/images/family/cos-stable") */
    sourceImage: string;
    /** Disk size in GB */
    sizeGb: number;
    /** Disk type (e.g., "pd-standard", "pd-ssd") */
    diskType?: string;
  };
  /** Data disk name to attach (optional) */
  dataDiskName?: string;
  /** VPC network name */
  networkName: string;
  /** Subnet name */
  subnetName: string;
  /** Network tags for firewall rules */
  networkTags?: string[];
  /** Metadata key-value pairs */
  metadata?: Record<string, string>;
  /** Labels for organization */
  labels?: Record<string, string>;
  /** Service account scopes */
  scopes?: string[];
}

export interface VmStatus {
  status: "RUNNING" | "STOPPED" | "TERMINATED" | "STAGING" | "PROVISIONING" | "SUSPENDING" | "SUSPENDED" | "REPAIRING" | "UNKNOWN" | "NOT_FOUND";
  machineType?: string;
  zone?: string;
  networkIp?: string;
  externalIp?: string;
}

export interface ComputeServiceConfig {
  projectId: string;
  zone: string;
  keyFilename?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
}

/**
 * Service for managing GCP Compute Engine VM instances.
 * Wraps the @google-cloud/compute SDK with a simplified interface.
 */
export class ComputeService {
  private readonly instancesClient: InstancesClient;
  private readonly disksClient: DisksClient;
  private readonly projectId: string;
  private readonly zone: string;
  private readonly region: string;

  constructor(config: ComputeServiceConfig) {
    const clientOptions: { projectId: string; keyFilename?: string; credentials?: { client_email: string; private_key: string } } = {
      projectId: config.projectId,
    };

    if (config.keyFilename) {
      clientOptions.keyFilename = config.keyFilename;
    } else if (config.credentials) {
      clientOptions.credentials = config.credentials;
    }

    this.instancesClient = new InstancesClient(clientOptions);
    this.disksClient = new DisksClient(clientOptions);
    this.projectId = config.projectId;
    this.zone = config.zone;
    // Extract region from zone (e.g., "us-central1-a" -> "us-central1")
    this.region = config.zone.replace(/-[a-z]$/, "");
  }

  /**
   * Create a new VM instance.
   *
   * @param config - VM instance configuration
   * @returns Instance self-link URL
   */
  async createInstance(config: VmInstanceConfig): Promise<string> {
    const disks: protos.google.cloud.compute.v1.IAttachedDisk[] = [
      {
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: config.bootDisk.sourceImage,
          diskSizeGb: String(config.bootDisk.sizeGb),
          diskType: `zones/${this.zone}/diskTypes/${config.bootDisk.diskType || "pd-standard"}`,
        },
      },
    ];

    if (config.dataDiskName) {
      disks.push({
        boot: false,
        autoDelete: false,
        source: `zones/${this.zone}/disks/${config.dataDiskName}`,
        deviceName: config.dataDiskName,
      });
    }

    const metadataItems: protos.google.cloud.compute.v1.IItems[] = config.metadata
      ? Object.entries(config.metadata).map(([key, value]) => ({ key, value }))
      : [];

    const [operation] = await this.instancesClient.insert({
      project: this.projectId,
      zone: this.zone,
      instanceResource: {
        name: config.name,
        machineType: `zones/${this.zone}/machineTypes/${config.machineType}`,
        description: "Clawster OpenClaw instance",
        tags: config.networkTags ? { items: config.networkTags } : undefined,
        disks,
        networkInterfaces: [
          {
            network: `projects/${this.projectId}/global/networks/${config.networkName}`,
            subnetwork: `projects/${this.projectId}/regions/${this.region}/subnetworks/${config.subnetName}`,
            accessConfigs: [], // No external IP by default
          },
        ],
        metadata: metadataItems.length > 0 ? { items: metadataItems } : undefined,
        labels: config.labels,
        serviceAccounts: [
          {
            scopes: config.scopes || ["https://www.googleapis.com/auth/cloud-platform"],
          },
        ],
      },
    });

    // Wait for operation to complete
    await this.waitForZoneOperation(operation.latestResponse?.name);

    const [instance] = await this.instancesClient.get({
      project: this.projectId,
      zone: this.zone,
      instance: config.name,
    });

    return instance.selfLink ?? "";
  }

  /**
   * Delete a VM instance.
   *
   * @param name - Instance name
   */
  async deleteInstance(name: string): Promise<void> {
    try {
      const [operation] = await this.instancesClient.delete({
        project: this.projectId,
        zone: this.zone,
        instance: name,
      });

      await this.waitForZoneOperation(operation.latestResponse?.name);
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
    }
  }

  /**
   * Start a VM instance.
   *
   * @param name - Instance name
   */
  async startInstance(name: string): Promise<void> {
    const [operation] = await this.instancesClient.start({
      project: this.projectId,
      zone: this.zone,
      instance: name,
    });

    await this.waitForZoneOperation(operation.latestResponse?.name);
  }

  /**
   * Stop a VM instance.
   *
   * @param name - Instance name
   */
  async stopInstance(name: string): Promise<void> {
    const [operation] = await this.instancesClient.stop({
      project: this.projectId,
      zone: this.zone,
      instance: name,
    });

    await this.waitForZoneOperation(operation.latestResponse?.name);
  }

  /**
   * Get detailed information about a VM instance.
   *
   * @param name - Instance name
   * @returns VM status and metadata, or null if not found
   */
  async getInstance(name: string): Promise<VmStatus | null> {
    try {
      const [instance] = await this.instancesClient.get({
        project: this.projectId,
        zone: this.zone,
        instance: name,
      });

      const networkInterface = instance.networkInterfaces?.[0];

      return {
        status: (instance.status as VmStatus["status"]) ?? "UNKNOWN",
        machineType: instance.machineType?.split("/").pop(),
        zone: this.zone,
        networkIp: networkInterface?.networkIP ?? undefined,
        externalIp: networkInterface?.accessConfigs?.[0]?.natIP ?? undefined,
      };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Run a command on a VM instance via startup script metadata.
   * Note: This updates the startup-script metadata. The command runs on next boot
   * or can be triggered by resetting the instance.
   *
   * @param name - Instance name
   * @param command - Shell command to run
   */
  async runCommand(name: string, command: string): Promise<void> {
    const [instance] = await this.instancesClient.get({
      project: this.projectId,
      zone: this.zone,
      instance: name,
    });

    const currentItems = instance.metadata?.items ?? [];
    const newItems = currentItems.filter((item) => item.key !== "startup-script");
    newItems.push({ key: "startup-script", value: command });

    const [operation] = await this.instancesClient.setMetadata({
      project: this.projectId,
      zone: this.zone,
      instance: name,
      metadataResource: {
        fingerprint: instance.metadata?.fingerprint,
        items: newItems,
      },
    });

    await this.waitForZoneOperation(operation.latestResponse?.name);
  }

  /**
   * Reset (restart) a VM instance.
   *
   * @param name - Instance name
   */
  async resetInstance(name: string): Promise<void> {
    const [operation] = await this.instancesClient.reset({
      project: this.projectId,
      zone: this.zone,
      instance: name,
    });

    await this.waitForZoneOperation(operation.latestResponse?.name);
  }

  /**
   * Update VM instance metadata.
   *
   * @param name - Instance name
   * @param metadata - Key-value pairs to update
   */
  async updateMetadata(name: string, metadata: Record<string, string>): Promise<void> {
    const [instance] = await this.instancesClient.get({
      project: this.projectId,
      zone: this.zone,
      instance: name,
    });

    const currentItems = instance.metadata?.items ?? [];
    const metadataKeys = Object.keys(metadata);
    const newItems = currentItems.filter((item) => item.key && !metadataKeys.includes(item.key));

    for (const [key, value] of Object.entries(metadata)) {
      newItems.push({ key, value });
    }

    const [operation] = await this.instancesClient.setMetadata({
      project: this.projectId,
      zone: this.zone,
      instance: name,
      metadataResource: {
        fingerprint: instance.metadata?.fingerprint,
        items: newItems,
      },
    });

    await this.waitForZoneOperation(operation.latestResponse?.name);
  }

  /**
   * Ensure a persistent data disk exists.
   *
   * @param name - Disk name
   * @param sizeGb - Disk size in GB
   * @param diskType - Disk type (default: "pd-standard")
   */
  async ensureDataDisk(name: string, sizeGb: number, diskType: string = "pd-standard"): Promise<void> {
    try {
      await this.disksClient.get({
        project: this.projectId,
        zone: this.zone,
        disk: name,
      });
      // Disk already exists
    } catch (error) {
      if (this.isNotFoundError(error)) {
        const [operation] = await this.disksClient.insert({
          project: this.projectId,
          zone: this.zone,
          diskResource: {
            name,
            sizeGb: String(sizeGb),
            type: `zones/${this.zone}/diskTypes/${diskType}`,
            description: "Clawster persistent data disk",
          },
        });

        await this.waitForZoneOperation(operation.latestResponse?.name);
        return;
      }
      throw error;
    }
  }

  /**
   * Delete a disk.
   *
   * @param name - Disk name
   */
  async deleteDisk(name: string): Promise<void> {
    try {
      const [operation] = await this.disksClient.delete({
        project: this.projectId,
        zone: this.zone,
        disk: name,
      });

      await this.waitForZoneOperation(operation.latestResponse?.name);
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
    }
  }

  /**
   * Wait for a zone operation to complete.
   */
  private async waitForZoneOperation(operationName: string | null | undefined): Promise<void> {
    if (!operationName) return;

    const operationsClient = new ZoneOperationsClient();

    let status: string = "RUNNING";
    while (status === "RUNNING" || status === "PENDING") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const [operation] = await operationsClient.get({
        project: this.projectId,
        zone: this.zone,
        operation: operationName,
      });
      status = String(operation.status ?? "DONE");

      if (operation.error?.errors?.length) {
        throw new Error(`Operation failed: ${operation.error.errors.map((e) => e.message).join(", ")}`);
      }
    }
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("NOT_FOUND") || error.message.includes("404") || error.message.includes("was not found"))
    );
  }
}
