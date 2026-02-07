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

// ── AWS Caddy Startup Script (EC2 user data for Caddy-on-VM) ────────────

/** Options for the AWS Caddy EC2 user data script */
export interface AwsCaddyUserDataOptions {
  /** Gateway port number */
  readonly gatewayPort: number;
  /** Secrets Manager secret name for config retrieval */
  readonly secretName: string;
  /** AWS region for Secrets Manager API calls */
  readonly region: string;
  /** Sysbox version to install (default: "0.6.7") */
  readonly sysboxVersion?: string;
  /** Custom domain for Caddy auto-HTTPS */
  readonly customDomain?: string;
  /** OpenClaw version to pre-install (default: "latest") */
  readonly openclawVersion?: string;
  /** Additional environment variables for the container */
  readonly additionalEnv?: Record<string, string>;
}

/**
 * Builds a complete EC2 user data script (bash) for Caddy-on-VM architecture.
 *
 * Architecture: Caddy (:80/:443) → 127.0.0.1:port → OpenClaw container (Sysbox)
 * Config: Secrets Manager via IMDS v2 token + REST API
 * OS: Ubuntu 22.04 LTS
 *
 * Follows the same pattern as buildGceCaddyStartupScript() but uses
 * AWS IMDS v2 + Secrets Manager REST API instead of GCE metadata + Secret Manager.
 */
export function buildAwsCaddyUserData(options: AwsCaddyUserDataOptions): string {
  const {
    gatewayPort,
    secretName,
    region,
    sysboxVersion = "0.6.7",
    customDomain,
    openclawVersion = "latest",
    additionalEnv,
  } = options;

  const sysboxTag = sysboxVersion.startsWith("v") ? sysboxVersion : `v${sysboxVersion}`;
  const sysboxBare = sysboxTag.replace(/^v/, "");

  const caddyConfig = customDomain
    ? `${customDomain} {\n  reverse_proxy 127.0.0.1:${gatewayPort}\n}`
    : `:80 {\n  reverse_proxy 127.0.0.1:${gatewayPort}\n}`;

  const envFlags = Object.entries(additionalEnv ?? {})
    .map(([k, v]) => `  -e ${k}="${v.replace(/["\\$`]/g, "\\$&")}" \\`)
    .join("\n");

  return `#!/bin/bash
set -euo pipefail

# ── SigV4 helper function ─────────────────────────────────────────────
# Fetches a secret value from AWS Secrets Manager using SigV4 signed requests.
# Requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN in env.
fetch_secret_value() {
  python3 -c "
import json, urllib.request, datetime, hashlib, hmac, os
region='${region}'
secret_id='${secretName}'
host=f'secretsmanager.{region}.amazonaws.com'
now=datetime.datetime.utcnow()
datestamp=now.strftime('%Y%m%d')
amzdate=now.strftime('%Y%m%dT%H%M%SZ')
body=json.dumps({'SecretId': secret_id})
content_type='application/x-amz-json-1.1'
target='secretsmanager.GetSecretValue'
canonical_uri='/'
canonical_querystring=''
payload_hash=hashlib.sha256(body.encode()).hexdigest()
canonical_headers=f'content-type:{content_type}\nhost:{host}\nx-amz-date:{amzdate}\nx-amz-security-token:{os.environ[\"AWS_SESSION_TOKEN\"]}\nx-amz-target:{target}\n'
signed_headers='content-type;host;x-amz-date;x-amz-security-token;x-amz-target'
canonical_request=f'POST\n{canonical_uri}\n{canonical_querystring}\n{canonical_headers}\n{signed_headers}\n{payload_hash}'
algorithm='AWS4-HMAC-SHA256'
scope=f'{datestamp}/{region}/secretsmanager/aws4_request'
string_to_sign=f'{algorithm}\n{amzdate}\n{scope}\n'+hashlib.sha256(canonical_request.encode()).hexdigest()
def sign(key,msg): return hmac.new(key,msg.encode(),'sha256').digest()
k=sign(sign(sign(sign(('AWS4'+os.environ['AWS_SECRET_ACCESS_KEY']).encode(),datestamp),region),'secretsmanager'),'aws4_request')
sig=hmac.new(k,string_to_sign.encode(),'sha256').hexdigest()
auth=f'{algorithm} Credential={os.environ[\"AWS_ACCESS_KEY_ID\"]}/{scope}, SignedHeaders={signed_headers}, Signature={sig}'
req=urllib.request.Request(f'https://{host}/',data=body.encode(),headers={'Content-Type':content_type,'X-Amz-Date':amzdate,'X-Amz-Target':target,'X-Amz-Security-Token':os.environ['AWS_SESSION_TOKEN'],'Authorization':auth})
resp=urllib.request.urlopen(req)
data=json.loads(resp.read())
print(data.get('SecretString','{}'))
" 2>/dev/null || echo "{}"
}

# ── Idempotency guard ──────────────────────────────────────────────────
MARKER="/opt/openclaw-initialized"
if [ -f "$MARKER" ]; then
  echo "Already initialized — re-fetching config and restarting container..."
  # Re-fetch config from Secrets Manager on reboot via IMDS v2
  IMDS_TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \\
    -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
  CREDS=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \\
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/" | head -1)
  CREDS_JSON=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \\
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/$CREDS")
  AWS_ACCESS_KEY_ID=$(echo "$CREDS_JSON" | jq -r '.AccessKeyId')
  AWS_SECRET_ACCESS_KEY=$(echo "$CREDS_JSON" | jq -r '.SecretAccessKey')
  AWS_SESSION_TOKEN=$(echo "$CREDS_JSON" | jq -r '.Token')
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

  SECRET_RESP=$(fetch_secret_value)
  if [ -n "$SECRET_RESP" ] && [ "$SECRET_RESP" != "{}" ]; then
    echo "$SECRET_RESP" > /opt/openclaw-data/.openclaw/openclaw.json
  fi
  docker restart openclaw-gateway 2>/dev/null || true
  exit 0
fi

echo "=== Clawster AWS EC2 startup script ==="

# ── 1. Install packages ───────────────────────────────────────────────
apt-get update -y
apt-get install -y docker.io jq curl python3

systemctl enable docker
systemctl start docker

# ── 2. Install Sysbox via .deb package ────────────────────────────────
if ! docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
  echo "Installing Sysbox ${sysboxTag} via .deb package..."
  ARCH=$(dpkg --print-architecture)
  SYSBOX_DEB="/tmp/sysbox-ce.deb"
  curl -fsSL "https://downloads.nestybox.com/sysbox/releases/${sysboxTag}/sysbox-ce_${sysboxBare}.linux_\${ARCH}.deb" \\
    -o "$SYSBOX_DEB"
  dpkg -i "$SYSBOX_DEB" || apt-get install -f -y
  rm -f "$SYSBOX_DEB"

  # Add sysbox-runc runtime to Docker daemon config
  mkdir -p /etc/docker
  if [ -f /etc/docker/daemon.json ]; then
    TEMP_JSON=$(cat /etc/docker/daemon.json)
    echo "$TEMP_JSON" | jq '. + {"runtimes": {"sysbox-runc": {"path": "/usr/bin/sysbox-runc"}}}' > /etc/docker/daemon.json
  else
    echo '{"runtimes": {"sysbox-runc": {"path": "/usr/bin/sysbox-runc"}}}' > /etc/docker/daemon.json
  fi
  systemctl restart docker
  echo "Sysbox installed successfully"
else
  echo "Sysbox already available"
fi

# ── 3. Install Caddy ──────────────────────────────────────────────────
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# ── 4. Write Caddyfile ────────────────────────────────────────────────
cat > /etc/caddy/Caddyfile <<'CADDYEOF'
${caddyConfig}
CADDYEOF
systemctl enable caddy
systemctl restart caddy
echo "Caddy configured and started"

# ── 5. Fetch config from Secrets Manager via IMDS v2 ─────────────────
CONFIG_DIR="/opt/openclaw-data/.openclaw"
mkdir -p "$CONFIG_DIR"

GATEWAY_TOKEN=""
for ATTEMPT in 1 2 3 4 5; do
  IMDS_TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \\
    -H "X-aws-ec2-metadata-token-ttl-seconds: 300" || echo "")
  if [ -n "$IMDS_TOKEN" ]; then
    break
  fi
  echo "  Attempt $ATTEMPT: waiting for IMDS token..."
  sleep 5
done

# Get IAM role credentials from IMDS v2
ROLE_NAME=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \\
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/" | head -1)
CREDS_JSON=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \\
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/$ROLE_NAME")

export AWS_ACCESS_KEY_ID=$(echo "$CREDS_JSON" | jq -r '.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo "$CREDS_JSON" | jq -r '.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo "$CREDS_JSON" | jq -r '.Token')

# Fetch secret using SigV4 helper function
SECRET_RESP=$(fetch_secret_value)

if [ -n "$SECRET_RESP" ] && [ "$SECRET_RESP" != "{}" ]; then
  echo "$SECRET_RESP" > "\${CONFIG_DIR}/openclaw.json"
  GATEWAY_TOKEN=$(echo "$SECRET_RESP" | jq -r '.gateway.auth.token // empty')
  echo "Config written from Secrets Manager"
else
  echo "No config in Secrets Manager yet, starting with defaults"
  echo '{}' > "\${CONFIG_DIR}/openclaw.json"
fi

# ── 6. Pre-build OpenClaw Docker image ────────────────────────────────
echo "Pre-building OpenClaw Docker image..."
docker build -t openclaw-prebuilt:latest - <<'DOCKERFILE'
FROM node:22
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN npm install -g openclaw@${openclawVersion}
DOCKERFILE
echo "OpenClaw image pre-built"

# ── 7. Run OpenClaw container ─────────────────────────────────────────
DOCKER_RUNTIME=""
DOCKER_SOCKET_MOUNT=""
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q 'sysbox-runc'; then
  DOCKER_RUNTIME="--runtime=sysbox-runc"
  echo "Using Sysbox runtime"
else
  DOCKER_SOCKET_MOUNT="-v /var/run/docker.sock:/var/run/docker.sock"
  echo "Warning: Sysbox not available, mounting Docker socket for sandbox mode"
fi

docker rm -f openclaw-gateway 2>/dev/null || true

docker run -d \\
  --name openclaw-gateway \\
  --restart=always \\
  $DOCKER_RUNTIME \\
  -p 127.0.0.1:${gatewayPort}:${gatewayPort} \\
  $DOCKER_SOCKET_MOUNT \\
  -v /opt/openclaw-data/.openclaw:/root/.openclaw \\
  -e OPENCLAW_GATEWAY_PORT=${gatewayPort} \\
  -e OPENCLAW_GATEWAY_TOKEN="\${GATEWAY_TOKEN:-}"${envFlags ? ` \\\n${envFlags}` : ""} \\
  openclaw-prebuilt:latest \\
  sh -c "openclaw gateway --port ${gatewayPort} --verbose"

# ── 8. Mark as initialized ────────────────────────────────────────────
touch "$MARKER"
echo "OpenClaw gateway started on port ${gatewayPort}"
`;
}
