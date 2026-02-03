import { ServicesClient, RevisionsClient } from "@google-cloud/run";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { Logging } from "@google-cloud/logging";
import {
  NetworksClient,
  GlobalAddressesClient,
  BackendServicesClient,
  UrlMapsClient,
  TargetHttpProxiesClient,
  TargetHttpsProxiesClient,
  GlobalForwardingRulesClient,
  RegionNetworkEndpointGroupsClient,
  SecurityPoliciesClient,
} from "@google-cloud/compute";
import {
  DeploymentTarget,
  DeploymentTargetType,
  InstallOptions,
  InstallResult,
  OpenClawConfigPayload,
  ConfigureResult,
  TargetStatus,
  DeploymentLogOptions,
  GatewayEndpoint,
} from "../../interface/deployment-target";
import type { CloudRunConfig } from "./cloud-run-config";

const DEFAULT_CPU = "1";
const DEFAULT_MEMORY = "2Gi";
const DEFAULT_MAX_INSTANCES = 1;
const DEFAULT_MIN_INSTANCES = 0;
const DEFAULT_VPC_CONNECTOR_IP_RANGE = "10.8.0.0/28";
const OPERATION_POLL_INTERVAL_MS = 5_000;
const OPERATION_TIMEOUT_MS = 600_000; // 10 minutes

/**
 * CloudRunTarget manages an OpenClaw gateway instance running on
 * Google Cloud Run.
 *
 * SECURITY: All deployments use VPC + External Load Balancer architecture.
 * Cloud Run services use INTERNAL_LOAD_BALANCER ingress - they are NEVER
 * exposed directly to the internet via their default Cloud Run URL.
 * External access (for webhooks from Telegram, WhatsApp, etc.) goes through
 * the External Application Load Balancer.
 *
 * Architecture:
 *   Internet → External LB → Serverless NEG → Cloud Run (internal-only)
 *                                                    ↓
 *                                              VPC Connector (egress)
 */
export class CloudRunTarget implements DeploymentTarget {
  readonly type = DeploymentTargetType.CLOUD_RUN;

  private readonly config: CloudRunConfig;
  private readonly cpu: string;
  private readonly memory: string;
  private readonly maxInstances: number;
  private readonly minInstances: number;

  // GCP clients
  private readonly runClient: ServicesClient;
  private readonly revisionsClient: RevisionsClient;
  private readonly secretClient: SecretManagerServiceClient;
  private readonly logging: Logging;
  private readonly networksClient: NetworksClient;
  private readonly addressesClient: GlobalAddressesClient;
  private readonly backendServicesClient: BackendServicesClient;
  private readonly urlMapsClient: UrlMapsClient;
  private readonly httpProxiesClient: TargetHttpProxiesClient;
  private readonly httpsProxiesClient: TargetHttpsProxiesClient;
  private readonly forwardingRulesClient: GlobalForwardingRulesClient;
  private readonly negClient: RegionNetworkEndpointGroupsClient;
  private readonly securityPoliciesClient: SecurityPoliciesClient;

  /** Derived resource names — set during install */
  private serviceName = "";
  private secretName = "";
  private vpcNetworkName = "";
  private vpcConnectorName = "";
  private externalIpName = "";
  private negName = "";
  private backendServiceName = "";
  private urlMapName = "";
  private httpProxyName = "";
  private httpsProxyName = "";
  private forwardingRuleName = "";
  private securityPolicyName = "";
  private gatewayPort = 18789;

  /** Cached external IP for getEndpoint */
  private cachedExternalIp = "";

  constructor(config: CloudRunConfig) {
    this.config = config;
    this.cpu = config.cpu ?? DEFAULT_CPU;
    this.memory = config.memory ?? DEFAULT_MEMORY;
    this.maxInstances = config.maxInstances ?? DEFAULT_MAX_INSTANCES;
    this.minInstances = config.minInstances ?? DEFAULT_MIN_INSTANCES;

    // GCP client options
    const clientOptions = config.keyFilePath
      ? { keyFilename: config.keyFilePath }
      : {};

    // Initialize GCP clients
    this.runClient = new ServicesClient(clientOptions);
    this.revisionsClient = new RevisionsClient(clientOptions);
    this.secretClient = new SecretManagerServiceClient(clientOptions);
    this.logging = new Logging({
      projectId: config.projectId,
      ...clientOptions,
    });
    this.networksClient = new NetworksClient(clientOptions);
    this.addressesClient = new GlobalAddressesClient(clientOptions);
    this.backendServicesClient = new BackendServicesClient(clientOptions);
    this.urlMapsClient = new UrlMapsClient(clientOptions);
    this.httpProxiesClient = new TargetHttpProxiesClient(clientOptions);
    this.httpsProxiesClient = new TargetHttpsProxiesClient(clientOptions);
    this.forwardingRulesClient = new GlobalForwardingRulesClient(clientOptions);
    this.negClient = new RegionNetworkEndpointGroupsClient(clientOptions);
    this.securityPoliciesClient = new SecurityPoliciesClient(clientOptions);

    // Derive resource names from profileName if available (for re-instantiation)
    if (config.profileName) {
      this.deriveResourceNames(config.profileName);
    }
  }

  private deriveResourceNames(profileName: string): void {
    const sanitized = this.sanitizeName(profileName);
    this.serviceName = `clawster-${sanitized}`;
    this.secretName = `clawster-${sanitized}-config`;
    this.vpcNetworkName = this.config.vpcNetworkName ?? `clawster-vpc-${sanitized}`;
    this.vpcConnectorName = this.config.vpcConnectorName ?? `clawster-connector-${sanitized}`;
    this.externalIpName = this.config.externalIpName ?? `clawster-ip-${sanitized}`;
    this.negName = `clawster-neg-${sanitized}`;
    this.backendServiceName = `clawster-backend-${sanitized}`;
    this.urlMapName = `clawster-urlmap-${sanitized}`;
    this.httpProxyName = `clawster-http-proxy-${sanitized}`;
    this.httpsProxyName = `clawster-https-proxy-${sanitized}`;
    this.forwardingRuleName = `clawster-fwd-${sanitized}`;
    this.securityPolicyName = `clawster-security-${sanitized}`;
  }

  /**
   * Sanitize name for GCP resources.
   * Must be lowercase, start with a letter, contain only letters, numbers, hyphens.
   * Max 63 characters.
   */
  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^[^a-z]/, "a")
      .replace(/-+/g, "-")
      .replace(/-$/, "")
      .slice(0, 63);
  }

  // ------------------------------------------------------------------
  // install
  // ------------------------------------------------------------------

  async install(options: InstallOptions): Promise<InstallResult> {
    const profileName = options.profileName;
    this.gatewayPort = options.port;
    this.deriveResourceNames(profileName);

    try {
      // 1. Create Secret Manager secret (empty initially, configure() fills it)
      await this.ensureSecret(this.secretName, "{}");

      // 2. Create VPC Network (if it doesn't exist)
      await this.ensureVpcNetwork();

      // 3. Create Serverless VPC Access Connector
      await this.ensureVpcConnector();

      // 4. Reserve external IP address
      await this.ensureExternalIp();

      // 5. Create Cloud Run service with INTERNAL_LOAD_BALANCER ingress
      await this.createCloudRunService(options);

      // 6. Create Serverless NEG pointing to Cloud Run service
      await this.ensureServerlessNeg();

      // 7. Create Cloud Armor security policy (if allowedCidr configured)
      if (this.config.allowedCidr && this.config.allowedCidr.length > 0) {
        await this.ensureSecurityPolicy();
      }

      // 8. Create Backend Service with NEG
      await this.ensureBackendService();

      // 9. Create URL Map
      await this.ensureUrlMap();

      // 10. Create HTTP(S) Proxy
      await this.ensureHttpProxy();

      // 11. Create Forwarding Rule
      await this.ensureForwardingRule();

      return {
        success: true,
        instanceId: this.serviceName,
        message: `Cloud Run service "${this.serviceName}" created (VPC + External LB, secure) in ${this.config.region}`,
        serviceName: this.serviceName,
      };
    } catch (error) {
      return {
        success: false,
        instanceId: this.serviceName,
        message: `Cloud Run install failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ------------------------------------------------------------------
  // configure
  // ------------------------------------------------------------------

  async configure(config: OpenClawConfigPayload): Promise<ConfigureResult> {
    const profileName = config.profileName;
    this.gatewayPort = config.gatewayPort;

    if (!this.secretName) {
      this.deriveResourceNames(profileName);
    }

    // Apply the same config transformations as other deployment targets
    const raw = { ...config.config } as Record<string, unknown>;

    // gateway.bind = "lan" — Cloud Run containers MUST bind to 0.0.0.0
    if (raw.gateway && typeof raw.gateway === "object") {
      const gw = { ...(raw.gateway as Record<string, unknown>) };
      gw.bind = "lan";
      delete gw.host;
      delete gw.port;
      raw.gateway = gw;
    }

    // skills.allowUnverified is not a valid OpenClaw key
    if (raw.skills && typeof raw.skills === "object") {
      const skills = { ...(raw.skills as Record<string, unknown>) };
      delete skills.allowUnverified;
      raw.skills = skills;
    }

    // sandbox at root level -> agents.defaults.sandbox
    if ("sandbox" in raw) {
      const agents = (raw.agents as Record<string, unknown>) || {};
      const defaults = (agents.defaults as Record<string, unknown>) || {};
      defaults.sandbox = raw.sandbox;
      agents.defaults = defaults;
      raw.agents = agents;
      delete raw.sandbox;
    }

    // channels.*.enabled is not valid — presence means active
    if (raw.channels && typeof raw.channels === "object") {
      for (const [key, value] of Object.entries(raw.channels as Record<string, unknown>)) {
        if (value && typeof value === "object" && "enabled" in (value as Record<string, unknown>)) {
          const { enabled: _enabled, ...rest } = value as Record<string, unknown>;
          (raw.channels as Record<string, unknown>)[key] = rest;
        }
      }
    }

    const configData = JSON.stringify(raw, null, 2);

    try {
      // Store config in Secret Manager
      await this.ensureSecret(this.secretName, configData);

      // Update Cloud Run service to trigger new revision with updated config
      await this.updateCloudRunServiceEnv(configData);

      return {
        success: true,
        message: `Configuration stored in Secret Manager as "${this.secretName}"`,
        requiresRestart: true,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to store config: ${error instanceof Error ? error.message : String(error)}`,
        requiresRestart: false,
      };
    }
  }

  // ------------------------------------------------------------------
  // start
  // ------------------------------------------------------------------

  async start(): Promise<void> {
    // Set minInstances to 1 to ensure the service is running
    const servicePath = this.runClient.servicePath(
      this.config.projectId,
      this.config.region,
      this.serviceName
    );

    const [service] = await this.runClient.getService({ name: servicePath });
    if (!service.template) {
      throw new Error("Service template not found");
    }

    service.template.scaling = {
      ...service.template.scaling,
      minInstanceCount: 1,
    };

    const [operation] = await this.runClient.updateService({
      service,
      allowMissing: false,
    });

    await this.waitForOperation(operation);
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(): Promise<void> {
    // Set minInstances to 0 and maxInstances to 0 to stop the service
    const servicePath = this.runClient.servicePath(
      this.config.projectId,
      this.config.region,
      this.serviceName
    );

    const [service] = await this.runClient.getService({ name: servicePath });
    if (!service.template) {
      throw new Error("Service template not found");
    }

    service.template.scaling = {
      ...service.template.scaling,
      minInstanceCount: 0,
      maxInstanceCount: 0,
    };

    const [operation] = await this.runClient.updateService({
      service,
      allowMissing: false,
    });

    await this.waitForOperation(operation);
  }

  // ------------------------------------------------------------------
  // restart
  // ------------------------------------------------------------------

  async restart(): Promise<void> {
    // Force a new revision by updating the service with a revision suffix
    const servicePath = this.runClient.servicePath(
      this.config.projectId,
      this.config.region,
      this.serviceName
    );

    const [service] = await this.runClient.getService({ name: servicePath });
    if (!service.template) {
      throw new Error("Service template not found");
    }

    // Add/update an annotation to force a new revision
    service.template.annotations = {
      ...service.template.annotations,
      "clawster/restart-timestamp": new Date().toISOString(),
    };

    // Ensure the service is running
    service.template.scaling = {
      ...service.template.scaling,
      minInstanceCount: 1,
      maxInstanceCount: this.maxInstances,
    };

    const [operation] = await this.runClient.updateService({
      service,
      allowMissing: false,
    });

    await this.waitForOperation(operation);
  }

  // ------------------------------------------------------------------
  // getStatus
  // ------------------------------------------------------------------

  async getStatus(): Promise<TargetStatus> {
    try {
      const servicePath = this.runClient.servicePath(
        this.config.projectId,
        this.config.region,
        this.serviceName
      );

      const [service] = await this.runClient.getService({ name: servicePath });

      // Check the Ready condition
      const conditions = service.conditions ?? [];
      const readyCondition = conditions.find((c) => c.type === "Ready");

      let state: TargetStatus["state"];
      let error: string | undefined;

      if (readyCondition?.state === "CONDITION_SUCCEEDED") {
        // Check if scaled to zero
        const minInstances = service.template?.scaling?.minInstanceCount ?? 0;
        const maxInstances = service.template?.scaling?.maxInstanceCount ?? 1;

        if (maxInstances === 0) {
          state = "stopped";
        } else if (minInstances === 0) {
          // Could be running or scaled to zero, check latest revision
          state = "running"; // Assume running if not explicitly stopped
        } else {
          state = "running";
        }
      } else if (readyCondition?.state === "CONDITION_FAILED") {
        state = "error";
        error = readyCondition.message ?? "Service not ready";
      } else {
        // Pending or reconciling
        state = "running";
      }

      return {
        state,
        gatewayPort: this.gatewayPort,
        error,
      };
    } catch (error: unknown) {
      // Check for 404 (service not found)
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        return { state: "not-installed" };
      }
      return { state: "error", error: String(error) };
    }
  }

  // ------------------------------------------------------------------
  // getLogs
  // ------------------------------------------------------------------

  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    try {
      const log = this.logging.log("run.googleapis.com%2Fstdout");

      const filter = [
        `resource.type="cloud_run_revision"`,
        `resource.labels.service_name="${this.serviceName}"`,
        `resource.labels.location="${this.config.region}"`,
      ];

      if (options?.since) {
        filter.push(`timestamp>="${options.since.toISOString()}"`);
      }

      const [entries] = await log.getEntries({
        filter: filter.join(" AND "),
        orderBy: "timestamp desc",
        pageSize: options?.lines ?? 100,
      });

      let lines = entries.map((entry) => {
        const data = entry.data as { message?: string; textPayload?: string } | string;
        if (typeof data === "string") return data;
        return data?.message ?? data?.textPayload ?? JSON.stringify(data);
      });

      if (options?.filter) {
        try {
          const pattern = new RegExp(options.filter, "i");
          lines = lines.filter((line) => pattern.test(line));
        } catch {
          const literal = options.filter.toLowerCase();
          lines = lines.filter((line) => line.toLowerCase().includes(literal));
        }
      }

      return lines.reverse(); // Return in chronological order
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------------
  // getEndpoint
  // ------------------------------------------------------------------

  async getEndpoint(): Promise<GatewayEndpoint> {
    // CRITICAL: Return the External Load Balancer IP, NEVER the Cloud Run URL
    if (!this.cachedExternalIp) {
      const [address] = await this.addressesClient.get({
        project: this.config.projectId,
        address: this.externalIpName,
      });
      this.cachedExternalIp = address.address ?? "";
    }

    if (!this.cachedExternalIp) {
      throw new Error("External IP address not found");
    }

    return {
      host: this.config.customDomain ?? this.cachedExternalIp,
      port: this.config.sslCertificateId ? 443 : 80,
      protocol: this.config.sslCertificateId ? "wss" : "ws",
    };
  }

  // ------------------------------------------------------------------
  // destroy
  // ------------------------------------------------------------------

  async destroy(): Promise<void> {
    // Delete in reverse order of creation

    // 1. Delete Forwarding Rule
    try {
      const [operation] = await this.forwardingRulesClient.delete({
        project: this.config.projectId,
        forwardingRule: this.forwardingRuleName,
      });
      await this.waitForGlobalOperation(operation);
    } catch {
      // May not exist
    }

    // 2. Delete HTTP(S) Proxy
    try {
      if (this.config.sslCertificateId) {
        const [operation] = await this.httpsProxiesClient.delete({
          project: this.config.projectId,
          targetHttpsProxy: this.httpsProxyName,
        });
        await this.waitForGlobalOperation(operation);
      } else {
        const [operation] = await this.httpProxiesClient.delete({
          project: this.config.projectId,
          targetHttpProxy: this.httpProxyName,
        });
        await this.waitForGlobalOperation(operation);
      }
    } catch {
      // May not exist
    }

    // 3. Delete URL Map
    try {
      const [operation] = await this.urlMapsClient.delete({
        project: this.config.projectId,
        urlMap: this.urlMapName,
      });
      await this.waitForGlobalOperation(operation);
    } catch {
      // May not exist
    }

    // 4. Delete Backend Service
    try {
      const [operation] = await this.backendServicesClient.delete({
        project: this.config.projectId,
        backendService: this.backendServiceName,
      });
      await this.waitForGlobalOperation(operation);
    } catch {
      // May not exist
    }

    // 5. Delete Security Policy
    try {
      const [operation] = await this.securityPoliciesClient.delete({
        project: this.config.projectId,
        securityPolicy: this.securityPolicyName,
      });
      await this.waitForGlobalOperation(operation);
    } catch {
      // May not exist
    }

    // 6. Delete Serverless NEG
    try {
      const [operation] = await this.negClient.delete({
        project: this.config.projectId,
        region: this.config.region,
        networkEndpointGroup: this.negName,
      });
      await this.waitForRegionOperation(operation);
    } catch {
      // May not exist
    }

    // 7. Delete Cloud Run Service
    try {
      const servicePath = this.runClient.servicePath(
        this.config.projectId,
        this.config.region,
        this.serviceName
      );
      const [operation] = await this.runClient.deleteService({ name: servicePath });
      await this.waitForOperation(operation);
    } catch {
      // May not exist
    }

    // 8. Delete External IP
    try {
      const [operation] = await this.addressesClient.delete({
        project: this.config.projectId,
        address: this.externalIpName,
      });
      await this.waitForGlobalOperation(operation);
    } catch {
      // May not exist
    }

    // 9. VPC Connector is NOT deleted automatically
    // VPC Connector deletion requires the @google-cloud/vpc-access client.
    // VPC Connectors can be reused across multiple Cloud Run services and are
    // relatively inexpensive, so they are intentionally preserved.
    // To delete manually:
    //   gcloud compute networks vpc-access connectors delete ${this.vpcConnectorName} \
    //     --region=${this.config.region}

    // 10. Delete Secret
    try {
      const secretPath = `projects/${this.config.projectId}/secrets/${this.secretName}`;
      await this.secretClient.deleteSecret({ name: secretPath });
    } catch {
      // May not exist
    }

    // Note: VPC Network is NOT deleted as it may be shared with other services
  }

  // ------------------------------------------------------------------
  // Private helpers - Secret Manager
  // ------------------------------------------------------------------

  private async ensureSecret(name: string, value: string): Promise<void> {
    const parent = `projects/${this.config.projectId}`;
    const secretPath = `${parent}/secrets/${name}`;

    try {
      // Check if secret exists
      await this.secretClient.getSecret({ name: secretPath });

      // Secret exists, add new version
      await this.secretClient.addSecretVersion({
        parent: secretPath,
        payload: {
          data: Buffer.from(value, "utf8"),
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        // Create secret
        await this.secretClient.createSecret({
          parent,
          secretId: name,
          secret: {
            replication: {
              automatic: {},
            },
          },
        });

        // Add initial version
        await this.secretClient.addSecretVersion({
          parent: secretPath,
          payload: {
            data: Buffer.from(value, "utf8"),
          },
        });
      } else {
        throw error;
      }
    }
  }

  // ------------------------------------------------------------------
  // Private helpers - VPC Infrastructure
  // ------------------------------------------------------------------

  private async ensureVpcNetwork(): Promise<void> {
    try {
      await this.networksClient.get({
        project: this.config.projectId,
        network: this.vpcNetworkName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const [operation] = await this.networksClient.insert({
          project: this.config.projectId,
          networkResource: {
            name: this.vpcNetworkName,
            autoCreateSubnetworks: true, // Auto mode creates subnets in each region
            description: `Clawster VPC for ${this.serviceName}`,
          },
        });
        await this.waitForGlobalOperation(operation);
      } else {
        throw error;
      }
    }
  }

  private async ensureVpcConnector(): Promise<void> {
    // VPC Access Connector creation requires the @google-cloud/vpc-access client
    // which is not included in this package. The connector must be created manually
    // or via Terraform/gcloud before deploying Cloud Run services that need VPC egress.
    //
    // The VPC Connector needs to be in the same region as Cloud Run.
    // It provides private network access for outbound connections.
    // Format: projects/{project}/locations/{region}/connectors/{connector}
    //
    // If vpcConnectorName is not configured, the Cloud Run service will use
    // default egress (direct internet access) which is acceptable for most use cases.
    //
    // To create a VPC Connector manually:
    //   gcloud compute networks vpc-access connectors create ${this.vpcConnectorName} \
    //     --region=${this.config.region} \
    //     --network=${this.vpcNetworkName} \
    //     --range=${DEFAULT_VPC_CONNECTOR_IP_RANGE}
  }

  private async ensureExternalIp(): Promise<void> {
    try {
      const [address] = await this.addressesClient.get({
        project: this.config.projectId,
        address: this.externalIpName,
      });
      this.cachedExternalIp = address.address ?? "";
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const [operation] = await this.addressesClient.insert({
          project: this.config.projectId,
          addressResource: {
            name: this.externalIpName,
            description: `External IP for Clawster service ${this.serviceName}`,
            networkTier: "PREMIUM",
          },
        });
        await this.waitForGlobalOperation(operation);

        // Get the newly created IP
        const [address] = await this.addressesClient.get({
          project: this.config.projectId,
          address: this.externalIpName,
        });
        this.cachedExternalIp = address.address ?? "";
      } else {
        throw error;
      }
    }
  }

  // ------------------------------------------------------------------
  // Private helpers - Cloud Run Service
  // ------------------------------------------------------------------

  private async createCloudRunService(options: InstallOptions): Promise<void> {
    const imageUri = this.config.image ?? "node:22-slim";

    // Build environment variables
    const envVars: Array<{ name: string; value: string }> = [
      { name: "OPENCLAW_GATEWAY_PORT", value: String(this.gatewayPort) },
      { name: "OPENCLAW_CONFIG", value: "{}" }, // Initial empty config
    ];

    if (options.gatewayAuthToken) {
      envVars.push({
        name: "OPENCLAW_GATEWAY_TOKEN",
        value: options.gatewayAuthToken,
      });
    }

    for (const [key, value] of Object.entries(options.containerEnv ?? {})) {
      envVars.push({ name: key, value });
    }

    const parent = `projects/${this.config.projectId}/locations/${this.config.region}`;

    const service = {
      template: {
        containers: [
          {
            image: imageUri,
            ports: [{ containerPort: this.gatewayPort }],
            env: envVars,
            resources: {
              limits: {
                cpu: this.cpu,
                memory: this.memory,
              },
            },
            // Startup command to write config and run gateway
            command: ["/bin/sh"],
            args: [
              "-c",
              `mkdir -p ~/.openclaw && echo "$OPENCLAW_CONFIG" > ~/.openclaw/openclaw.json && npx -y openclaw@latest gateway --port ${this.gatewayPort} --verbose`,
            ],
          },
        ],
        scaling: {
          minInstanceCount: this.minInstances,
          maxInstanceCount: this.maxInstances,
        },
        // VPC Connector for outbound traffic
        vpcAccess: this.config.vpcConnectorName
          ? {
              connector: `projects/${this.config.projectId}/locations/${this.config.region}/connectors/${this.vpcConnectorName}`,
              egress: "ALL_TRAFFIC",
            }
          : undefined,
        annotations: {
          "clawster/managed": "true",
          "clawster/profile": options.profileName,
        },
      },
      // CRITICAL: Internal ingress only - traffic comes through Load Balancer
      // IngressTraffic.INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER = 3
      ingress: 3,
      annotations: {
        "clawster/managed": "true",
      },
      labels: {
        "clawster-managed": "true",
        "clawster-profile": this.sanitizeName(options.profileName),
      },
    };

    const [operation] = await this.runClient.createService({
      parent,
      serviceId: this.serviceName,
      service: service as Parameters<typeof this.runClient.createService>[0]["service"],
    });

    await this.waitForOperation(operation);
  }

  private async updateCloudRunServiceEnv(configData: string): Promise<void> {
    const servicePath = this.runClient.servicePath(
      this.config.projectId,
      this.config.region,
      this.serviceName
    );

    const [service] = await this.runClient.getService({ name: servicePath });

    if (!service.template?.containers?.[0]) {
      throw new Error("Service template or container not found");
    }

    // Update OPENCLAW_CONFIG env var
    const envVars = service.template.containers[0].env ?? [];
    const configEnvIndex = envVars.findIndex((e) => e.name === "OPENCLAW_CONFIG");
    if (configEnvIndex >= 0) {
      envVars[configEnvIndex].value = configData;
    } else {
      envVars.push({ name: "OPENCLAW_CONFIG", value: configData });
    }
    service.template.containers[0].env = envVars;

    // Force new revision
    service.template.annotations = {
      ...service.template.annotations,
      "clawster/config-update": new Date().toISOString(),
    };

    const [operation] = await this.runClient.updateService({
      service,
      allowMissing: false,
    });

    await this.waitForOperation(operation);
  }

  // ------------------------------------------------------------------
  // Private helpers - Load Balancer Infrastructure
  // ------------------------------------------------------------------

  private async ensureServerlessNeg(): Promise<void> {
    try {
      await this.negClient.get({
        project: this.config.projectId,
        region: this.config.region,
        networkEndpointGroup: this.negName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const [operation] = await this.negClient.insert({
          project: this.config.projectId,
          region: this.config.region,
          networkEndpointGroupResource: {
            name: this.negName,
            networkEndpointType: "SERVERLESS",
            cloudRun: {
              service: this.serviceName,
            },
          },
        });
        await this.waitForRegionOperation(operation);
      } else {
        throw error;
      }
    }
  }

  private async ensureSecurityPolicy(): Promise<void> {
    const allowedCidr = this.config.allowedCidr ?? ["0.0.0.0/0"];

    try {
      await this.securityPoliciesClient.get({
        project: this.config.projectId,
        securityPolicy: this.securityPolicyName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        // Build rules for allowed CIDRs
        const rules = allowedCidr.map((cidr, index) => ({
          priority: 1000 + index,
          match: {
            versionedExpr: "SRC_IPS_V1" as const,
            config: {
              srcIpRanges: [cidr],
            },
          },
          action: "allow",
          description: `Allow traffic from ${cidr}`,
        }));

        // Add default deny rule
        rules.push({
          priority: 2147483647, // Lowest priority (highest number)
          match: {
            versionedExpr: "SRC_IPS_V1" as const,
            config: {
              srcIpRanges: ["*"],
            },
          },
          action: "deny(403)",
          description: "Deny all other traffic",
        });

        const [operation] = await this.securityPoliciesClient.insert({
          project: this.config.projectId,
          securityPolicyResource: {
            name: this.securityPolicyName,
            description: `Cloud Armor policy for Clawster service ${this.serviceName}`,
            rules,
          },
        });
        await this.waitForGlobalOperation(operation);
      } else {
        throw error;
      }
    }
  }

  private async ensureBackendService(): Promise<void> {
    const negSelfLink = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/regions/${this.config.region}/networkEndpointGroups/${this.negName}`;

    try {
      await this.backendServicesClient.get({
        project: this.config.projectId,
        backendService: this.backendServiceName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const backendService: Record<string, unknown> = {
          name: this.backendServiceName,
          description: `Backend service for Clawster ${this.serviceName}`,
          backends: [
            {
              group: negSelfLink,
            },
          ],
          protocol: "HTTP",
          portName: "http",
          enableCDN: false,
          loadBalancingScheme: "EXTERNAL_MANAGED",
        };

        // Attach security policy if it exists
        if (this.config.allowedCidr && this.config.allowedCidr.length > 0) {
          backendService.securityPolicy = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/securityPolicies/${this.securityPolicyName}`;
        }

        const [operation] = await this.backendServicesClient.insert({
          project: this.config.projectId,
          backendServiceResource: backendService,
        });
        await this.waitForGlobalOperation(operation);
      } else {
        throw error;
      }
    }
  }

  private async ensureUrlMap(): Promise<void> {
    const backendServiceSelfLink = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/backendServices/${this.backendServiceName}`;

    try {
      await this.urlMapsClient.get({
        project: this.config.projectId,
        urlMap: this.urlMapName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const [operation] = await this.urlMapsClient.insert({
          project: this.config.projectId,
          urlMapResource: {
            name: this.urlMapName,
            description: `URL map for Clawster ${this.serviceName}`,
            defaultService: backendServiceSelfLink,
          },
        });
        await this.waitForGlobalOperation(operation);
      } else {
        throw error;
      }
    }
  }

  private async ensureHttpProxy(): Promise<void> {
    const urlMapSelfLink = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/urlMaps/${this.urlMapName}`;

    if (this.config.sslCertificateId) {
      // HTTPS Proxy
      try {
        await this.httpsProxiesClient.get({
          project: this.config.projectId,
          targetHttpsProxy: this.httpsProxyName,
        });
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          (error.message.includes("NOT_FOUND") || error.message.includes("404"))
        ) {
          const [operation] = await this.httpsProxiesClient.insert({
            project: this.config.projectId,
            targetHttpsProxyResource: {
              name: this.httpsProxyName,
              description: `HTTPS proxy for Clawster ${this.serviceName}`,
              urlMap: urlMapSelfLink,
              sslCertificates: [this.config.sslCertificateId],
            },
          });
          await this.waitForGlobalOperation(operation);
        } else {
          throw error;
        }
      }
    } else {
      // HTTP Proxy
      try {
        await this.httpProxiesClient.get({
          project: this.config.projectId,
          targetHttpProxy: this.httpProxyName,
        });
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          (error.message.includes("NOT_FOUND") || error.message.includes("404"))
        ) {
          const [operation] = await this.httpProxiesClient.insert({
            project: this.config.projectId,
            targetHttpProxyResource: {
              name: this.httpProxyName,
              description: `HTTP proxy for Clawster ${this.serviceName}`,
              urlMap: urlMapSelfLink,
            },
          });
          await this.waitForGlobalOperation(operation);
        } else {
          throw error;
        }
      }
    }
  }

  private async ensureForwardingRule(): Promise<void> {
    try {
      await this.forwardingRulesClient.get({
        project: this.config.projectId,
        forwardingRule: this.forwardingRuleName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("NOT_FOUND") || error.message.includes("404"))
      ) {
        const proxyName = this.config.sslCertificateId
          ? this.httpsProxyName
          : this.httpProxyName;
        const proxyType = this.config.sslCertificateId ? "targetHttpsProxies" : "targetHttpProxies";
        const proxySelfLink = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/${proxyType}/${proxyName}`;
        const ipSelfLink = `https://www.googleapis.com/compute/v1/projects/${this.config.projectId}/global/addresses/${this.externalIpName}`;

        const [operation] = await this.forwardingRulesClient.insert({
          project: this.config.projectId,
          forwardingRuleResource: {
            name: this.forwardingRuleName,
            description: `Forwarding rule for Clawster ${this.serviceName}`,
            IPAddress: ipSelfLink,
            IPProtocol: "TCP",
            portRange: this.config.sslCertificateId ? "443" : "80",
            target: proxySelfLink,
            loadBalancingScheme: "EXTERNAL_MANAGED",
            networkTier: "PREMIUM",
          },
        });
        await this.waitForGlobalOperation(operation);
      } else {
        throw error;
      }
    }
  }

  // ------------------------------------------------------------------
  // Private helpers - Operation waiting
  // ------------------------------------------------------------------

  private async waitForOperation(operation: unknown): Promise<void> {
    // Cloud Run operations return a promise that resolves when complete
    if (operation && typeof operation === "object" && "promise" in operation) {
      await (operation as { promise: () => Promise<unknown> }).promise();
    }
  }

  private async waitForGlobalOperation(operation: unknown): Promise<void> {
    // Compute global operations need polling
    const op = operation as { name?: string; latestResponse?: { status?: string; error?: { errors?: Array<{ message?: string }> } } };
    if (!op?.name) return;

    const start = Date.now();
    while (Date.now() - start < OPERATION_TIMEOUT_MS) {
      if (op.latestResponse?.status === "DONE") {
        if (op.latestResponse?.error?.errors?.length) {
          throw new Error(op.latestResponse.error.errors[0]?.message ?? "Operation failed");
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_INTERVAL_MS));
    }
    throw new Error(`Operation timed out: ${op.name}`);
  }

  private async waitForRegionOperation(operation: unknown): Promise<void> {
    // Same as global operation for now
    await this.waitForGlobalOperation(operation);
  }
}
