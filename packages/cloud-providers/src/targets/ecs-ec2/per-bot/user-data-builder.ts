/**
 * ECS EC2 UserData builder.
 *
 * Generates the complete EC2 UserData script for ECS-optimized AL2023 instances
 * running OpenClaw with Sysbox. Spike-verified on live AWS infrastructure (2026-02-06).
 *
 * The script has two sections:
 * 1. **Foreground** (runs first, blocks cloud-init): kernel module restore,
 *    package install, Sysbox .deb extraction, ECS config, systemd fixes.
 * 2. **Background** (non-blocking, runs in parallel): Docker restart (picks up
 *    daemon.json), ECS agent image reload, OpenClaw prebuild, ECS agent start.
 *
 * Background is REQUIRED to avoid systemd deadlock with cloud-init
 * (see: aws/amazon-ecs-agent#1707).
 */

/** Default Sysbox version — v0.6.7 fixes idmapping bug on AL2023 (kernel 6.1) */
const DEFAULT_SYSBOX_VERSION = "0.6.7";

/** SHA256 checksums from official release: github.com/nestybox/sysbox/releases/tag/v0.6.7 */
const SYSBOX_SHA256_AMD64 =
  "b7ac389e5a19592cadf16e0ca30e40919516128f6e1b7f99e1cb4ff64554172e";

/** Configuration for ECS EC2 UserData generation */
export interface EcsEc2UserDataParams {
  /** Bot name (used for ECS cluster name) */
  botName: string;
  /** Sysbox version (default: 0.6.7) */
  sysboxVersion?: string;
  /** OpenClaw version for prebuild (default: "latest") */
  openclawVersion?: string;
}

/**
 * Builds the foreground section of UserData.
 * Runs synchronously during cloud-init, blocks until complete.
 */
function buildForegroundScript(params: {
  botName: string;
  sysboxVersion: string;
}): string {
  const { botName, sysboxVersion } = params;

  return [
    `# ── Foreground: kernel modules, packages, Sysbox install, ECS config ──`,
    ``,
    `# Restore kernel modules — ECS-optimized AMI ships 0 .ko files on disk`,
    `# veth.ko is required for awsvpc networking`,
    `yum reinstall -y kernel`,
    `# AL2023 ECS-optimized AMI stores modules at /usr/lib/modules/ but`,
    `# modprobe/depmod expect /lib/modules/ — symlink bridges the gap`,
    `ln -sf /usr/lib/modules /lib/modules`,
    `depmod -a`,
    `modprobe veth`,
    ``,
    `# Required packages (NOT pre-installed on ECS-optimized AL2023)`,
    `# binutils: ar for .deb extraction, rsync: sysbox-mgr preflight, fuse: sysbox-fs FUSE mount`,
    `yum install -y binutils rsync fuse`,
    ``,
    `# Configure ECS agent (read on first start)`,
    `cat > /etc/ecs/ecs.config <<'ECS_CONFIG'`,
    `ECS_CLUSTER=clawster-${botName}`,
    `ECS_AWSVPC_BLOCK_IMDS=true`,
    `ECS_DISABLE_PRIVILEGED=true`,
    `ECS_IMAGE_PULL_BEHAVIOR=prefer-cached`,
    `ECS_WARM_POOLS_CHECK=true`,
    `ECS_CONFIG`,
    ``,
    `# Download and extract Sysbox .deb (statically linked binaries)`,
    `SYSBOX_VERSION="${sysboxVersion}"`,
    `SYSBOX_SHA256="${SYSBOX_SHA256_AMD64}"`,
    `cd /tmp`,
    `curl -fsSL -o sysbox.deb \\`,
    `  "https://github.com/nestybox/sysbox/releases/download/v\${SYSBOX_VERSION}/sysbox-ce_\${SYSBOX_VERSION}.linux_amd64.deb"`,
    `echo "\${SYSBOX_SHA256}  sysbox.deb" | sha256sum -c -`,
    `ar x sysbox.deb`,
    `tar xf data.tar.* -C /`,
    ``,
    `# Fix systemd path — .deb extracts to /lib/systemd/system/ but`,
    `# ECS-optimized AL2023 has no /lib → /usr/lib symlink`,
    `cp /lib/systemd/system/sysbox*.service /etc/systemd/system/ 2>/dev/null || true`,
    ``,
    `# Create sysbox user and mountpoint`,
    `useradd -r -s /bin/false sysbox || true`,
    `mkdir -p /var/lib/sysboxfs`,
    ``,
    `# Sysctl settings required by Sysbox`,
    `cat > /etc/sysctl.d/99-sysbox.conf <<'SYSCTL'`,
    `fs.inotify.max_queued_events=1048576`,
    `fs.inotify.max_user_watches=1048576`,
    `fs.inotify.max_user_instances=1048576`,
    `kernel.keys.maxkeys=20000`,
    `kernel.keys.maxbytes=400000`,
    `SYSCTL`,
    `sysctl --system`,
    ``,
    `# Register sysbox-runc as Docker runtime`,
    `# Docker has NOT started yet — daemon.json is written before first boot`,
    `# but Docker does NOT pick it up (E2E verified) — background restart required`,
    `mkdir -p /etc/docker`,
    `python3 -c "`,
    `import json, os`,
    `p = '/etc/docker/daemon.json'`,
    `d = json.load(open(p)) if os.path.exists(p) else {}`,
    `d.setdefault('runtimes', {})['sysbox-runc'] = {'path': '/usr/bin/sysbox-runc'}`,
    `json.dump(d, open(p, 'w'), indent=2)`,
    `"`,
    ``,
    `# Enable Sysbox services (start deferred to background)`,
    `systemctl daemon-reload`,
    `systemctl enable sysbox-mgr sysbox-fs`,
    `systemctl start sysbox-mgr sysbox-fs --no-block`,
    ``,
    `# Fix ecs-init DNAT crash-loop (xt_DNAT module missing on this AMI)`,
    `# "-" prefix makes pre-start non-fatal; IMDS blocking via ECS_AWSVPC_BLOCK_IMDS`,
    `mkdir -p /etc/systemd/system/ecs.service.d`,
    `cat > /etc/systemd/system/ecs.service.d/override.conf <<'OVERRIDE'`,
    `[Service]`,
    `ExecStartPre=`,
    `ExecStartPre=-/usr/libexec/amazon-ecs-init pre-start`,
    `OVERRIDE`,
    ``,
    `# Mask ECS to prevent auto-start (disable alone doesn't work — spike verified)`,
    `systemctl mask ecs 2>/dev/null || true`,
    ``,
    `# Clean up .deb extraction artifacts`,
    `rm -f /tmp/sysbox.deb /tmp/data.tar.* /tmp/control.tar.* /tmp/debian-binary`,
  ].join("\n");
}

/**
 * Builds the background section of UserData.
 * Runs asynchronously after cloud-init foreground completes.
 * Handles Docker restart, prebuild, and ECS agent start.
 */
function buildBackgroundScript(params: {
  openclawVersion: string;
}): string {
  const { openclawVersion } = params;

  return [
    `# ── Background: Docker restart, prebuild, ECS agent start ──`,
    `# MUST be background to avoid systemd deadlock with cloud-init`,
    `(while ! systemctl is-active --quiet docker; do sleep 2; done`,
    ` systemctl start sysbox-mgr sysbox-fs 2>/dev/null || true`,
    ` sleep 3`,
    ` systemctl restart docker`,
    ` sleep 5`,
    ` docker load -i /var/cache/ecs/ecs-agent.tar 2>/dev/null || true`,
    ``,
    ` # Pre-build OpenClaw image (timeout prevents infinite hang)`,
    ` OPENCLAW_VERSION="${openclawVersion}"`,
    ` cat > /tmp/Dockerfile.openclaw <<DOCKERFILE`,
    `FROM node:22-slim`,
    `RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*`,
    `RUN npm install -g openclaw@\${OPENCLAW_VERSION}`,
    `RUN mkdir -p /root/.openclaw`,
    `DOCKERFILE`,
    ` if ! timeout 300 docker build --network=host -t openclaw-prebuilt:latest \\`,
    `      -f /tmp/Dockerfile.openclaw /tmp 2>&1 | tail -5; then`,
    `   echo "WARN: prebuild failed/timed out, tagging base image as fallback"`,
    `   docker pull node:22-slim 2>/dev/null || true`,
    `   docker tag node:22-slim openclaw-prebuilt:latest`,
    ` fi`,
    ``,
    ` # Unmask and start ECS agent LAST — first registration, image is ready`,
    ` systemctl unmask ecs`,
    ` systemctl daemon-reload`,
    ` systemctl enable ecs`,
    ` systemctl start ecs) &`,
    ``,
    `# Sysbox fallback polling (no-op if services already started)`,
    `(while ! systemctl is-active --quiet docker; do sleep 2; done`,
    ` systemctl start sysbox-mgr sysbox-fs 2>/dev/null || true) &`,
  ].join("\n");
}

/**
 * Builds the complete ECS EC2 UserData script.
 *
 * @returns base64-encoded UserData string ready for CloudFormation LaunchTemplate
 */
export function buildEcsEc2UserData(params: EcsEc2UserDataParams): string {
  const sysboxVersion = params.sysboxVersion ?? DEFAULT_SYSBOX_VERSION;
  const openclawVersion = params.openclawVersion ?? "latest";

  const script = [
    `#!/bin/bash`,
    `set -euo pipefail`,
    ``,
    buildForegroundScript({
      botName: params.botName,
      sysboxVersion,
    }),
    ``,
    buildBackgroundScript({ openclawVersion }),
  ].join("\n");

  return Buffer.from(script).toString("base64");
}
