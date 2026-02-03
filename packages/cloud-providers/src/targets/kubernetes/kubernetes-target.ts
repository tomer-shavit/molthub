import { execFile } from "child_process";
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
  KubernetesTargetConfig,
} from "../../interface/deployment-target";

/**
 * Kubernetes requires a registry-hosted image. Users must build and push
 * the OpenClaw image to their own registry and set the `image` field
 * in their Kubernetes deployment config.
 */
const DEFAULT_IMAGE = "openclaw:local";

/**
 * Executes a command using child_process.execFile and returns stdout.
 */
function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${cmd} ${args.join(" ")}\n${stderr || error.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Kubernetes manifest types for OpenClaw deployment.
 */
export interface KubernetesManifests {
  deployment: Record<string, unknown>;
  service: Record<string, unknown>;
  configMap: Record<string, unknown>;
}

/**
 * KubernetesTarget manages an OpenClaw gateway instance deployed as a
 * Kubernetes Deployment with an associated Service and ConfigMap.
 *
 * The implementation generates Kubernetes manifest objects and applies
 * them via kubectl. For operations that would require kubectl/API calls,
 * the manifest generation is fully functional while the actual apply
 * commands can be stubbed until a real cluster is available.
 */
/**
 * Extended Kubernetes config with Sysbox support.
 *
 * DREAM ARCHITECTURE: Security is not optional. Sysbox RuntimeClass is
 * REQUIRED for Kubernetes deployments. The cluster must have a Sysbox
 * RuntimeClass configured (typically named "sysbox-runc").
 */
export interface KubernetesTargetConfigExtended extends KubernetesTargetConfig {
  /**
   * RuntimeClass name for Sysbox. Defaults to "sysbox-runc".
   * The cluster MUST have this RuntimeClass configured.
   */
  sysboxRuntimeClassName?: string;
  /**
   * Skip Sysbox RuntimeClass requirement. USE WITH CAUTION.
   * Only for development/testing. Production deployments MUST use Sysbox.
   * @default false
   */
  allowInsecureWithoutSysbox?: boolean;
}

export class KubernetesTarget implements DeploymentTarget {
  readonly type = DeploymentTargetType.KUBERNETES;

  private config: KubernetesTargetConfigExtended;
  private image: string;
  private profileName: string = "";
  private manifests: KubernetesManifests | null = null;

  constructor(config: KubernetesTargetConfigExtended) {
    this.config = config;
    this.image = config.image || DEFAULT_IMAGE;
  }

  /**
   * Returns kubectl base arguments including context and namespace.
   */
  private kubectlArgs(): string[] {
    const args: string[] = [];
    if (this.config.kubeContext) {
      args.push("--context", this.config.kubeContext);
    }
    args.push("-n", this.config.namespace);
    return args;
  }

  /**
   * Generates the ConfigMap manifest for OpenClaw configuration.
   */
  private generateConfigMap(configData?: Record<string, unknown>): Record<string, unknown> {
    return {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: `${this.config.deploymentName}-config`,
        namespace: this.config.namespace,
        labels: {
          app: this.config.deploymentName,
          "app.kubernetes.io/name": "openclaw-gateway",
          "app.kubernetes.io/managed-by": "clawster",
        },
      },
      data: {
        "config.json": JSON.stringify(
          configData || {
            profileName: this.profileName,
            gatewayPort: this.config.gatewayPort,
          },
          null,
          2
        ),
      },
    };
  }

  /**
   * Check if Sysbox RuntimeClass should be used.
   * DREAM ARCHITECTURE: Always true unless explicitly disabled for dev/testing.
   */
  isSysboxEnabled(): boolean {
    return this.config.allowInsecureWithoutSysbox !== true;
  }

  /**
   * Get the RuntimeClass name for Sysbox.
   */
  getSysboxRuntimeClassName(): string {
    return this.config.sysboxRuntimeClassName ?? "sysbox-runc";
  }

  /**
   * Check if running in insecure mode (without Sysbox RuntimeClass).
   */
  isRunningInsecure(): boolean {
    return this.config.allowInsecureWithoutSysbox === true;
  }

  /**
   * Generates the Deployment manifest for the OpenClaw gateway.
   */
  private generateDeployment(): Record<string, unknown> {
    const replicas = this.config.replicas ?? 1;

    // Build pod spec with optional RuntimeClass for Sysbox
    const podSpec: Record<string, unknown> = {
      containers: [
        {
          name: "openclaw-gateway",
          image: this.image,
          ports: [
            {
              containerPort: this.config.gatewayPort,
              name: "gateway",
              protocol: "TCP",
            },
          ],
          env: [
            {
              name: "OPENCLAW_CONFIG_PATH",
              value: "/app/config/config.json",
            },
          ],
          volumeMounts: [
            {
              name: "config",
              mountPath: "/app/config",
              readOnly: true,
            },
          ],
          readinessProbe: {
            tcpSocket: {
              port: this.config.gatewayPort,
            },
            initialDelaySeconds: 5,
            periodSeconds: 10,
          },
          livenessProbe: {
            tcpSocket: {
              port: this.config.gatewayPort,
            },
            initialDelaySeconds: 15,
            periodSeconds: 20,
          },
          resources: {
            requests: {
              cpu: "100m",
              memory: "128Mi",
            },
            limits: {
              cpu: "500m",
              memory: "512Mi",
            },
          },
        },
      ],
      volumes: [
        {
          name: "config",
          configMap: {
            name: `${this.config.deploymentName}-config`,
          },
        },
      ],
    };

    // DREAM ARCHITECTURE: Always use Sysbox RuntimeClass for secure sandbox mode
    // Only skip if explicitly running in insecure dev/test mode
    if (this.isSysboxEnabled()) {
      podSpec.runtimeClassName = this.getSysboxRuntimeClassName();
    } else {
      // Log warning - this should only happen in dev/testing
      console.warn(
        "WARNING: Kubernetes deployment without Sysbox RuntimeClass. " +
        "This is INSECURE and should only be used for development/testing."
      );
    }

    return {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: this.config.deploymentName,
        namespace: this.config.namespace,
        labels: {
          app: this.config.deploymentName,
          "app.kubernetes.io/name": "openclaw-gateway",
          "app.kubernetes.io/managed-by": "clawster",
        },
      },
      spec: {
        replicas,
        selector: {
          matchLabels: {
            app: this.config.deploymentName,
          },
        },
        template: {
          metadata: {
            labels: {
              app: this.config.deploymentName,
              "app.kubernetes.io/name": "openclaw-gateway",
            },
          },
          spec: podSpec,
        },
      },
    };
  }

  /**
   * Generates the Service manifest to expose the gateway port.
   */
  private generateService(): Record<string, unknown> {
    return {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: `${this.config.deploymentName}-svc`,
        namespace: this.config.namespace,
        labels: {
          app: this.config.deploymentName,
          "app.kubernetes.io/name": "openclaw-gateway",
          "app.kubernetes.io/managed-by": "clawster",
        },
      },
      spec: {
        selector: {
          app: this.config.deploymentName,
        },
        ports: [
          {
            name: "gateway",
            port: this.config.gatewayPort,
            targetPort: this.config.gatewayPort,
            protocol: "TCP",
          },
        ],
        type: "ClusterIP",
      },
    };
  }

  /**
   * Generate all Kubernetes manifests for the OpenClaw deployment.
   * This is public so callers can inspect the generated manifests.
   */
  generateManifests(configData?: Record<string, unknown>): KubernetesManifests {
    return {
      deployment: this.generateDeployment(),
      service: this.generateService(),
      configMap: this.generateConfigMap(configData),
    };
  }

  /**
   * Install by generating and applying Kubernetes manifests.
   */
  async install(options: InstallOptions): Promise<InstallResult> {
    this.profileName = options.profileName;

    if (options.openclawVersion) {
      this.image = this.image.replace(/:.*$/, `:${options.openclawVersion}`);
    }

    this.manifests = this.generateManifests();

    const allManifests = [
      this.manifests.configMap,
      this.manifests.deployment,
      this.manifests.service,
    ];
    const manifestJson = JSON.stringify(allManifests);

    try {
      // Ensure namespace exists
      try {
        await runCommand("kubectl", [
          ...this.kubectlArgs(),
          "create",
          "namespace",
          this.config.namespace,
          "--dry-run=client",
          "-o",
          "json",
        ]);
      } catch {
        // Namespace may already exist
      }

      // Apply manifests via stdin
      await runCommand("kubectl", [
        ...this.kubectlArgs(),
        "apply",
        "-f",
        "-",
        "--input",
        manifestJson,
      ]);

      return {
        success: true,
        instanceId: `${this.config.namespace}/${this.config.deploymentName}`,
        message: `Kubernetes resources created in namespace "${this.config.namespace}"`,
        serviceName: `${this.config.deploymentName}-svc`,
      };
    } catch (error) {
      return {
        success: false,
        instanceId: `${this.config.namespace}/${this.config.deploymentName}`,
        message: `Failed to apply manifests: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Update the ConfigMap with new configuration.
   */
  async configure(config: OpenClawConfigPayload): Promise<ConfigureResult> {
    this.profileName = config.profileName;

    const configData: Record<string, unknown> = {
      profileName: config.profileName,
      gatewayPort: config.gatewayPort,
      environment: config.environment || {},
      ...config.config,
    };

    const configMap = this.generateConfigMap(configData);
    const configMapJson = JSON.stringify(configMap);

    try {
      await runCommand("kubectl", [
        ...this.kubectlArgs(),
        "apply",
        "-f",
        "-",
        "--input",
        configMapJson,
      ]);

      return {
        success: true,
        message: `ConfigMap updated for "${this.config.deploymentName}" in namespace "${this.config.namespace}"`,
        requiresRestart: true,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update ConfigMap: ${error instanceof Error ? error.message : String(error)}`,
        requiresRestart: false,
      };
    }
  }

  /**
   * Start the deployment by scaling to the configured replica count.
   */
  async start(): Promise<void> {
    const replicas = this.config.replicas ?? 1;
    await runCommand("kubectl", [
      ...this.kubectlArgs(),
      "scale",
      "deployment",
      this.config.deploymentName,
      `--replicas=${replicas}`,
    ]);
  }

  /**
   * Stop the deployment by scaling to zero replicas.
   */
  async stop(): Promise<void> {
    await runCommand("kubectl", [
      ...this.kubectlArgs(),
      "scale",
      "deployment",
      this.config.deploymentName,
      "--replicas=0",
    ]);
  }

  /**
   * Restart by performing a rollout restart on the deployment.
   */
  async restart(): Promise<void> {
    await runCommand("kubectl", [
      ...this.kubectlArgs(),
      "rollout",
      "restart",
      `deployment/${this.config.deploymentName}`,
    ]);
  }

  /**
   * Get the status of the Kubernetes deployment.
   */
  async getStatus(): Promise<TargetStatus> {
    try {
      const output = await runCommand("kubectl", [
        ...this.kubectlArgs(),
        "get",
        "deployment",
        this.config.deploymentName,
        "-o",
        "jsonpath={.status.readyReplicas},{.status.replicas},{.status.conditions[?(@.type=='Available')].status}",
      ]);

      const [readyStr, totalStr, available] = output.split(",");
      const ready = parseInt(readyStr, 10) || 0;
      const total = parseInt(totalStr, 10) || 0;

      let state: TargetStatus["state"];
      if (total === 0) {
        state = "stopped";
      } else if (available === "True" && ready > 0) {
        state = "running";
      } else if (ready === 0 && total > 0) {
        state = "error";
      } else {
        state = "stopped";
      }

      return {
        state,
        gatewayPort: this.config.gatewayPort,
      };
    } catch {
      return { state: "not-installed" };
    }
  }

  /**
   * Get logs from the Kubernetes deployment pods.
   */
  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    const args = [
      ...this.kubectlArgs(),
      "logs",
      `deployment/${this.config.deploymentName}`,
    ];

    if (options?.lines) {
      args.push(`--tail=${options.lines}`);
    } else {
      args.push("--tail=100");
    }

    if (options?.since) {
      const seconds = Math.floor((Date.now() - options.since.getTime()) / 1000);
      args.push(`--since=${seconds}s`);
    }

    if (options?.follow) {
      args.push("-f");
    }

    try {
      const output = await runCommand("kubectl", args);
      let lines = output.split("\n").filter(Boolean);

      if (options?.filter) {
        const pattern = new RegExp(options.filter, "i");
        lines = lines.filter((line) => pattern.test(line));
      }

      return lines;
    } catch {
      return [];
    }
  }

  /**
   * Get the gateway endpoint.
   * Returns the Kubernetes Service ClusterIP endpoint.
   */
  async getEndpoint(): Promise<GatewayEndpoint> {
    try {
      const clusterIp = await runCommand("kubectl", [
        ...this.kubectlArgs(),
        "get",
        "service",
        `${this.config.deploymentName}-svc`,
        "-o",
        "jsonpath={.spec.clusterIP}",
      ]);

      return {
        host: clusterIp || `${this.config.deploymentName}-svc.${this.config.namespace}.svc.cluster.local`,
        port: this.config.gatewayPort,
        protocol: "ws",
      };
    } catch {
      // Fallback to DNS-based service discovery
      return {
        host: `${this.config.deploymentName}-svc.${this.config.namespace}.svc.cluster.local`,
        port: this.config.gatewayPort,
        protocol: "ws",
      };
    }
  }

  /**
   * Delete all Kubernetes resources for this deployment.
   */
  async destroy(): Promise<void> {
    const resources = [
      `deployment/${this.config.deploymentName}`,
      `service/${this.config.deploymentName}-svc`,
      `configmap/${this.config.deploymentName}-config`,
    ];

    for (const resource of resources) {
      try {
        await runCommand("kubectl", [
          ...this.kubectlArgs(),
          "delete",
          resource,
          "--ignore-not-found",
        ]);
      } catch {
        // Best-effort cleanup
      }
    }

    this.manifests = null;
  }
}
