---
description: "GCP Compute Engine deployment architecture — Caddy-on-VM, spike-validated 2026-02-07"
globs: ["packages/cloud-providers/src/targets/gce/**", "packages/adapters-gcp/**"]
alwaysApply: false
---

# GCP Compute Engine Deployment Architecture (Caddy-on-VM)

Comprehensive reference for the GCE deployment target. Covers architecture, security, cost, reliability, startup script, config transform, deployment flow, and implementation plan. Every finding in this document was **spike-validated on 2026-02-07** on a real GCE VM (e2-medium, Ubuntu 22.04, us-central1-a).

---

## 1. Context

The previous GCP architecture used a shared External Application Load Balancer with private subnets, Cloud NAT, and Cloud Router — 7 shared resources, ~$18+/mo fixed overhead, and significant complexity. A CLI spike test on 2026-02-07 proved this approach flawed:

1. **Cloud Armor WAF cannot inspect WebSocket frames** — OpenClaw's entire attack surface is WebSocket
2. **e2-small (2GB) OOMs** during OpenClaw npm install — e2-medium (4GB) required
3. **gcloud CLI is NOT pre-installed** on GCE Ubuntu images
4. **Sysbox v0.6.7 changed its `.deb` filename** pattern (no `-0` suffix)
5. **OpenClaw has no HTTP `/health` endpoint** — the SPA catch-all returns 200 for all paths

**New architecture**: Caddy reverse proxy on the VM, MIG for auto-healing, ephemeral public IP, no Load Balancer, no Cloud NAT. **~$26/bot/mo**.

---

## 2. Research — Why MIG + Caddy?

### Eliminated Options

| Service | DinD/Sysbox | Why Not |
|---------|-------------|---------|
| Cloud Run | No Docker socket, no custom runtimes | Cannot run sandbox mode |
| GKE Autopilot | No privileged, gVisor DinD unverified | Risky, needs spike |
| GKE Standard | Possible via Sysbox DaemonSet | **$72/mo control plane** — overkill for 1-50 bots |
| External App LB | N/A | **$18+/mo per bot** (forwarding rule + static IP) |
| TCP/UDP NLB | N/A | **$18+/mo**, L4 only (no TLS termination, no path routing) |
| Cloud Armor WAF | N/A | **Requires LB** (adds $18+/mo), cannot inspect WebSocket frames anyway |
| Container-Optimized OS | Read-only FS | Cannot install Sysbox `.deb` |

### AWS/Azure → GCE Mapping

| AWS | Azure | GCE (Caddy-on-VM) | Notes |
|-----|-------|-------------------|-------|
| ALB ($17/mo) | App Gateway ($180/mo) | **Caddy on VM ($0)** | Auto-HTTPS, WebSocket, rate limiting |
| NAT Instance ($7/mo) | Not needed | **Not needed** | VM has public IP for outbound |
| Security Group | NSG | **Firewall rule** | Allow 80/443 only |
| ASG (maxSize=1) | VMSS (maxSize=1) | **MIG (maxSize=1)** | Auto-healing at $0 extra cost |
| EC2 UserData | Cloud-init | **startup-script** | Runs on every boot (idempotency guard needed) |
| Secrets Manager ($0.40/secret) | Key Vault (~$0.03/mo) | **Secret Manager ($0.06/secret)** | REST API — no gcloud CLI needed |
| IAM Role | Managed Identity | **Service Account** | Least-privilege IAM bindings |
| CloudWatch | Azure Monitor | **Cloud Logging** | 50 GB/mo free tier |
| ECS-optimized AMI | Ubuntu 24.04 | **Ubuntu 22.04 LTS** | Sysbox officially supported platform |

---

## 3. Architecture

```
Internet
    |  Firewall: allow TCP 80/443 only
    v
[GCE VM - Ephemeral Public IP - Ubuntu 22.04 - e2-medium]
    |
    +-- Caddy (:80)
    |     |-- reverse_proxy 127.0.0.1:18789
    |     |-- Auto-HTTPS (Let's Encrypt) when custom domain set
    |     |-- WebSocket upgrade (native)
    |
    +-- Docker (-p 127.0.0.1:18789:18789)
    |     |-- OpenClaw container (sysbox-runc runtime)
    |     |     |-- gateway binds 0.0.0.0:18789 INSIDE container
    |     |     |-- Docker socket mount (/var/run/docker.sock)
    |     |     |-- Config from /opt/openclaw-data/.openclaw/
    |     |     |-- --restart=always (Docker auto-restart)
    |     |
    |     +-- Sandbox containers (sysbox-runc, network:none)
    |
    +-- Sysbox v0.6.7 (installed via dpkg -i)
    |
    +-- /opt/openclaw-data/ (persistent config directory)
```

### Critical: Docker Port Binding

OpenClaw runs INSIDE a Docker container. The port mapping must be:
- **Docker**: `-p 127.0.0.1:18789:18789` — binds to **host localhost only**
- **OpenClaw config**: `gateway.bind = "lan"` (0.0.0.0 **inside** the container, so Docker can reach it)
- **Caddy**: `reverse_proxy 127.0.0.1:18789` — connects to Docker-mapped port on host
- **Firewall**: blocks port 18789 from internet (defense in depth — even if firewall is misconfigured, port 18789 is only on localhost)

This is **more secure** than the External LB approach where the LB connects to a network-reachable port.

### Critical: Docker DNS on GCE

GCE VMs use `169.254.169.254` (metadata server) as the default DNS resolver for Docker containers. If metadata access is blocked or unavailable inside the container, **container DNS breaks entirely** — `npm install`, `apt-get update`, and all external network calls fail silently.

**Fix**: Configure Docker daemon DNS before starting any containers:

```json
// /etc/docker/daemon.json (MUST include BEFORE Sysbox adds its runtime entry)
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
```

After Sysbox installation, the file will look like:
```json
{
  "dns": ["8.8.8.8", "8.8.4.4"],
  "runtimes": {
    "sysbox-runc": {
      "path": "/usr/bin/sysbox-runc"
    }
  }
}
```

### Critical: Secret Manager Without gcloud

GCE Ubuntu images (22.04, 24.04) do **NOT** include the `gcloud` CLI. Installing it adds 500MB+ and 60+ seconds to startup. Instead, use the metadata server token + Secret Manager REST API:

```bash
# Get access token from metadata server (available on all GCE VMs)
TOKEN=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
  | jq -r '.access_token')

# Fetch secret value via REST API
SECRET_VALUE=$(curl -sf \
  -H "Authorization: Bearer $TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${SECRET_NAME}/versions/latest:access" \
  | jq -r '.payload.data' | base64 -d)
```

This pattern is zero-dependency (only `curl` + `jq`, both installed in step 1) and works immediately.

---

## 4. Infrastructure

### Shared (per region, ~$0/mo)

| Resource | Purpose | Cost |
|----------|---------|------|
| VPC `clawster-vpc` | Network isolation | Free |
| Subnet `10.0.0.0/24` | Bot VMs | Free |
| Firewall `clawster-allow-http` | Inbound TCP 80/443 only | Free |
| Firewall `clawster-allow-iap-ssh` | SSH via IAP (debugging only) | Free |
| Service Account `clawster-bot` | Secret Manager read, Cloud Logging write | Free |
| IAM binding | `roles/secretmanager.secretAccessor` + `roles/logging.logWriter` | Free |

**All shared resources are free.** No Cloud NAT, no Cloud Router, no Load Balancer.

### Per-Bot (~$26/mo)

| Resource | Purpose | Cost |
|----------|---------|------|
| MIG + Instance Template | e2-medium (2 vCPU, 4GB RAM) with auto-healing | **$24.46/mo** |
| Boot disk (30 GB pd-balanced) | OS + Docker + Sysbox + Caddy + OpenClaw image | **$2.04/mo** |
| Ephemeral public IP | Inbound + outbound internet | **Free** |
| Secret Manager secret | OpenClaw config JSON | **~$0.06/mo** |
| **Total** | | **~$26.56/mo** |

---

## 5. Cost Breakdown

### Why e2-medium (4GB) is Mandatory

The spike test proved that **2GB VMs (e2-small) cannot run OpenClaw**:

1. **Pre-build phase**: `npm install -g openclaw@latest` inside Docker downloads 1.9GB+ of dependencies. On 2GB RAM, this OOMs and kills the Docker build process.
2. **Runtime phase**: OpenClaw gateway + Node.js + Docker daemon uses ~1.5GB steady-state.
3. **Sandbox phase**: Each sandbox container adds ~200MB. On 2GB, a single sandbox triggers OOM.

There is **no light tier**. The minimum viable VM is e2-medium (4GB).

### Tier Specs

| Tier | VM Size | vCPU | RAM | Cost/mo | Notes |
|------|---------|------|-----|---------|-------|
| ~~Light~~ | ~~e2-small~~ | ~~2~~ | ~~2 GB~~ | - | **Eliminated** — OOMs during npm install |
| **Standard** | **e2-medium** | **2** | **4 GB** | **$26/mo** | Minimum viable. Handles 1-3 concurrent sandboxes. |
| Performance | e2-standard-2 | 2 | 8 GB | ~$49/mo | Heavy sandbox usage, 5+ concurrent sandboxes |

### Multi-Cloud Comparison

| Bots | GCE (Caddy) | AWS (ECS EC2) | Azure (VMSS) | GCE Savings vs AWS |
|------|-------------|---------------|--------------|-------------------|
| 1 | **$27** | $49 | $37 | **45%** |
| 5 | **$133** | $217 | $183 | **39%** |
| 10 | **$266** | $427 | $367 | **38%** |

### Why GCE is Cheapest

| Cost Component | GCE | AWS | Azure |
|----------------|-----|-----|-------|
| Load Balancer | **$0** (Caddy) | $24/bot (ALB + IPv4) | $0 (Caddy) |
| NAT/outbound | **$0** (ephemeral IP) | $7/mo (NAT Instance) | $0 (public IP) |
| Public IP | **Free** (ephemeral) | N/A (behind ALB) | $3.65/mo (static) |
| VM | $24.46/mo (e2-medium) | $15/mo (t3.small) | $30.37/mo (B2s) |
| Disk | $2.04/mo (30GB) | $2.40/mo (30GB) | $2.40/mo (30GB) |
| Secrets | $0.06/mo | $0.40/mo | ~$0.03/mo |

GCE's VM is more expensive than AWS, but the **zero LB + zero NAT** savings more than compensate.

---

## 6. Security Model

### Defense in Depth (8 Layers)

| # | Layer | Control | Details |
|---|-------|---------|---------|
| 1 | Network | GCE Firewall | Only TCP 80/443 inbound; all other ports denied including 18789 |
| 2 | Port binding | Docker localhost | `-p 127.0.0.1:18789:18789` — gateway port NEVER on a public interface |
| 3 | Transport | Caddy TLS | Auto-HTTPS via Let's Encrypt when domain configured |
| 4 | Application | Caddy proxy | Rate limiting, connection limits, header filtering |
| 5 | Auth | Gateway token | OpenClaw `auth.mode: "token"` — rejects unauthenticated WebSocket |
| 6 | Container | Sysbox | Sandbox containers in unprivileged user namespace (UID 100000+) |
| 7 | Access | No SSH | No SSH port open by default; IAP tunnel for emergency debugging |
| 8 | Identity | Service Account | Least-privilege — only Secret Manager read + Cloud Logging write |

### Honest Comparison: What You Lose vs External LB

| Capability | External LB | Caddy on VM | Risk Level |
|------------|-------------|-------------|------------|
| Managed WAF (Cloud Armor) | Yes (OWASP rules) | No — Caddy rate limiting only | **Medium** — BUT Cloud Armor **cannot inspect WebSocket frames** anyway. OpenClaw's auth token is the primary defense. |
| L7 DDoS protection | Yes (integrated) | GCP DDoS Basic only (free) | **Low** — DDoS Basic handles volumetric attacks; Caddy handles slowloris |
| Separate network boundary | Yes (VM in private subnet) | No — VM has public IP with firewall | **Low** — port 18789 bound to localhost, firewall blocks all non-80/443 |
| Managed SSL certificates | Google-managed certs | Caddy auto-cert (Let's Encrypt) | **None** — Caddy auto-cert is simpler and equally secure |
| Anycast global routing | Yes (anycast IP) | No — single-region ephemeral IP | **None** — single-bot-per-VM doesn't benefit from anycast |

**Bottom line**: Cloud Armor WAF is the only theoretical advantage of the External LB, but it **cannot inspect WebSocket frames** — OpenClaw's entire protocol. The 8-layer defense above is more effective for this workload.

### Known Limitations

| Limitation | Risk | Mitigation |
|-----------|------|------------|
| Docker socket mount | Container escape → host Docker access | Sysbox isolates sandbox containers. Firewall blocks all non-80/443. |
| Root in container | OpenClaw runs as root (needs Docker socket) | Sysbox UID mapping. Gateway auth token required for non-loopback bind. |
| Ephemeral IP changes | IP changes on VM replacement (MIG auto-repair) | Phase 2: static regional IP ($3.65/mo). Webhook re-registration handled by Clawster. |
| No VPC Flow Logs | No network traffic audit trail | Phase 2: enable VPC Flow Logs ($0.50/GB) |

---

## 7. Reliability Model

### MIG Auto-Healing (zero extra cost)

Using MIG instead of standalone VM provides auto-healing at the same price:

| Failure | Recovery | Mechanism |
|---------|----------|-----------|
| OpenClaw container crash | ~5s | Docker `--restart=always` policy |
| Application hang | ~3 min | MIG health check fails → auto-repair replaces instance |
| GCE host failure | ~5 min | GCE auto-restart (built-in for all VMs) |
| OS corruption | ~3 min | MIG auto-repair recreates instance, startup script re-runs |
| Config corruption | ~3 min | MIG auto-repair + Secret Manager has config backup |

**MIG Configuration**:
- `maxSize: 1`, `minSize: 0` (scale to zero when stopped)
- Health check: HTTP GET on `:80/health` (through Caddy → OpenClaw)
- Health check grace period: **600s** (startup script needs ~3 min for Docker + Sysbox + pre-build + Caddy)
- Automatic repairs: enabled
- Single zone (matching VM zone)

### Health Check: SPA Catch-All (Not True Health)

OpenClaw has **no dedicated HTTP `/health` endpoint**. Health checking is WebSocket RPC only.

However, the Control UI is a **catch-all SPA** that serves HTML (200) for ALL paths, including `/health`. This means:
- HTTP GET `/health` → **200** (SPA HTML, not actual health data)
- This works as a **liveness check** — if the gateway process is running, the SPA responds
- If the gateway crashes, port 18789 closes, Caddy returns 502, health check fails

**This is the same pattern AWS ALB uses** — the ALB health check hits `/health` and gets 200 from the SPA. It's not a true health check, but it's effective for liveness detection.

### Data Persistence

**Phase 1**: Secret Manager stores the OpenClaw config JSON. On MIG auto-repair, the new instance fetches config from Secret Manager. WhatsApp credentials and session data are **lost on replacement** — user must re-pair.

**Phase 2**: Persistent disk attached to the VM for `/opt/openclaw-data`. Survives MIG auto-repair. WhatsApp credentials and session data preserved.

**Why not Azure Files equivalent?** GCE doesn't have a direct equivalent of Azure Files (SMB mount). Options for Phase 2:
- Persistent disk (zonal, not shared) — simplest
- Cloud Storage FUSE (eventually consistent, not ideal for SQLite) — avoid
- Filestore NFS ($170/mo minimum) — way too expensive

---

## 8. Startup Script

### Platform Comparison

| Issue | AL2023 (AWS) | Ubuntu 24.04 (Azure) | Ubuntu 22.04 (GCE) |
|-------|-------------|---------------------|---------------------|
| Kernel modules | Stripped — `yum reinstall kernel` + symlink hack | Present — just works | Present — just works |
| Sysbox `.deb` install | Manual `ar x` extraction (no `dpkg`) | `dpkg -i` — just works | `dpkg -i` — just works |
| Docker `daemon.json` | Not read on first boot — restart dance | Read normally | Read normally |
| Package manager | `yum` — slower, fewer packages | `apt` — faster, `.deb` native | `apt` — faster, `.deb` native |
| Startup script | UserData — runs once | Cloud-init — runs once | **startup-script — runs EVERY boot** |
| Docker DNS | N/A | N/A | **Must fix** — 169.254.169.254 breaks container DNS |
| gcloud CLI | N/A (uses AWS CLI) | N/A (uses `az` CLI) | **NOT installed** — use metadata token + REST API |

### Script Steps (14 steps, proven order from spike test)

**GCE startup scripts run on EVERY boot** (unlike AWS UserData). An idempotency guard is mandatory.

```
Step 1:  apt install docker.io jq curl
Step 2:  Docker DNS fix (write daemon.json with 8.8.8.8 BEFORE Docker starts)
Step 3:  systemctl enable --now docker
Step 4:  Download Sysbox v0.6.7 .deb from GitHub (SHA256 verify)
         GOTCHA: Filename is sysbox-ce_0.6.7.linux_amd64.deb (no -0)
         Previous versions used sysbox-ce_0.6.6-0.linux_amd64.deb (with -0)
         MUST check GitHub API for actual filename — don't hardcode pattern
Step 5:  dpkg -i sysbox.deb && apt-get install -f (resolve dependencies)
Step 6:  Merge sysbox-runc into daemon.json (PRESERVE existing DNS config)
Step 7:  systemctl restart docker
Step 8:  Install Caddy via Cloudsmith apt repo (apt install caddy)
Step 9:  Write Caddyfile: :80 { reverse_proxy 127.0.0.1:18789 }
Step 10: systemctl enable --now caddy
Step 11: Fetch config from Secret Manager (metadata token + REST API)
         Uses: curl → metadata server → access token → Secret Manager API → base64 decode
Step 12: Write config to /opt/openclaw-data/.openclaw/openclaw.json
         CRITICAL: NOT /tmp — gets wiped on reboot. Use persistent path.
         Add trustedProxies: ["172.20.0.0/16"] for Docker bridge network
Step 13: Pre-build OpenClaw Docker image:
         FROM node:22 (FULL image, NOT slim — needs git for npm dependencies)
         RUN npm install -g openclaw@${VERSION}
         MANDATORY: npx downloads 1.9GB + npm install — OOMs on 2GB VMs
Step 14: docker run with:
         --runtime=sysbox-runc
         -p 127.0.0.1:18789:18789 (localhost binding)
         -v /opt/openclaw-data/.openclaw:/home/node/.openclaw (config mount)
         -e OPENCLAW_GATEWAY_TOKEN="$TOKEN"
         openclaw gateway --port 18789 --verbose --allow-unconfigured
```

### Idempotency Guard

```bash
#!/bin/bash
set -euo pipefail

# GCE startup scripts run on EVERY boot. Skip if already installed.
if [ -f /usr/bin/sysbox-runc ] && systemctl is-active --quiet docker && \
   systemctl is-active --quiet caddy && docker ps --filter name=openclaw-gateway -q | grep -q .; then
  echo "OpenClaw already running — skipping startup script"
  exit 0
fi
```

### Resilience

- Each `apt install` retries 3 times with `--retry 3`
- Docker image build has `timeout 300` — if pre-build fails, falls back to `node:22` base image with runtime `npx`
- Secret Manager fetch retries 5 times with exponential backoff (metadata server can take ~10s to be ready)
- Sysbox install failure is non-fatal — OpenClaw runs without sandbox mode (degraded)
- Config stored at `/opt/openclaw-data/` — survives reboots (NOT `/tmp`)

---

## 9. OpenClaw Config Transform

### Valid Config (spike-validated)

```json
{
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "port": 18789,
    "auth": { "mode": "token", "token": "<generated-per-bot>" },
    "trustedProxies": ["172.20.0.0/16"]
  }
}
```

### TypeScript Transform

```typescript
// gce-target.ts getTransformOptions()
customTransforms: [
  (config) => ({
    ...config,
    gateway: {
      ...(config.gateway as Record<string, unknown>),
      mode: "local",           // Required for headless/cloud deployment
      bind: "lan",             // 0.0.0.0 INSIDE container (Docker maps to host localhost)
      trustedProxies: ["172.20.0.0/16"], // Docker bridge network
    },
  }),
],
```

### Config Gotchas (All Spike-Validated)

| Gotcha | Detail |
|--------|--------|
| `bind: "lan"` = 0.0.0.0 | Inside the container. Docker `-p 127.0.0.1:18789:18789` restricts to host localhost. |
| Non-loopback bind requires token | OpenClaw enforces auth for `lan`/`custom`/`auto` bind modes. Container won't start without a token. |
| `--allow-unconfigured` | Only bypasses `gateway.mode` check. Does NOT bypass auth requirement. Still need token for non-loopback. |
| Invalid keys rejected by Zod | `gateway.enabled`, top-level `ai` key — OpenClaw rejects with strict Zod validation. Only `gateway.mode/bind/port/auth/trustedProxies` are valid. |
| `trustedProxies` for Docker bridge | Caddy sends `X-Forwarded-For` headers. Without trustedProxies, OpenClaw logs: "Proxy headers detected from untrusted address". Add Docker bridge CIDR. |
| `node:22` not `node:22-slim` | Slim image lacks `git`, which OpenClaw's npm dependencies require. Pre-build fails silently with missing git. |
| Config path is `~/.openclaw/openclaw.json` | Inside the container, `~` = `/home/node`. Mount: `-v /opt/openclaw-data/.openclaw:/home/node/.openclaw`. |

---

## 10. Deployment Flow

### First Bot (~3 min)

```
0:00  install()
      +-- Ensure shared infra (VPC, Subnet, Firewall, SA) — ~10s (all free, fast)
      +-- Store config in Secret Manager — ~2s
      +-- Create Instance Template with startup script — ~5s
      +-- Create MIG (targetSize=0) — ~10s
~0:30 start()
      +-- Scale MIG to 1 — ~5s
      +-- VM provisioning — ~30s
~1:00 Startup script begins
      +-- apt install docker.io jq curl — ~20s
      +-- Docker DNS fix + enable — ~5s
      +-- Sysbox dpkg -i — ~15s
      +-- Docker restart — ~5s
      +-- apt install caddy — ~10s
      +-- Write Caddyfile + enable Caddy — ~2s
      +-- Fetch config from Secret Manager (REST API) — ~5s
      +-- Pre-build OpenClaw image (npm install -g) — ~40s
      +-- Start OpenClaw container — ~20s (startup with pre-built: ~20s)
~3:00 Health check passes (HTTP GET /health → 200 via SPA) → BOT RUNNING
```

### Subsequent Bot (~2.5 min)
Shared infra exists. Skip VPC/Subnet/Firewall/SA creation. Only per-bot resources.

### Bot Restart (~30s)
VM reboot → Docker auto-restarts OpenClaw (`--restart=always`) → Caddy already running via systemd → Health check passes.

### Auto-Repair (~3 min)
MIG detects unhealthy → deletes instance → creates new instance → startup script re-runs → Secret Manager has config → Bot running again.

### Critical: IP Change on Replacement

Ephemeral public IPs change when MIG replaces an instance. This means:
- WebSocket connections drop (expected — clients reconnect)
- Webhook URLs change (Clawster must update webhook registrations)
- DNS records become stale (if custom domain pointed to old IP)

**Phase 2 fix**: Static regional IP ($3.65/mo) assigned to the MIG instance template. IP survives replacement.

---

## 11. Implementation Steps

### Step 1: Rewrite startup-script-builder.ts

**File**: `packages/cloud-providers/src/base/startup-script-builder.ts`

The current builder uses:
- Sysbox install script (404 — broken)
- `npx openclaw@latest` (OOMs on 2GB)
- `node:22-slim` (missing git)
- No Docker DNS fix
- No Caddy
- No Secret Manager REST API
- Port binding on `0.0.0.0` (insecure)

Replace with new cloud-agnostic section builders (matching Azure Caddy pattern):
- `buildDockerDnsSection()` — GCE-specific DNS fix
- `buildSysboxDebSection()` — `.deb` download + SHA256 verify + dpkg install
- `buildCaddySection()` — Caddy install via Cloudsmith apt + Caddyfile
- `buildSecretFetchSection()` — GCE metadata token + Secret Manager REST API
- `buildOpenClawPreBuildSection()` — `FROM node:22` (full) + `npm install -g openclaw@${VERSION}`
- `buildOpenClawContainerSection()` — Docker run with localhost binding + sysbox-runc

### Step 2: Delete Load Balancer Manager

**Delete** (2 files):
- `managers/gce-loadbalancer-manager.ts`
- `managers/interfaces/gce-loadbalancer-manager.interface.ts`

The Caddy-on-VM architecture has no GCE load balancer. All traffic flows through Caddy on the VM.

### Step 3: Replace Standalone VM with MIG + Instance Template

**File**: `managers/gce-compute-manager.ts` + interface

Replace standalone VM methods with MIG methods:
- `createInstanceTemplate(name, config)` — Instance template with startup script
- `createMig(name, templateUrl, targetSize, healthCheck)` — MIG with auto-healing
- `scaleMig(name, targetSize)` — Scale to 0 (stop) or 1 (start)
- `getMigStatus(name)` — Current instance count and health
- `getMigInstanceIp(name)` — Get ephemeral IP of the running instance
- `deleteMig(name)` / `deleteInstanceTemplate(name)` — Cleanup

Remove standalone VM methods:
- `createVmInstance()` → replaced by `createInstanceTemplate()` + `createMig()`
- `ensureDataDisk()` → removed (no separate data disk in Caddy-on-VM)
- `ensureInstanceGroup()` → replaced by MIG (managed, not unmanaged)

### Step 4: Update GceTarget Lifecycle

**File**: `gce-target.ts`

| Method | Current (LB) | New (Caddy-on-VM) |
|--------|-------------|-------------------|
| `install()` | VPC → Subnet → Firewall → IP → Disk → VM → IG → Cloud Armor → Backend → URL Map → Proxy → Forwarding Rule (13 steps) | VPC → Subnet → Firewall → SA → Secret → Instance Template → MIG (7 steps) |
| `configure()` | Update metadata + Secret Manager | Update Secret Manager only (MIG restart applies config) |
| `start()` | Start VM instance | Scale MIG to 1 |
| `stop()` | Stop VM instance | Scale MIG to 0 |
| `getEndpoint()` | Return LB static IP | Return MIG instance ephemeral IP |
| `destroy()` | Delete LB chain → IG → VM → Disk → IP → Firewall → Secret (11 steps) | Delete MIG → Template → Secret → (shared infra if last bot) (4 steps) |

### Step 5: Update GceConfig

**File**: `gce-config.ts`

Remove:
- `sslCertificateId` — Caddy handles TLS
- `customDomain` — move to Caddyfile generation
- `allowedCidr` — no Cloud Armor (firewall only)
- `dataDiskSizeGb` — no separate data disk
- `externalIpName` — ephemeral IP, no reserved IP
- `image` — always pre-built `openclaw-prebuilt:latest`

Change defaults:
- `machineType`: `"e2-small"` → `"e2-medium"` (4GB mandatory)
- `bootDiskSizeGb`: `20` → `30` (Docker images + pre-built OpenClaw)

Add:
- `caddyDomain?: string` — optional domain for auto-HTTPS
- `sysboxVersion?: string` — default `"0.6.7"` (with filename gotcha note)

### Step 6: Update Tier Specs

```typescript
const GCE_TIER_SPECS: Record<"standard" | "performance", TierSpec> = {
  standard: {
    tier: "standard",
    cpu: 2048,
    memory: 4096,     // 4GB mandatory (was 2048)
    dataDiskSizeGb: 0, // No separate data disk
    machineType: "e2-medium", // Was e2-small
  },
  performance: {
    tier: "performance",
    cpu: 2048,
    memory: 8192,
    dataDiskSizeGb: 0,
    machineType: "e2-standard-2",
  },
};
```

No `light` tier — 2GB VMs OOM during npm install.

### Step 7: Update Provisioning Steps Metadata

```typescript
provisioningSteps: [
  { id: "validate_config", name: "Validate configuration" },
  { id: "ensure_shared_infra", name: "Ensure shared infrastructure" },
  { id: "create_secret", name: "Store config in Secret Manager" },
  { id: "create_template", name: "Create instance template" },
  { id: "create_mig", name: "Create managed instance group" },
  { id: "scale_mig", name: "Scale to 1 instance", estimatedDurationSec: 30 },
  { id: "wait_startup", name: "Wait for startup script", estimatedDurationSec: 120 },
  { id: "wait_caddy", name: "Wait for Caddy proxy" },
  { id: "health_check", name: "Health check", estimatedDurationSec: 30 },
],
```

7 steps instead of 15. No LB steps.

### Step 8: Tests

**Unit tests**:
- Startup script generation: Docker DNS fix, Sysbox .deb download, Caddy install, Secret Manager REST API, pre-build, localhost binding
- MIG lifecycle: create template → create MIG → scale → get IP → delete
- Config transform: `bind: "lan"`, `trustedProxies`, token injection
- Tier specs: no light tier, standard = e2-medium

**Integration test** (matching Azure pattern):
```
guard (check GCE credentials) →
install() →
configure() →
start() →
getStatus() → assert running →
getEndpoint() → assert valid IP →
HTTP GET /health → assert 200 →
WebSocket upgrade → assert 101 →
stop() →
getStatus() → assert stopped →
destroy() →
getStatus() → assert not-installed
```

---

## 12. Files to Modify

| File | Change |
|------|--------|
| `packages/cloud-providers/src/base/startup-script-builder.ts` | New cloud-agnostic sections: DNS fix, Sysbox .deb, Caddy, Secret Manager REST, pre-build, localhost Docker binding |
| `packages/cloud-providers/src/targets/gce/gce-target.ts` | MIG instead of standalone VM, remove LB chain, update lifecycle methods, update tier specs, update metadata |
| `packages/cloud-providers/src/targets/gce/gce-config.ts` | Remove LB fields, change defaults to e2-medium/30GB, add caddyDomain |
| `packages/cloud-providers/src/targets/gce/gce-manager-factory.ts` | Remove LB manager creation |
| `packages/cloud-providers/src/targets/gce/managers/gce-compute-manager.ts` | MIG methods: createTemplate, createMig, scaleMig, getMigStatus, getMigInstanceIp |
| `packages/cloud-providers/src/targets/gce/managers/gce-network-manager.ts` | Remove external IP reservation (ephemeral only) |
| `packages/cloud-providers/src/targets/gce/managers/interfaces/*.ts` | Update interfaces for MIG, remove LB interface |
| `packages/cloud-providers/src/targets/gce/managers/gce-loadbalancer-manager.ts` | **DELETE** |
| `packages/cloud-providers/src/targets/gce/managers/interfaces/gce-loadbalancer-manager.interface.ts` | **DELETE** |
| `packages/cloud-providers/src/targets/gce/managers/index.ts` | Remove LB exports |
| `packages/cloud-providers/src/targets/gce/types.ts` | Remove LB types, add MIG types |
| `packages/cloud-providers/src/targets/gce/gce-target.test.ts` | Rewrite for Caddy-on-VM architecture |
| `apps/api/src/reconciler/services/deployment-target-resolver.service.ts` | Verify GCE config mapping works without LB fields |

**2 files deleted** (LB manager + interface). **11 files modified**.

---

## 13. Verification

After implementation, run this 8-step checklist:

1. **Build**: `pnpm --filter @clawster/cloud-providers build` — must succeed
2. **Tests**: `pnpm --filter @clawster/cloud-providers test` — all pass
3. **Full build**: `pnpm build` — entire monorepo succeeds
4. **Deploy test bot**: Create a bot via the API, verify:
   - MIG creates and scales to 1
   - Startup script completes (check serial console output)
   - Caddy responds on port 80 (HTTP 200)
   - OpenClaw responds through Caddy (WebSocket 101 upgrade)
   - `/health` returns 200 (SPA catch-all — this is expected, not a bug)
5. **Auto-restart**: Kill OpenClaw container (`docker rm -f openclaw-gateway`), verify Docker restarts it within 5s
6. **MIG auto-repair**: Corrupt the health endpoint (stop Caddy), verify MIG replaces the instance within grace period
7. **Firewall**: Verify direct access to port 18789 is blocked from internet (`curl http://<IP>:18789` should timeout)
8. **DNS fix**: Verify container can resolve external hostnames (`docker exec openclaw-gateway nslookup google.com`)

---

## 14. Future Improvements

| Improvement | Benefit | Phase |
|-------------|---------|-------|
| Custom VM image (Packer) | Pre-bake Docker + Sysbox + Caddy → startup drops from ~90s to ~10s | Phase 2 |
| Persistent disk | WhatsApp credentials survive MIG replacement | Phase 2 |
| Static regional IP | IP doesn't change on MIG replacement ($3.65/mo) | Phase 2 |
| GKE (10+ bots) | Sysbox daemonset + shared node pool → better density | Phase 3 |
| Spot VMs | Up to 60% savings for fault-tolerant bots | Phase 3 |
| Committed use discounts | 1-year: 37% off compute, 3-year: 55% off | Phase 3 |
| Custom machine type | Right-size to 3GB RAM if runtime proves stable | Phase 2 |
| VPC Flow Logs | Network traffic audit trail ($0.50/GB) | Phase 2 |

---

## Appendix: Spike Test Results (2026-02-07)

**VM**: e2-medium (4GB), Ubuntu 22.04 LTS, us-central1-a
**Kernel**: 6.8.0-1045-gcp (Sysbox needs 5.12+)

| Test | Internal | External |
|------|----------|----------|
| HTTP root (Control UI) | 200 | 200 |
| HTTP /health (SPA catch-all) | 200 | 200 |
| WebSocket upgrade (101) | PASS | PASS |
| Auth (canvas endpoint) | 401 | - |
| Sysbox runtime | confirmed | - |
| Localhost-only Docker binding | confirmed | - |

**Total setup time**: ~3 min with pre-built image, ~5+ min with npx (OOMs on 2GB).
**Startup with pre-built image**: ~20s.

All critical findings from this spike are embedded in the relevant sections above (not in a separate gotchas list).
