---
description: "GCP Compute Engine deployment architecture — speed, security, cost, reliability, and UX decisions"
globs: ["packages/cloud-providers/src/targets/gce/**", "packages/adapters-gcp/**"]
alwaysApply: false
---

# GCP Compute Engine Deployment Architecture

Reference document for the GCE deployment target. Covers architecture, security, deployment speed, cost model, reliability, UX, and implementation plan. Based on research from the AWS ECS EC2 target (`.claude/docs/aws-deployment-architecture.md`) and GCP-specific investigation.

---

## 1. Architecture Overview

### Why GCE (Not GKE, Not Cloud Run)

| Option | Docker-in-Docker / Sysbox | Verdict |
|--------|--------------------------|---------|
| **GCE + MIG** | **YES** — Ubuntu 22.04, native `apt-get install ./sysbox.deb` | **SELECTED** |
| GKE Standard | Possible via DaemonSet but replaces containerd with CRI-O — very complex | Overkill for 1-50 bots |
| GKE Autopilot | No Sysbox. gVisor DinD possible but unverified with OpenClaw | Risky, needs spike |
| Cloud Run | **NO** — no Docker socket, no custom runtimes | Dead end |
| Container-Optimized OS | **NO** — read-only filesystem, can't install Sysbox | Dead end |

### Stacks

- **Shared infra** (per region): VPC, subnet, Cloud NAT, Cloud Router, firewall rules, service accounts
- **Per-bot** (per bot): VM instance template, MIG (size 0/1), backend service, health check, URL map rules on shared LB

### Key Simplification vs AWS

GCE Ubuntu 22.04 is an **officially supported Sysbox platform**. The Sysbox `.deb` installer handles everything: binaries, systemd units, daemon.json, Docker restart. This eliminates 6 of the 9 AWS workarounds:

| AWS Workaround | Needed on GCE? | Why |
|----------------|----------------|-----|
| `yum reinstall -y kernel` (restore stripped .ko files) | **NO** | Ubuntu ships with full kernel modules |
| `ln -sf /usr/lib/modules /lib/modules` (symlink fix) | **NO** | Ubuntu uses standard FHS paths |
| Copy systemd units to `/etc/systemd/system/` | **NO** | Ubuntu scans `/lib/systemd/system/` natively |
| Docker restart + daemon.json timing hack | **NO** | Sysbox installer restarts Docker automatically |
| ECS agent image reload after Docker restart | **N/A** | No ECS agent |
| ecs-init DNAT crash-loop override | **N/A** | No ECS agent |
| `systemctl mask ecs` to control registration timing | **N/A** | No ECS agent |
| HealthCheckGracePeriodSeconds | **Partially** | Handled via health check initial delay |
| SHA256 checksum verification | **YES** | Same supply chain risk |

**Net result**: ~100-line UserData script with 6 critical workarounds on AWS → ~40-line startup script with 0 workarounds on GCE.

---

## 2. Target Architecture

### Network Diagram

```
                    Internet
                       |
              +--------v--------+
              |  External App   |
              |  Load Balancer  |  ← WebSocket native, ~$18/mo (shared across bots)
              |  (Global L7)    |
              +--------+--------+
                       |
              +--------v--------+
              |  VPC Network    |  ← Custom mode, global
              |  (clawster-vpc) |
              |                 |
              |  Subnet         |  ← Regional, Private Google Access ON (free GCP API access)
              |  (10.0.0.0/20)  |  ← No external IPs on VMs
              |                 |
              |  +------------+ |
              |  | GCE VM     | |  ← e2-small, Ubuntu 22.04, Sysbox
              |  | (MIG)      | |  ← Managed by Instance Group
              |  | +- OpenClaw| |
              |  +------------+ |
              |                 |
              |  Cloud NAT ─────|──→ Internet (outbound only)
              |  (managed)      |     ~$5/mo, multi-AZ, no single point of failure
              |  Cloud Router   |
              +-----------------+
```

### Infrastructure Approach: Direct SDK (Phase 1) → Pulumi (Phase 2+)

**Phase 1: `@google-cloud/compute` + `@google-cloud/secret-manager` + `@google-cloud/logging`**

GCP's resource model doesn't require cross-stack references (unlike AWS CloudFormation's `Fn::ImportValue`). Resources reference each other by name/ID directly. The SDK approach:
- Matches the existing Clawster pattern of programmatic resource lifecycle
- Is the fastest development path (no IaC layer overhead)
- Provides full control over creation order, error handling, and progress reporting
- All needed packages exist and are stable

**Why NOT Google Cloud Deployment Manager**: **Deprecated**, end of support March 31, 2026. Dead end.

**Why NOT Terraform directly**: Requires HCL templates, separate execution, and Terraform binary. Infrastructure Manager (Google's Terraform wrapper) adds Cloud Build latency. Overkill for Phase 1 where we need programmatic stack creation from Node.js.

**Phase 2+ consideration**: Pulumi Automation API (`@pulumi/gcp`) for TypeScript-native IaC with state management, drift detection, and rollback. Matches the Clawster TypeScript codebase natively.

### Deploy Flow (First Bot in Region)

```
0:00  User clicks "Deploy"
      │
      ├── SDK: Create shared infra (first bot in region only)
      │   ├── VPC + Subnet + Firewall rules              ~10-15s
      │   ├── Cloud Router + Cloud NAT                    ~30-45s
      │   ├── Service accounts + IAM bindings             ~5-10s
      │   ├── Reserve static IP for LB                    ~5s
      │   ├── Health check + Backend service              ~10s
      │   ├── URL map + HTTPS proxy + Forwarding rule     ~15-20s
      │   └── Shared infra complete: ~60-90s
      │
~1:30 SDK: Create per-bot resources
      │   ├── Secret Manager secret (OpenClaw config)     ~5s
      │   ├── Instance Template (startup script embedded) ~5s
      │   ├── Managed Instance Group (target size 0)      ~10s
      │   ├── Add backend to LB URL map                   ~5s
      │   └── Per-bot complete: ~25-30s
      │
~2:00 SDK: Set MIG target size to 1
      │   ├── GCE VM provisioning                         ~25-35s
      │   ├── OS boot + startup script:
      │   │   ├── Docker install (apt-get)                ~30-40s
      │   │   ├── Sysbox install (apt-get ./sysbox.deb)   ~10-15s
      │   │   ├── OpenClaw image prebuild (background)    ~60-120s
      │   │   ├── Start OpenClaw container                ~10-30s
      │   │   └── Total startup script: ~90-150s
      │   ├── Health check passes                         ~10-30s
      │   └── Total VM ready: ~2-3 min
      │
~4:00-5:00  BOT RUNNING
```

### Deploy Flow (Subsequent Bot, Shared Infra Exists)

```
0:00  User clicks "Deploy"
      │
      ├── Shared infra check: VPC exists, LB exists       ~2s
      │
0:00  SDK: Create per-bot resources                       ~25-30s
      │
~0:30 SDK: Set MIG target size to 1                       ~2-3 min
      │
~3:00-3:30  BOT RUNNING
```

### Deploy Time Summary

| Scenario | GCE (Phase 1) | GCE (Phase 2, custom image) | AWS (Phase 1) |
|----------|---------------|---------------------------|----------------|
| First bot, new region | **~4-5 min** | **~2.5-3 min** | ~6 min |
| Subsequent bot | **~3-3.5 min** | **~1.5-2 min** | ~3.5 min |

**GCE is ~1-2 min faster than AWS** because:
1. No CloudFormation stack creation (SDK calls are instant vs CF's 3-4 min)
2. Sysbox install is native (no workarounds → ~15s vs ~35s foreground + background)
3. Cloud NAT is managed (no NAT Instance boot time)

---

## 3. Security

### OpenClaw Threat Landscape (same as AWS)

- 5 HIGH/CRITICAL CVEs in Jan-Feb 2026
- 42,665+ exposed instances, 93.4% with auth bypass
- Private subnet isolation is **non-negotiable**

### Security Controls

| Control | Implementation | AWS Equivalent |
|---------|---------------|----------------|
| Private subnet | VM has no external IP, Private Google Access enabled | Private subnet + NAT |
| Cloud NAT (outbound only) | Managed NAT, no inbound route to bots | NAT Instance |
| LB as sole entry point | External App LB with firewall rules | ALB |
| VM firewall | Ingress only from LB health check ranges on port 18789 | Task Security Group |
| Metadata protection | GCP v1 API requires `Metadata-Flavor: Google` header (default) | IMDSv2 + ECS_AWSVPC_BLOCK_IMDS |
| No SSH access | No OS Login roles granted to bot service account | No key pair |
| Gateway auth token | Generated per-bot, stored in Secret Manager, injected as env var | Same, via Secrets Manager |
| Least-privilege SA | Bot VM service account has only: Secret Manager read, Cloud Logging write | Empty task role |
| Sysbox runtime | Installed via `apt-get` on Ubuntu 22.04 | Installed via `.deb` extraction on AL2023 |
| Encrypted disk | Boot disk with CMEK or Google-managed encryption | Encrypted EBS |
| Shielded VM | Integrity monitoring enabled (secure boot disabled for Sysbox compat) | N/A |
| VPC Flow Logs | Enabled on subnet, metadata-only, 30-day retention | VPC Flow Logs on VPC |
| Docker socket mount | Required for OpenClaw sandbox mode (same trade-off as AWS) | Same |

### GCP Security Advantages over AWS

1. **Metadata server is secure by default**: GCP's v1 metadata API requires `Metadata-Flavor: Google` header. AWS defaults to IMDSv1 (insecure) unless explicitly configured.
2. **VPC firewall rules are deny-by-default**: AWS security groups are allow-based. GCP firewall has explicit deny rules with priority ordering.
3. **Service accounts are simpler**: One service account per VM with IAM roles. No instance profiles + roles + policies chain.
4. **Private Google Access is free**: VMs access GCP APIs without public IP and without VPC endpoints ($0 vs AWS's $117/mo for interface endpoints).

### Known Security Limitations (same as AWS)

| Limitation | Risk | Mitigation |
|-----------|------|------------|
| Docker socket mount | Container escape → host Docker access | Sysbox isolates sandbox containers. Private subnet prevents direct attack. |
| Root in container | OpenClaw runs as root (needs Docker socket) | Sysbox UID mapping. Private subnet. Gateway auth token required. |

---

## 4. Cost

### Per-Component Cost (us-east1)

| Component | Monthly | Notes |
|-----------|---------|-------|
| **Shared: Cloud NAT** | **~$1.02** | $0.0014/hr per VM, 1 VM = $1.02/mo gateway fee |
| **Shared: Cloud NAT IP** | **$3.65** | $0.005/hr per static IP |
| **Shared: Cloud Router** | **$0** | Free |
| **Shared: LB forwarding rule** | **$18.25** | First 5 rules at $0.025/hr |
| **Shared: LB static IP** | **$3.65** | $0.005/hr |
| **Per-bot: VM (e2-small)** | **$12.23** | 2 shared vCPU, 2 GB RAM. Auto 30% sustained-use discount if running 24/7 → ~$8.56 |
| **Per-bot: Boot disk** | **$2.04** | 30 GB pd-balanced ($0.068/GB/mo) |
| **Per-bot: Secret Manager** | **~$0.12** | 2 secrets × $0.06/version/mo |
| **Per-bot: Cloud Logging** | **$0** | First 50 GB/mo free |
| **Per-bot: NAT data processing** | **~$0.50** | ~10 GB/mo × $0.045/GiB (API calls, npm, Docker Hub) |

### Cost Comparison: GCP vs AWS

| Bots | GCP Monthly | AWS Monthly | Savings |
|------|------------|-------------|---------|
| 1 | **~$42** | $49 | **$7/mo (14%)** |
| 2 | **~$57** | $91 | **$34/mo (37%)** |
| 3 | **~$72** | $133 | **$61/mo (46%)** |
| 5 | **~$102** | $217 | **$115/mo (53%)** |
| 10 | **~$177** | $427 | **$250/mo (59%)** |

**Why GCP scales better**:
1. **Shared LB**: One forwarding rule serves all bots via URL map routing ($18.25 total, not per-bot). AWS needs per-bot ALB ($24.30 each) until shared ALB migration.
2. **No per-bot LB IPv4 charges**: GCP LB uses one IP. AWS ALB uses 2 IPs per bot ($7.30/bot).
3. **Sustained use discounts**: Auto-applied, no commitment. 30% off for VMs running 100% of month.
4. **Free logging**: 50 GB/mo free tier vs AWS CloudWatch charges.
5. **Cheap secrets**: $0.06/secret/mo vs AWS $0.40/secret/mo (6.7x cheaper).

### GCP-Specific Optimization Opportunities

| Optimization | Savings | Phase |
|-------------|---------|-------|
| Sustained use discount (automatic) | ~$3.67/bot/mo | Phase 1 (automatic) |
| Committed use discount (1-year) | ~$4.53/bot/mo | Phase 3 |
| Spot/Preemptible VMs | ~$6.61/bot/mo (54%) | Phase 4 (opt-in) |
| Custom machine type (1.5 GB RAM) | ~$2/bot/mo | Phase 2 |
| e2-micro for light bots (<50 msg/day) | ~$8/bot/mo savings | Phase 3 |

---

## 5. Reliability

### Cloud NAT Reliability (vs AWS NAT Instance)

| Aspect | GCP Cloud NAT | AWS NAT Instance |
|--------|--------------|------------------|
| Management | **Fully managed** | Self-managed (OS patches, monitoring) |
| High availability | **Automatic multi-AZ** | Single AZ, single point of failure |
| Recovery | **Automatic** | CloudWatch alarm → EC2 auto-recovery (~5-10 min) |
| Throughput | **20 Gbps** | Limited by instance type (32 Mbps for t4g.nano) |
| Cost | ~$5/mo (1 VM) | ~$7/mo (t4g.nano + EIP) |

**Cloud NAT eliminates the biggest reliability concern from the AWS architecture**: the single-AZ NAT Instance that could take down all bots if its AZ fails.

### MIG Auto-Healing

Managed Instance Groups support auto-healing via health checks:
- If the VM health check fails, MIG deletes the VM and creates a new one
- Health check: HTTP GET /health on port 18789
- Initial delay: 300s (allows startup script + OpenClaw install to complete)
- Check interval: 30s, unhealthy threshold: 3 consecutive failures

### Container Lifecycle: systemd

Without ECS, OpenClaw container lifecycle is managed by systemd:

```ini
[Unit]
Description=OpenClaw Gateway
Requires=docker.service
After=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
TimeoutStartSec=300
ExecStartPre=-/usr/bin/docker rm -f openclaw-gateway
ExecStart=/usr/bin/docker run --rm \
  --name openclaw-gateway \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 18789:18789 \
  --env-file /etc/openclaw/env \
  openclaw-prebuilt:latest \
  sh -c 'echo "$OPENCLAW_CONFIG" > ~/.openclaw/openclaw.json && \
         exec openclaw gateway --port 18789 --allow-unconfigured'
ExecStop=/usr/bin/docker stop -t 30 openclaw-gateway

[Install]
WantedBy=multi-user.target
```

**Advantages over ECS**:
- Simpler (no task definitions, services, capacity providers, circuit breakers)
- `Restart=always` handles crash recovery automatically
- `RestartSec=10` prevents restart storms
- `TimeoutStartSec=300` allows OpenClaw install time

**What ECS provides that we must replicate**:
- Health check integration with LB → Handled by GCE health check on MIG
- Deployment circuit breaker → Handled by MIG auto-healing (3 consecutive failures → recreate)
- Log streaming → Cloud Logging agent (Ops Agent) or Docker logging driver
- Rolling updates → Stop old container, start new (brief downtime — same as AWS MHP=0)

### Stack Recovery

| State | Recovery |
|-------|---------|
| VM creation fails | MIG auto-retries |
| Startup script fails | VM unhealthy → MIG auto-heals (delete + recreate) |
| OpenClaw crashes | systemd restarts container (Restart=always) |
| VM becomes unresponsive | MIG health check fails → auto-heal |
| Shared infra deletion blocked | Check if any MIGs/VMs reference the VPC. Delete bots first, then shared. |

---

## 6. OOTB Compatibility

Clawster is open-source. Everything must work when the end user runs the install script, without pre-built custom images:

- **VM image**: Ubuntu 22.04 LTS (`ubuntu-2204-lts` from `ubuntu-os-cloud`). Available in every GCP region via image families. Standard public image.
- **Docker**: Installed via official Docker `apt` repository in startup script (~30-40s).
- **Sysbox**: Installed via `apt-get install ./sysbox-ce_0.6.7-0.linux_amd64.deb` in startup script (~10-15s). SHA256 verified. Officially supported on Ubuntu 22.04.
- **OpenClaw image**: Pre-built locally in startup script (background). Fallback to runtime `npm install` if prebuild fails (same pattern as AWS).
- **OpenClaw version pinning**: Same as AWS — resolve `latest` to concrete version at install time.
- **No custom images, no Artifact Registry images needed.** These are Phase 2 optimizations.

### Startup Script (complete)

```bash
#!/bin/bash
set -euo pipefail

# ============================================
# IDEMPOTENCY GUARD
# GCE startup scripts run on EVERY boot (unlike AWS UserData which runs once).
# Skip if already installed.
# ============================================
if [ -f /usr/bin/sysbox-runc ] && systemctl is-active --quiet docker; then
  # Ensure OpenClaw container is running (may have been stopped by reboot)
  systemctl start openclaw 2>/dev/null || true
  exit 0
fi

# ============================================
# STEP 1: Install Docker Engine
# ============================================
apt-get update
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io

systemctl enable docker
systemctl start docker

# ============================================
# STEP 2: Install Sysbox v0.6.7
# ============================================
SYSBOX_VERSION="0.6.7"
SYSBOX_SHA256="b7ac389e5a19592cadf16e0ca30e40919516128f6e1b7f99e1cb4ff64554172e"

cd /tmp
curl -fsSL -o sysbox.deb \
  "https://downloads.nestybox.com/sysbox/releases/v${SYSBOX_VERSION}/sysbox-ce_${SYSBOX_VERSION}-0.linux_amd64.deb"

echo "${SYSBOX_SHA256}  sysbox.deb" | sha256sum -c -

# Native apt-get install handles everything:
# - Installs binaries to /usr/bin/
# - Installs systemd units to /lib/systemd/system/
# - Updates /etc/docker/daemon.json with sysbox-runc runtime
# - Restarts Docker to pick up new runtime
# - Starts and enables sysbox-mgr + sysbox-fs
# - Applies required sysctl settings
apt-get install -y jq
apt-get install -y ./sysbox.deb

# ============================================
# STEP 3: Read config from instance metadata
# ============================================
OPENCLAW_VERSION=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/attributes/openclaw-version")
GATEWAY_PORT=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gateway-port" || echo "18789")
SECRET_NAME=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/attributes/config-secret-name")
PROJECT_ID=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/project/project-id")

# ============================================
# STEP 4: Pre-build OpenClaw image (background)
# ============================================
(set +e
 cat > /tmp/Dockerfile.openclaw <<DOCKERFILE
FROM node:22-slim
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN npm install -g openclaw@${OPENCLAW_VERSION}
RUN mkdir -p /root/.openclaw
DOCKERFILE

 if ! timeout 300 docker build --network=host -t openclaw-prebuilt:latest \
      -f /tmp/Dockerfile.openclaw /tmp 2>&1 | tail -5; then
   echo "WARN: prebuild failed/timed out, tagging base image as fallback"
   docker pull node:22-slim 2>/dev/null || true
   docker tag node:22-slim openclaw-prebuilt:latest
 fi

 # ============================================
 # STEP 5: Fetch config from Secret Manager and start OpenClaw
 # ============================================
 # Install gcloud CLI for Secret Manager access (if not present)
 # GCE Ubuntu images include gcloud by default
 OPENCLAW_CONFIG=$(gcloud secrets versions access latest \
   --secret="${SECRET_NAME}" --project="${PROJECT_ID}" 2>/dev/null || echo '{}')

 mkdir -p /etc/openclaw
 cat > /etc/openclaw/env <<ENVFILE
OPENCLAW_CONFIG=${OPENCLAW_CONFIG}
OPENCLAW_VERSION=${OPENCLAW_VERSION}
ENVFILE

 # Install and enable systemd service for OpenClaw
 cat > /etc/systemd/system/openclaw.service <<'UNIT'
[Unit]
Description=OpenClaw Gateway
Requires=docker.service
After=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
TimeoutStartSec=300
EnvironmentFile=/etc/openclaw/env
ExecStartPre=-/usr/bin/docker rm -f openclaw-gateway
ExecStart=/usr/bin/docker run --rm \
  --name openclaw-gateway \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 18789:18789 \
  openclaw-prebuilt:latest \
  sh -c 'echo "$OPENCLAW_CONFIG" > /root/.openclaw/openclaw.json && \
         (which openclaw || (apt-get update && apt-get install -y git && npm install -g openclaw@${OPENCLAW_VERSION})) && \
         exec openclaw gateway --port 18789 --allow-unconfigured'
ExecStop=/usr/bin/docker stop -t 30 openclaw-gateway

[Install]
WantedBy=multi-user.target
UNIT

 systemctl daemon-reload
 systemctl enable openclaw
 systemctl start openclaw) &
```

**Estimated execution time**: ~90-150s total (Docker install ~40s + Sysbox install ~15s + prebuild ~60-120s in background).

---

## 7. OpenClaw Feature Compatibility

Cloud NAT provides full outbound internet from private VMs. All features work identically to AWS:

| Feature | Mechanism | Status |
|---------|-----------|--------|
| WhatsApp (Baileys) | Outbound WebSocket | Works via Cloud NAT |
| Telegram (polling/webhook) | Outbound long-poll / Inbound POST to LB | Works via Cloud NAT / LB |
| Discord / Slack / Signal | Outbound WebSocket/HTTP | Works via Cloud NAT |
| LLM APIs (Anthropic, OpenAI) | Outbound HTTPS | Works via Cloud NAT |
| Web browsing (Chromium) | Outbound HTTP/HTTPS | Works via Cloud NAT |
| Docker sandbox (Sysbox) | Docker-in-Docker, `network: none` | Works via Sysbox on GCE |
| npm / git (skills) | Outbound HTTPS | Works via Cloud NAT |

---

## 8. Implementation Plan

### Resource Mapping (AWS → GCP)

| AWS Resource | GCP Equivalent | Package |
|-------------|---------------|---------|
| CloudFormation Stack | Direct SDK calls | `@google-cloud/compute` |
| VPC (10.0.0.0/16) | VPC Network (custom mode) | `@google-cloud/compute` |
| 2 Public + 2 Private Subnets | 1 Subnet (private, no external IPs) | `@google-cloud/compute` |
| Internet Gateway | Implicit (default gateway) | N/A |
| NAT Instance (t4g.nano) | Cloud NAT + Cloud Router (managed) | `@google-cloud/compute` |
| Route Table | Routes (subnet-level) | `@google-cloud/compute` |
| Security Groups (ALB, Task, Instance) | Firewall Rules + Network Tags | `@google-cloud/compute` |
| ALB | External Application LB (URL map + proxy + forwarding rule) | `@google-cloud/compute` |
| Target Group | Backend Service + Health Check | `@google-cloud/compute` |
| ASG + Launch Template | MIG + Instance Template | `@google-cloud/compute` |
| ECS Cluster + Task Def + Service | systemd service (Docker container) | Startup script |
| IAM Instance Profile | Service Account | `@google-cloud/compute` / IAM |
| Secrets Manager | Secret Manager | `@google-cloud/secret-manager` |
| CloudWatch Logs | Cloud Logging | `@google-cloud/logging` |
| ECS capacity provider | MIG autoscaler + auto-healing | `@google-cloud/compute` |

### Shared Infra Resources (created once per region)

1. **VPC Network** (`clawster-vpc`): Custom mode, no auto-subnets
2. **Subnet** (`clawster-subnet-{region}`): `10.0.0.0/20`, Private Google Access enabled
3. **Cloud Router** (`clawster-router`): Required by Cloud NAT
4. **Cloud NAT** (`clawster-nat`): Auto-allocate IPs, all subnets
5. **Firewall Rules**:
   - `clawster-allow-lb-health`: Ingress from GCP LB health check ranges (`130.211.0.0/22`, `35.191.0.0/16`) to tag `openclaw-bot` on port 18789
   - `clawster-allow-iap-ssh`: Ingress from IAP ranges (`35.235.240.0/20`) on port 22, tag `openclaw-bot` (for debugging only, disabled by default)
   - `clawster-deny-all-ingress`: Deny all other ingress to tag `openclaw-bot`, priority 65534
6. **Service Accounts**:
   - `clawster-bot@{project}.iam.gserviceaccount.com`: Roles: `roles/secretmanager.secretAccessor`, `roles/logging.logWriter`
7. **External IP** (for LB): Static global IP
8. **Health Check** (`clawster-health-check`): HTTP, port 18789, path `/health`, interval 10s, healthy 2, unhealthy 3
9. **Backend Service** (`clawster-backend`): Protocol HTTP, timeout 3600s (WebSocket), health check attached
10. **URL Map** (`clawster-url-map`): Default backend service, host/path rules per bot
11. **Target HTTP(S) Proxy** (`clawster-proxy`): References URL map. Optional: SSL cert for HTTPS.
12. **Forwarding Rule** (`clawster-forwarding`): Static IP, port 80 (and 443 if HTTPS), target proxy

### Per-Bot Resources

1. **Secret Manager secret** (`clawster/{botName}/config`): OpenClaw config JSON
2. **Secret Manager secret** (`clawster/{botName}/gateway-token`): Auth token
3. **Instance Template** (`clawster-bot-{botName}`):
   - Machine type: e2-small
   - Image: `ubuntu-2204-lts` from `ubuntu-os-cloud`
   - Boot disk: 30 GB pd-balanced, encrypted
   - Network: `clawster-vpc` subnet, no external IP
   - Service account: `clawster-bot@{project}`
   - Network tags: `openclaw-bot`
   - Metadata: `startup-script` (embedded), `openclaw-version`, `gateway-port`, `config-secret-name`
   - Shielded VM: integrity monitoring ON, secure boot OFF (Sysbox compat)
4. **Managed Instance Group** (`clawster-mig-{botName}`):
   - Instance template reference
   - Target size: 0 (set to 1 on `start()`)
   - Auto-healing: health check with 300s initial delay
   - Single zone (matching subnet region)
5. **Backend service update**: Add MIG as named port backend to shared backend service
6. **URL map update**: Add host/path rule for bot routing

### Code Structure

```
packages/cloud-providers/src/targets/gce/
├── gce-target.ts                    # Main target (install/configure/start/stop/destroy)
├── gce-config.ts                    # GCE-specific config interface
├── gce-services.interface.ts        # Service interfaces (DI)
├── gce-service-adapters.ts          # Adapter wrappers
├── shared-infra/
│   ├── gce-shared-infra-manager.ts  # Shared infra lifecycle
│   └── gce-shared-infra-config.ts   # Constants, export names
├── per-bot/
│   ├── gce-per-bot-manager.ts       # Per-bot resource lifecycle
│   ├── gce-instance-template.ts     # Instance template builder
│   └── gce-startup-script.ts        # Startup script generator
└── __tests__/
    ├── gce-target.test.ts
    ├── gce-shared-infra.test.ts
    └── gce-per-bot.test.ts

packages/adapters-gcp/src/
├── compute/
│   ├── compute-service.ts           # VPC, subnet, firewall, VM, MIG
│   ├── load-balancer-service.ts     # Backend service, URL map, proxy, forwarding
│   └── instance-template-service.ts # Instance template CRUD
├── secrets/
│   └── secret-manager-service.ts    # Secret CRUD
├── logging/
│   └── cloud-logging-service.ts     # Log read/write
├── errors/
│   └── gcp-error-handler.ts         # Error classification
└── index.ts
```

### Lifecycle Methods

**`install(options)`**:
1. Validate bot name (2-20 chars, lowercase alphanumeric + hyphens)
2. Resolve OpenClaw version (npm registry → pinned version)
3. Create Secret Manager secrets (config + gateway token)
4. Ensure shared infra (VPC, NAT, LB) — idempotent
5. Create instance template with startup script
6. Create MIG (target size 0)
7. Add bot backend to shared LB URL map
8. Log progress via `setLogCallback`

**`configure(config)`**:
1. Transform config via `transformConfig()` (same ECS-specific overrides: `gateway.mode: "local"`, `gateway.bind: "lan"`)
2. Create new secret version in Secret Manager
3. Return `requiresRestart: true`

**`start()`**:
1. Set MIG target size to 1
2. Wait for VM to be RUNNING
3. Wait for health check to pass (poll LB backend health)

**`stop()`**:
1. Set MIG target size to 0
2. Wait for VM to be terminated

**`restart()`**:
1. Recreate instances in MIG (rolling replace)

**`destroy()`**:
1. Remove bot from LB URL map
2. Delete MIG
3. Delete instance template
4. Delete Secret Manager secrets
5. If last bot: delete shared infra (VPC, NAT, LB, firewall rules, service accounts)

**`getStatus()`**:
1. Describe MIG → target size and current size
2. If current > 0 and health check passing → "running"
3. If target = 0 → "stopped"
4. Else → "error"

**`getLogs()`**:
1. Query Cloud Logging for the bot's VM instance
2. Filter by resource.type="gce_instance" and labels

**`getEndpoint()`**:
1. Return LB static IP with protocol ws/wss

---

## 9. Implementation Phases

### Phase 1: Secure Working Deploy (OOTB)

Everything needed for a working, secure deploy. No custom images or Artifact Registry — works immediately.

**Scope**:
- Shared infra: VPC + Subnet + Cloud NAT + Cloud Router + Firewall + LB + Service Account
- Per-bot: Secret Manager + Instance Template + MIG + LB routing
- Startup script: Docker + Sysbox + OpenClaw prebuild
- Container management: systemd service
- Health monitoring: GCE health check + MIG auto-healing
- Logging: Cloud Logging (Ops Agent or Docker driver)
- Security: Private subnet, no external IP, least-privilege SA, Shielded VM, encrypted disk

**Result**:
- First bot: ~4-5 min | Subsequent: ~3-3.5 min
- Cost: ~$42/mo for first bot, ~$15/mo per additional bot
- Security: all critical controls at launch
- OOTB: standard Ubuntu image, no pre-built resources

### Phase 2: Speed — Custom Image + Artifact Registry

- Packer pipeline: Ubuntu 22.04 + Docker + Sysbox pre-installed → custom GCE image
- Pre-built Docker image pushed to Artifact Registry
- Container command: `openclaw gateway --port {port}` (no apt-get/npm)
- Startup script: 5 lines (fetch config, start container)

**Result**:
- First bot: ~2.5-3 min | Subsequent: ~1.5-2 min
- Eliminates Docker Hub rate limit concern

### Phase 3: Cost — Committed Use + Custom Machine Types

- Committed Use Discounts (1-year): 37% off compute
- Custom machine types: right-size RAM (1.5 GB instead of 2 GB)
- e2-micro tier for light bots (<50 msg/day)
- Shared LB already in place from Phase 1 (no migration needed unlike AWS)

**Result**: Per-bot cost drops to ~$8-12/mo with CUD

### Phase 4: Advanced

- Spot/Preemptible VMs: 54-60% savings (opt-in, can be preempted)
- Multi-bot per VM: Pack 3-8 bots on larger instance
- Regional MIG: Spread across zones for AZ resilience
- Binary Authorization: Verify container image signatures
- Cloud Armor: WAF for LB (DDoS protection, geo-blocking)

---

## 10. GCP vs AWS: Decision Matrix

| Dimension | GCP | AWS | Winner |
|-----------|-----|-----|--------|
| **Sysbox install simplicity** | `apt-get install ./sysbox.deb` (3 lines) | Manual .deb extraction + 6 workarounds (~100 lines) | **GCP** |
| **Deploy speed (first bot)** | ~4-5 min (SDK calls, no CF) | ~6 min (CF stacks) | **GCP** |
| **Deploy speed (subsequent)** | ~3-3.5 min | ~3.5 min | **GCP** (slight) |
| **Cost (1 bot)** | ~$42/mo | ~$49/mo | **GCP** |
| **Cost (10 bots)** | ~$177/mo | ~$427/mo | **GCP** (59% cheaper) |
| **NAT reliability** | Cloud NAT (managed, multi-AZ) | NAT Instance (single AZ, self-managed) | **GCP** |
| **LB architecture** | Shared LB from day 1 | Per-bot ALB, shared migration at 3+ bots | **GCP** |
| **IaC maturity** | SDK (no state mgmt) | CloudFormation (full state, rollback) | **AWS** |
| **Ecosystem maturity** | Good but smaller | Largest cloud ecosystem | **AWS** |
| **Secret Manager cost** | $0.06/secret/mo | $0.40/secret/mo | **GCP** (6.7x cheaper) |
| **VPC API access** | Private Google Access (FREE) | VPC endpoints ($117/mo) or NAT | **GCP** |
| **Container orchestration** | systemd (simple, manual) | ECS (rich, managed) | **AWS** for features |
| **Logging** | 50 GB/mo free | Pay per GB | **GCP** |
| **Metadata security** | Secure by default (v1 header required) | Must explicitly enable IMDSv2 | **GCP** |

---

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **GCE startup script runs every boot** | Re-install attempt on reboot could break Sysbox | Idempotency guard at top of script |
| **Docker not pre-installed** | Adds ~40s to first boot | Acceptable for Phase 1. Custom image for Phase 2 |
| **No ECS-equivalent orchestration** | Must manage container lifecycle manually | systemd is simpler for single-container-per-VM |
| **GCE Ubuntu kernel updates** | Could break Sysbox compatibility | Pin kernel version or test before `unattended-upgrades` |
| **Sysbox not tested on GCE specifically** | Unknown edge cases | Spike test required before implementation |
| **No CloudFormation-like state management** | Must track resources manually, handle partial failures | Implement resource tracking in Clawster DB. Phase 2: Pulumi |
| **Cloud NAT costs scale with VMs** | $1.02/mo per VM (vs $0 for AWS NAT Instance per additional bot) | Still cheaper overall. NAT instance option available as fallback |
| **LB 24-hour WebSocket limit** | All WebSocket connections auto-close at 24 hours | OpenClaw gateway clients must handle reconnection (already do) |

### Required Spike Test

Before implementation, run a spike similar to AWS (2026-02-06):

1. Create GCE VM: `gcloud compute instances create sysbox-test --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud --machine-type=e2-small --zone=us-east1-b`
2. SSH in, run Docker + Sysbox install manually
3. Verify: `docker run --runtime=sysbox-runc --rm alpine uname -a`
4. Run OpenClaw container with Docker socket mount
5. Verify sandbox container creation works
6. Measure total install time
7. Test health endpoint: `curl http://localhost:18789/health`
8. Confirm GCE health check integration with MIG
