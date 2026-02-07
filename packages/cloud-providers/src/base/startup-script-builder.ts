/**
 * Startup Script Builder
 *
 * Extracts common Sysbox installation and startup script logic
 * for GCE, Azure, and EC2 deployment targets.
 */

/** Default Sysbox version for installation */
const DEFAULT_SYSBOX_VERSION = "0.6.4";

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
 */
function buildContainerRunScript(options: StartupScriptOptions): string {
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
    fi
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

// ── GCE Caddy Startup Script (composable section builders) ─────────────

/** Options for the GCE Caddy startup script composer */
export interface GceCaddyStartupOptions {
  /** Gateway port number */
  readonly gatewayPort: number;
  /** Secret Manager secret name for config retrieval */
  readonly secretName: string;
  /** Sysbox version to install (default: "0.6.7") */
  readonly sysboxVersion?: string;
  /** Custom domain for Caddy auto-HTTPS */
  readonly caddyDomain?: string;
  /** OpenClaw version to pre-install (default: "latest") */
  readonly openclawVersion?: string;
  /** Additional environment variables for the container */
  readonly additionalEnv?: Record<string, string>;
}

/**
 * Builds a complete GCE startup script (bash) for Caddy-on-VM architecture.
 *
 * Architecture: Caddy (:80/:443) → 127.0.0.1:port → OpenClaw container (Sysbox)
 * Config: Secret Manager via metadata token + REST API (no gcloud CLI)
 * DNS: Docker daemon configured with 8.8.8.8 (GCE metadata blocks container DNS)
 *
 * Spike-validated: 2026-02-07 on Ubuntu 22.04.
 */
export function buildGceCaddyStartupScript(options: GceCaddyStartupOptions): string {
  const {
    gatewayPort,
    secretName,
    sysboxVersion = "0.6.7",
    caddyDomain,
    openclawVersion = "latest",
    additionalEnv,
  } = options;

  const sysboxTag = sysboxVersion.startsWith("v") ? sysboxVersion : `v${sysboxVersion}`;
  const sysboxBare = sysboxTag.replace(/^v/, "");

  const caddyConfig = caddyDomain
    ? `${caddyDomain} {\n  reverse_proxy 127.0.0.1:${gatewayPort}\n}`
    : `:80 {\n  reverse_proxy 127.0.0.1:${gatewayPort}\n}`;

  const envFlags = Object.entries(additionalEnv ?? {})
    .map(([k, v]) => `  -e ${k}="${v}" \\`)
    .join("\n");

  return `#!/bin/bash
set -euo pipefail

# ── Idempotency guard ──────────────────────────────────────────────────
MARKER="/opt/openclaw-initialized"
if [ -f "$MARKER" ]; then
  echo "Already initialized — re-fetching config and restarting container..."
  # Re-fetch config from Secret Manager on reboot
  TOKEN=$(curl -sf -H "Metadata-Flavor: Google" \\
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \\
    | jq -r '.access_token')
  PROJECT=$(curl -sf -H "Metadata-Flavor: Google" \\
    "http://metadata.google.internal/computeMetadata/v1/project/project-id")
  SECRET_RESP=$(curl -sf \\
    -H "Authorization: Bearer $TOKEN" \\
    "https://secretmanager.googleapis.com/v1/projects/\${PROJECT}/secrets/${secretName}/versions/latest:access" || echo "")
  if [ -n "$SECRET_RESP" ]; then
    CONFIG_JSON=$(echo "$SECRET_RESP" | jq -r '.payload.data' | base64 -d)
    if [ -n "$CONFIG_JSON" ] && [ "$CONFIG_JSON" != "{}" ]; then
      echo "$CONFIG_JSON" > /opt/openclaw-data/.openclaw/openclaw.json
    fi
  fi
  docker restart openclaw-gateway 2>/dev/null || true
  exit 0
fi

echo "=== Clawster GCE startup script ==="

# ── 1. Install packages ───────────────────────────────────────────────
apt-get update -y
apt-get install -y docker.io jq curl

# ── 2. Docker DNS fix (GCE metadata server blocks container DNS) ──────
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'DAEMONJSON'
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
DAEMONJSON

systemctl enable docker
systemctl start docker

# ── 3. Install Sysbox via .deb package ────────────────────────────────
if ! docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
  echo "Installing Sysbox ${sysboxTag} via .deb package..."
  ARCH=$(dpkg --print-architecture)
  SYSBOX_DEB="/tmp/sysbox-ce.deb"
  curl -fsSL "https://downloads.nestybox.com/sysbox/releases/${sysboxTag}/sysbox-ce_${sysboxBare}.linux_\${ARCH}.deb" \\
    -o "$SYSBOX_DEB"
  dpkg -i "$SYSBOX_DEB" || apt-get install -f -y
  rm -f "$SYSBOX_DEB"

  # Merge sysbox-runc into daemon.json (preserve DNS config)
  TEMP_JSON=$(cat /etc/docker/daemon.json)
  echo "$TEMP_JSON" | jq '. + {"runtimes": {"sysbox-runc": {"path": "/usr/bin/sysbox-runc"}}}' > /etc/docker/daemon.json
  systemctl restart docker
  echo "Sysbox installed successfully"
else
  echo "Sysbox already available"
fi

# ── 4. Install Caddy ──────────────────────────────────────────────────
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# ── 5. Write Caddyfile ────────────────────────────────────────────────
cat > /etc/caddy/Caddyfile <<'CADDYEOF'
${caddyConfig}
CADDYEOF
systemctl enable caddy
systemctl restart caddy
echo "Caddy configured and started"

# ── 6. Fetch config from Secret Manager (no gcloud CLI on GCE) ───────
CONFIG_DIR="/opt/openclaw-data/.openclaw"
mkdir -p "$CONFIG_DIR"

GATEWAY_TOKEN=""
for ATTEMPT in 1 2 3 4 5; do
  TOKEN=$(curl -sf -H "Metadata-Flavor: Google" \\
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \\
    | jq -r '.access_token')
  if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    break
  fi
  echo "  Attempt $ATTEMPT: waiting for metadata token..."
  sleep 5
done

PROJECT=$(curl -sf -H "Metadata-Flavor: Google" \\
  "http://metadata.google.internal/computeMetadata/v1/project/project-id")

SECRET_RESP=$(curl -sf \\
  -H "Authorization: Bearer $TOKEN" \\
  "https://secretmanager.googleapis.com/v1/projects/\${PROJECT}/secrets/${secretName}/versions/latest:access" || echo "")

if [ -n "$SECRET_RESP" ]; then
  CONFIG_JSON=$(echo "$SECRET_RESP" | jq -r '.payload.data' | base64 -d)
  if [ -n "$CONFIG_JSON" ] && [ "$CONFIG_JSON" != "{}" ]; then
    echo "$CONFIG_JSON" > "\${CONFIG_DIR}/openclaw.json"
    GATEWAY_TOKEN=$(echo "$CONFIG_JSON" | jq -r '.gateway.auth.token // empty')
    echo "Config written from Secret Manager"
  else
    echo "No config in Secret Manager yet, starting with defaults"
    echo '{}' > "\${CONFIG_DIR}/openclaw.json"
  fi
else
  echo "WARNING: Could not fetch secret, starting with defaults"
  echo '{}' > "\${CONFIG_DIR}/openclaw.json"
fi

# ── 7. Build pre-built OpenClaw image (cached after first boot) ───────
OPENCLAW_IMAGE="clawster-openclaw"
if ! docker image inspect "$OPENCLAW_IMAGE" >/dev/null 2>&1; then
  echo "Building OpenClaw image (first boot only, ~2 min)..."
  docker build -t "$OPENCLAW_IMAGE" - <<'DOCKERFILE'
FROM node:22
RUN npm install -g openclaw@${openclawVersion}
DOCKERFILE
  echo "OpenClaw image built successfully"
else
  echo "OpenClaw image already cached"
fi

# ── 8. Run OpenClaw container ─────────────────────────────────────────
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
  -v /opt/openclaw-data/.openclaw:/root/.openclaw \\
  -e OPENCLAW_GATEWAY_PORT=${gatewayPort} \\
  -e OPENCLAW_GATEWAY_TOKEN="\${GATEWAY_TOKEN:-}"${envFlags ? ` \\\n${envFlags}` : ""} \\
  $OPENCLAW_IMAGE \\
  openclaw gateway --port ${gatewayPort} --verbose

# ── 9. Mark as initialized ────────────────────────────────────────────
touch "$MARKER"
echo "OpenClaw gateway started on port ${gatewayPort}"
`;
}
