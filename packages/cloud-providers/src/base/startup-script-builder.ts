/**
 * Startup Script Builder
 *
 * Extracts common Sysbox installation and startup script logic
 * for GCE, Azure, and EC2 deployment targets.
 */

/** Default Sysbox version for installation */
const DEFAULT_SYSBOX_VERSION = "0.6.4";

import type { MiddlewareAssignment } from "../interface/deployment-target";

/** Configuration options for startup scripts */
export interface StartupScriptOptions {
  /** Target platform */
  platform: "gce" | "azure" | "ec2";
  /** Sysbox version to install (default: 0.6.4) */
  sysboxVersion?: string;
  /** Data mount path (e.g., /mnt/openclaw) */
  dataMount: string;
  /** Gateway port number */
  gatewayPort: number;
  /** Optional gateway authentication token */
  gatewayToken?: string;
  /** Source for config retrieval */
  configSource: "metadata" | "secret" | "env";
  /** Container image URI */
  imageUri: string;
  /** Additional environment variables */
  additionalEnv?: Record<string, string>;
  /** Middleware assignments — when present, a proxy sidecar is deployed */
  middlewareConfig?: {
    middlewares: MiddlewareAssignment[];
  };
}

/**
 * Builds bash commands to install Sysbox runtime.
 * Checks for existing installation, downloads from versioned GitHub release,
 * and restarts Docker to pick up the new runtime.
 */
export function buildSysboxInstallScript(version: string = DEFAULT_SYSBOX_VERSION): string {
  const versionTag = version.startsWith("v") ? version : `v${version}`;
  return `# Install Sysbox runtime for secure Docker-in-Docker (sandbox mode)
# Using versioned release for stability and security
SYSBOX_VERSION="${versionTag}"
if ! docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
  echo "Installing Sysbox $SYSBOX_VERSION for secure sandbox mode..."
  SYSBOX_INSTALL_SCRIPT="/tmp/sysbox-install-$$.sh"
  curl -fsSL "https://raw.githubusercontent.com/nestybox/sysbox/$SYSBOX_VERSION/scr/install.sh" -o "$SYSBOX_INSTALL_SCRIPT"
  chmod +x "$SYSBOX_INSTALL_SCRIPT"
  "$SYSBOX_INSTALL_SCRIPT"
  rm -f "$SYSBOX_INSTALL_SCRIPT"
  systemctl restart docker
  echo "Sysbox runtime installed successfully"
else
  echo "Sysbox runtime already available"
fi`;
}

/**
 * Builds the runtime selection and container run commands.
 * When middleware is configured, creates a Docker network with proxy sidecar.
 */
function buildContainerRunScript(options: StartupScriptOptions): string {
  const enabledMiddlewares = (options.middlewareConfig?.middlewares ?? []).filter((m) => m.enabled);

  if (enabledMiddlewares.length > 0) {
    return buildContainerRunWithMiddleware(options, enabledMiddlewares);
  }

  return buildContainerRunDirect(options);
}

/**
 * Direct mode: OpenClaw exposed to host on gatewayPort.
 */
function buildContainerRunDirect(options: StartupScriptOptions): string {
  const envVars = Object.entries(options.additionalEnv ?? {})
    .map(([k, v]) => `-e ${k}="${v}"`)
    .join(" \\\n  ");

  return `# Determine runtime and run OpenClaw
DOCKER_RUNTIME=""
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
  DOCKER_RUNTIME="--runtime=sysbox-runc"
  echo "Using Sysbox runtime for secure Docker-in-Docker"
else
  echo "Warning: Sysbox not available, sandbox mode will be limited"
fi

docker rm -f openclaw-gateway 2>/dev/null || true

docker run -d \\
  --name openclaw-gateway \\
  --restart=always \\
  $DOCKER_RUNTIME \\
  -p ${options.gatewayPort}:${options.gatewayPort} \\
  -v "${options.dataMount}/.openclaw:/home/node/.openclaw" \\
  -e OPENCLAW_GATEWAY_PORT=${options.gatewayPort} \\
  -e OPENCLAW_GATEWAY_TOKEN="${options.gatewayToken ?? ""}"${envVars ? ` \\\n  ${envVars}` : ""} \\
  ${options.imageUri} \\
  sh -c "npx -y openclaw@latest gateway --port ${options.gatewayPort} --verbose"`;
}

/**
 * Middleware mode: OpenClaw on Docker network (internal), proxy exposed to host.
 * The proxy auto-installs middleware packages at startup (Grafana pattern).
 */
function buildContainerRunWithMiddleware(
  options: StartupScriptOptions,
  middlewares: MiddlewareAssignment[],
): string {
  const envVars = Object.entries(options.additionalEnv ?? {})
    .map(([k, v]) => `-e ${k}="${v}"`)
    .join(" \\\n  ");

  const proxyConfig = JSON.stringify({
    externalPort: 18789,
    internalPort: 18789,
    internalHost: "openclaw-gateway",
    middlewares: middlewares.map((m) => ({
      package: m.package,
      enabled: m.enabled,
      config: m.config,
    })),
  });

  return `# Determine runtime
DOCKER_RUNTIME=""
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
  DOCKER_RUNTIME="--runtime=sysbox-runc"
  echo "Using Sysbox runtime for secure Docker-in-Docker"
else
  echo "Warning: Sysbox not available, sandbox mode will be limited"
fi

# Create Docker network for middleware proxy
docker network create clawster-mw 2>/dev/null || true

# Clean up any existing containers
docker rm -f openclaw-gateway 2>/dev/null || true
docker rm -f clawster-proxy 2>/dev/null || true

# Run OpenClaw on the network (internal only — no host port exposure)
docker run -d \\
  --name openclaw-gateway \\
  --restart=always \\
  --network clawster-mw \\
  $DOCKER_RUNTIME \\
  -v "${options.dataMount}/.openclaw:/home/node/.openclaw" \\
  -e OPENCLAW_GATEWAY_PORT=18789 \\
  -e OPENCLAW_GATEWAY_TOKEN="${options.gatewayToken ?? ""}"${envVars ? ` \\\n  ${envVars}` : ""} \\
  ${options.imageUri} \\
  sh -c "npx -y openclaw@latest gateway --port 18789 --verbose"

# Run middleware proxy on the same network, exposed to host
MW_CONFIG='${proxyConfig.replace(/'/g, "'\\''")}'
docker run -d \\
  --name clawster-proxy \\
  --restart=always \\
  --network clawster-mw \\
  -p ${options.gatewayPort}:18789 \\
  -e "CLAWSTER_MIDDLEWARE_CONFIG=$MW_CONFIG" \\
  node:22-slim \\
  sh -c "npx -y @clawster/middleware-proxy"

echo "Middleware proxy started on port ${options.gatewayPort}"`;
}

/**
 * Builds a GCE-style bash startup script.
 */
export function buildStartupScript(options: StartupScriptOptions): string {
  const sysboxScript = buildSysboxInstallScript(options.sysboxVersion);
  const containerScript = buildContainerRunScript(options);

  return `#!/bin/bash
set -e

${sysboxScript}

mkdir -p "${options.dataMount}/.openclaw"

${containerScript}`;
}

/**
 * Builds an Azure cloud-init YAML script.
 */
export function buildCloudInitScript(options: StartupScriptOptions): string {
  const versionTag = (options.sysboxVersion ?? DEFAULT_SYSBOX_VERSION).startsWith("v")
    ? options.sysboxVersion
    : `v${options.sysboxVersion ?? DEFAULT_SYSBOX_VERSION}`;

  const envLines = Object.entries(options.additionalEnv ?? {})
    .map(([k, v]) => `      -e ${k}="${v}" \\`)
    .join("\n");

  const enabledMiddlewares = (options.middlewareConfig?.middlewares ?? []).filter((m) => m.enabled);
  const hasMiddleware = enabledMiddlewares.length > 0;

  const sysboxBlock = `    SYSBOX_VERSION="${versionTag}"
    if ! docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
      echo "Installing Sysbox $SYSBOX_VERSION for secure sandbox mode..."
      SYSBOX_INSTALL_SCRIPT="/tmp/sysbox-install-$$.sh"
      curl -fsSL "https://raw.githubusercontent.com/nestybox/sysbox/$SYSBOX_VERSION/scr/install.sh" -o "$SYSBOX_INSTALL_SCRIPT"
      chmod +x "$SYSBOX_INSTALL_SCRIPT"
      "$SYSBOX_INSTALL_SCRIPT"
      rm -f "$SYSBOX_INSTALL_SCRIPT"
      systemctl restart docker
      echo "Sysbox runtime installed successfully"
    else
      echo "Sysbox runtime already available"
    fi`;

  if (hasMiddleware) {
    const proxyConfig = JSON.stringify({
      externalPort: 18789,
      internalPort: 18789,
      internalHost: "openclaw-gateway",
      middlewares: enabledMiddlewares.map((m) => ({
        package: m.package,
        enabled: m.enabled,
        config: m.config,
      })),
    });

    return `#cloud-config
package_update: true
package_upgrade: true

packages:
  - docker.io
  - jq
  - curl

runcmd:
  - systemctl enable docker
  - systemctl start docker
  - mkdir -p ${options.dataMount}/.openclaw
  - |
${sysboxBlock}
  - docker network create clawster-mw 2>/dev/null || true
  - docker rm -f openclaw-gateway 2>/dev/null || true
  - docker rm -f clawster-proxy 2>/dev/null || true
  - |
    DOCKER_RUNTIME=""
    if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
      DOCKER_RUNTIME="--runtime=sysbox-runc"
    fi
    docker run -d \\
      --name openclaw-gateway \\
      --restart=always \\
      --network clawster-mw \\
      $DOCKER_RUNTIME \\
      -v ${options.dataMount}/.openclaw:/home/node/.openclaw \\
      -e OPENCLAW_GATEWAY_PORT=18789 \\
      -e OPENCLAW_GATEWAY_TOKEN="${options.gatewayToken ?? ""}"${envLines ? ` \\\n${envLines}` : ""} \\
      ${options.imageUri} \\
      sh -c "npx -y openclaw@latest gateway --port 18789 --verbose"
  - |
    MW_CONFIG='${proxyConfig.replace(/'/g, "'\\''")}'
    docker run -d \\
      --name clawster-proxy \\
      --restart=always \\
      --network clawster-mw \\
      -p ${options.gatewayPort}:18789 \\
      -e "CLAWSTER_MIDDLEWARE_CONFIG=$MW_CONFIG" \\
      node:22-slim \\
      sh -c "npx -y @clawster/middleware-proxy"

final_message: "OpenClaw gateway with middleware proxy started on port ${options.gatewayPort}"
`;
  }

  return `#cloud-config
package_update: true
package_upgrade: true

packages:
  - docker.io
  - jq
  - curl

runcmd:
  - systemctl enable docker
  - systemctl start docker
  - mkdir -p ${options.dataMount}/.openclaw
  - |
${sysboxBlock}
  - docker rm -f openclaw-gateway 2>/dev/null || true
  - |
    DOCKER_RUNTIME=""
    if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
      DOCKER_RUNTIME="--runtime=sysbox-runc"
    fi
    docker run -d \\
      --name openclaw-gateway \\
      --restart=always \\
      $DOCKER_RUNTIME \\
      -p ${options.gatewayPort}:${options.gatewayPort} \\
      -v ${options.dataMount}/.openclaw:/home/node/.openclaw \\
      -e OPENCLAW_GATEWAY_PORT=${options.gatewayPort} \\
      -e OPENCLAW_GATEWAY_TOKEN="${options.gatewayToken ?? ""}"${envLines ? ` \\\n${envLines}` : ""} \\
      ${options.imageUri} \\
      sh -c "npx -y openclaw@latest gateway --port ${options.gatewayPort} --verbose"

final_message: "OpenClaw gateway started on port ${options.gatewayPort}"
`;
}

// ── Azure Caddy Cloud-Init (composable section builders) ──────────────

/** Azure Files mount configuration */
export interface AzureFilesConfig {
  readonly storageAccountName: string;
  readonly shareName: string;
  readonly mountPath: string;
  readonly managedIdentityClientId: string;
}

/** Key Vault configuration for config retrieval via MI */
export interface AzureKeyVaultConfig {
  readonly vaultName: string;
  readonly secretName: string;
  readonly managedIdentityClientId: string;
}

/** Options for the Azure Caddy cloud-init composer */
export interface AzureCloudInitOptions {
  readonly sysboxVersion?: string;
  readonly gatewayPort: number;
  readonly azureFiles: AzureFilesConfig;
  readonly keyVault?: AzureKeyVaultConfig;
  readonly caddyDomain?: string;
  readonly additionalEnv?: Record<string, string>;
  readonly middlewareConfig?: {
    middlewares: MiddlewareAssignment[];
  };
}

/**
 * Builds the Azure Files CIFS mount section.
 * Uses MI → ARM token → listKeys → CIFS credentials → mount.
 * Spike-proven: POST with empty body (`-d ""`) required for listKeys.
 */
export function buildAzureFilesMountSection(af: AzureFilesConfig): string {
  return `  # Mount Azure Files via Managed Identity
  - |
    echo "Fetching storage account key via Managed Identity..."
    for ATTEMPT in 1 2 3 4 5; do
      ARM_TOKEN=$(curl -s -H "Metadata:true" \\
        "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/&client_id=${af.managedIdentityClientId}" \\
        | jq -r '.access_token')
      if [ -n "$ARM_TOKEN" ] && [ "$ARM_TOKEN" != "null" ]; then
        break
      fi
      echo "  Attempt $ATTEMPT: waiting for MI token..."
      sleep 10
    done
    if [ -z "$ARM_TOKEN" ] || [ "$ARM_TOKEN" = "null" ]; then
      echo "ERROR: Failed to get ARM token via MI" >&2
      exit 1
    fi

    SUB_ID=$(curl -s -H "Metadata:true" \\
      "http://169.254.169.254/metadata/instance?api-version=2021-02-01" \\
      | jq -r '.compute.subscriptionId')
    RG=$(curl -s -H "Metadata:true" \\
      "http://169.254.169.254/metadata/instance?api-version=2021-02-01" \\
      | jq -r '.compute.resourceGroupName')

    STORAGE_KEYS=$(curl -s -X POST -d "" \\
      -H "Authorization: Bearer $ARM_TOKEN" \\
      -H "Content-Type: application/json" \\
      "https://management.azure.com/subscriptions/$SUB_ID/resourceGroups/$RG/providers/Microsoft.Storage/storageAccounts/${af.storageAccountName}/listKeys?api-version=2023-05-01")
    STORAGE_KEY=$(echo "$STORAGE_KEYS" | jq -r '.keys[0].value')

    if [ -z "$STORAGE_KEY" ] || [ "$STORAGE_KEY" = "null" ]; then
      echo "ERROR: Failed to get storage account key" >&2
      exit 1
    fi

    mkdir -p /etc/smbcredentials
    cat > /etc/smbcredentials/${af.storageAccountName}.cred <<CREDEOF
username=${af.storageAccountName}
password=$STORAGE_KEY
CREDEOF
    chmod 600 /etc/smbcredentials/${af.storageAccountName}.cred

    mkdir -p ${af.mountPath}
    mount -t cifs //${af.storageAccountName}.file.core.windows.net/${af.shareName} ${af.mountPath} \\
      -o credentials=/etc/smbcredentials/${af.storageAccountName}.cred,dir_mode=0777,file_mode=0777,serverino,nosharesock,actimeo=30
    echo "//${af.storageAccountName}.file.core.windows.net/${af.shareName} ${af.mountPath} cifs credentials=/etc/smbcredentials/${af.storageAccountName}.cred,dir_mode=0777,file_mode=0777,serverino,nosharesock,actimeo=30 0 0" >> /etc/fstab
    mkdir -p ${af.mountPath}/.openclaw
    echo "Azure Files mounted at ${af.mountPath}"`;
}

/**
 * Builds Sysbox installation via .deb package.
 * The GitHub install script is broken on Ubuntu 24.04 — spike-proven.
 */
export function buildSysboxDebSection(version: string = DEFAULT_SYSBOX_VERSION): string {
  const tag = version.startsWith("v") ? version : `v${version}`;
  const bare = tag.replace(/^v/, "");

  return `  # Install Sysbox via .deb package (GitHub install script broken on Ubuntu 24.04)
  - |
    if ! docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
      echo "Installing Sysbox ${tag} via .deb package..."
      ARCH=$(dpkg --print-architecture)
      SYSBOX_DEB="/tmp/sysbox-ce.deb"
      curl -fsSL "https://downloads.nestybox.com/sysbox/releases/${tag}/sysbox-ce_${bare}-0.linux_$ARCH.deb" \\
        -o "$SYSBOX_DEB"
      apt-get install -f -y "$SYSBOX_DEB" || dpkg -i "$SYSBOX_DEB" && apt-get install -f -y
      rm -f "$SYSBOX_DEB"
      systemctl restart docker
      echo "Sysbox installed successfully"
    else
      echo "Sysbox already available"
    fi`;
}

/**
 * Builds Caddy install + Caddyfile section.
 * Uses official Cloudsmith apt repo for production-grade install.
 */
export function buildCaddySection(gatewayPort: number, domain?: string): string {
  const caddyConfig = domain
    ? `${domain} {\\n  reverse_proxy 127.0.0.1:${gatewayPort}\\n}`
    : `:80 {\\n  reverse_proxy 127.0.0.1:${gatewayPort}\\n}`;

  return `  # Install Caddy via official apt repository
  - |
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy

  # Write Caddyfile and start
  - |
    printf '${caddyConfig}\\n' > /etc/caddy/Caddyfile
    systemctl enable caddy
    systemctl restart caddy
    echo "Caddy configured and started"`;
}

/**
 * Builds Key Vault config fetch section via MI.
 * Writes config to the Azure Files mount path and exports GATEWAY_TOKEN.
 */
export function buildKeyVaultFetchSection(kv: AzureKeyVaultConfig, configPath: string): string {
  return `  # Fetch config from Key Vault via Managed Identity
  - |
    echo "Fetching config from Key Vault..."
    GATEWAY_TOKEN=""
    for ATTEMPT in 1 2 3 4 5; do
      KV_TOKEN=$(curl -s -H "Metadata:true" \\
        "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://vault.azure.net&client_id=${kv.managedIdentityClientId}" \\
        | jq -r '.access_token')
      if [ -n "$KV_TOKEN" ] && [ "$KV_TOKEN" != "null" ]; then
        break
      fi
      echo "  Attempt $ATTEMPT: waiting for KV token..."
      sleep 5
    done

    if [ -n "$KV_TOKEN" ] && [ "$KV_TOKEN" != "null" ]; then
      SECRET_RESP=$(curl -s \\
        -H "Authorization: Bearer $KV_TOKEN" \\
        "https://${kv.vaultName}.vault.azure.net/secrets/${kv.secretName}?api-version=7.4")
      CONFIG_JSON=$(echo "$SECRET_RESP" | jq -r '.value // empty')
      if [ -n "$CONFIG_JSON" ] && [ "$CONFIG_JSON" != "{}" ]; then
        echo "$CONFIG_JSON" > ${configPath}
        GATEWAY_TOKEN=$(echo "$CONFIG_JSON" | jq -r '.gateway.auth.token // empty')
        echo "Config written from Key Vault"
      else
        echo "No config in Key Vault yet, starting with defaults"
      fi
    else
      echo "WARNING: Could not fetch KV token, starting with defaults"
    fi`;
}

/**
 * Builds the OpenClaw container run section.
 * Docker port bound to 127.0.0.1 only — Caddy fronts it.
 * Config mount at /root/.openclaw (spike-proven, not /home/node/).
 */
export function buildOpenClawContainerSection(
  gatewayPort: number,
  mountPath: string,
  additionalEnv?: Record<string, string>
): string {
  const envLines = Object.entries(additionalEnv ?? {})
    .map(([k, v]) => `      -e ${k}="${v}" \\`)
    .join("\n");

  return `  # Start OpenClaw container (port bound to localhost — Caddy fronts it)
  - |
    DOCKER_RUNTIME=""
    if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
      DOCKER_RUNTIME="--runtime=sysbox-runc"
      echo "Using Sysbox runtime"
    fi

    docker rm -f openclaw-gateway 2>/dev/null || true

    docker run -d \\
      --name openclaw-gateway \\
      --restart=always \\
      $DOCKER_RUNTIME \\
      -p 127.0.0.1:${gatewayPort}:${gatewayPort} \\
      -v /var/run/docker.sock:/var/run/docker.sock \\
      -v ${mountPath}/.openclaw:/root/.openclaw \\
      -e OPENCLAW_GATEWAY_PORT=${gatewayPort} \\
      -e OPENCLAW_GATEWAY_TOKEN="\${GATEWAY_TOKEN:-}"${envLines ? ` \\\n${envLines}` : ""} \\
      node:22 \\
      sh -c "npx -y openclaw@latest gateway --port ${gatewayPort} --verbose"
    echo "OpenClaw container started on port ${gatewayPort}"`;
}

/**
 * Composes all Azure cloud-init sections into a complete cloud-config.
 *
 * Architecture: Caddy (:80/:443) → 127.0.0.1:port → OpenClaw container
 * Storage: Azure Files via CIFS mount (MI → ARM → listKeys)
 * Config: Key Vault via MI REST API
 * Sandbox: Sysbox .deb install
 */
export function buildAzureCaddyCloudInit(options: AzureCloudInitOptions): string {
  const { azureFiles, keyVault, gatewayPort, caddyDomain, additionalEnv, sysboxVersion } = options;
  const configPath = `${azureFiles.mountPath}/.openclaw/openclaw.json`;

  const sections = [
    "  # Enable and start Docker",
    "  - systemctl enable docker",
    "  - systemctl start docker",
    "",
    buildAzureFilesMountSection(azureFiles),
    "",
    buildSysboxDebSection(sysboxVersion),
    "",
    buildCaddySection(gatewayPort, caddyDomain),
    "",
    ...(keyVault ? [buildKeyVaultFetchSection(keyVault, configPath), ""] : []),
    buildOpenClawContainerSection(gatewayPort, azureFiles.mountPath, additionalEnv),
  ];

  return `#cloud-config
package_update: true
package_upgrade: true

packages:
  - docker.io
  - jq
  - curl
  - cifs-utils

runcmd:
${sections.join("\n")}

final_message: "OpenClaw gateway ready (Caddy + Sysbox + Azure Files)"
`;
}

/**
 * Builds an EC2 user data script.
 */
export function buildUserDataScript(options: StartupScriptOptions): string {
  const sysboxScript = buildSysboxInstallScript(options.sysboxVersion);
  const containerScript = buildContainerRunScript(options);

  return `#!/bin/bash
set -e

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  yum install -y docker || apt-get update && apt-get install -y docker.io
  systemctl enable docker
  systemctl start docker
fi

${sysboxScript}

mkdir -p "${options.dataMount}/.openclaw"

${containerScript}`;
}
