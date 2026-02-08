# Azure Deployment Architecture

## Context

The current Azure VM target uses Application Gateway ($180/mo base) for ingress — a single bot costs ~$220/mo. The goal is ~$30-40/bot while maximizing security, reliability, deployment speed, OOTB operation, and OpenClaw compatibility (Sysbox, Docker socket, WebSocket).

**Core design**: Replace Application Gateway with Caddy reverse proxy on the VM. Use VMSS (not standalone VM) for auto-healing at zero extra cost. Use Azure Files for persistent data that survives instance replacement.

## Research: Why VMSS + Caddy?

### Eliminated Options

| Service | DinD/Sysbox | Why Not |
|---------|-------------|---------|
| ACI | No privileged, no Docker socket | Cannot run sandbox mode |
| ACA | No privileged, no host access | Cannot run sandbox mode |
| App Service | Sandboxed, no Docker socket | Cannot run sandbox mode |
| AKS | Yes (Sysbox daemonset) | $73/mo control plane overhead, K8s complexity — viable for Phase 2 at 10+ bots |
| App Gateway | N/A | $180/mo minimum — 6x the entire bot cost budget |
| Azure LB (Standard) | N/A | $18/mo, L4 only (no TLS termination), still needs Caddy anyway |

### AWS → Azure Mapping

| AWS | Azure | Notes |
|-----|-------|-------|
| CloudFormation | Azure SDK (programmatic) | Direct API calls, no template language needed |
| VPC + Subnets | VNet + Subnets | Same concept, `10.0.0.0/16` |
| ALB ($17/mo per bot) | Caddy on VM ($0) | Caddy: auto-HTTPS, WebSocket, rate limiting |
| NAT Instance ($7/mo) | Not needed | VM has public IP for both inbound and outbound |
| Security Groups | NSG | Applied at subnet level |
| IAM Roles | Managed Identity | User-assigned for shared permissions |
| Secrets Manager | Key Vault | Config + gateway tokens |
| CloudWatch Logs | Run Command + Azure Monitor | Run Command for quick log access |
| ASG (maxSize=1) | VMSS (maxSize=1) | Auto-healing via health extension |
| EC2 UserData | Cloud-init | Native Ubuntu support, much simpler than AL2023 |
| ECS-optimized AMI | Ubuntu 24.04 LTS | Standard image — no kernel hacks needed |

## Architecture

```
Internet
    |  NSG: allow TCP 80/443 only
    v
[VMSS Instance - Public IP - Ubuntu 24.04]
    |
    +-- Caddy (:80/:443)
    |     |-- reverse_proxy 127.0.0.1:18789
    |     |-- Auto-HTTPS (Let's Encrypt) when custom domain set
    |     |-- WebSocket upgrade (native)
    |     |-- Rate limiting (connections + requests)
    |
    +-- Docker (-p 127.0.0.1:18789:18789)
    |     |-- OpenClaw container (default runc runtime)
    |     |     |-- gateway binds 0.0.0.0:18789 INSIDE container
    |     |     |-- Docker socket mount (/var/run/docker.sock)
    |     |     |-- Config from Azure Files (/mnt/openclaw/.openclaw/)
    |     |     |-- --restart=always (Docker auto-restart)
    |     |
    |     +-- Sandbox containers (sysbox-runc, network:none)
    |
    +-- Azure Files mount (/mnt/openclaw)
    |     |-- .openclaw/openclaw.json (config)
    |     |-- .openclaw/credentials/ (WhatsApp, Telegram)
    |     |-- Survives instance replacement
    |
    +-- Sysbox v0.6.7 (installed via dpkg -i)
```

### Critical: Docker Port Binding

OpenClaw runs INSIDE a Docker container. The port mapping must be:
- **Docker**: `-p 127.0.0.1:18789:18789` — binds to **host localhost only**
- **OpenClaw config**: `gateway.bind = "lan"` (0.0.0.0 **inside** the container, so Docker can reach it)
- **Caddy**: `reverse_proxy 127.0.0.1:18789` — connects to Docker-mapped port on host
- **NSG**: blocks port 18789 from internet (defense in depth — even if NSG is misconfigured, port 18789 is only on localhost)

This is **more secure** than the App Gateway approach where OpenClaw binds to 0.0.0.0 on a network-reachable interface.

## Infrastructure

### Shared (per resource group, created once, ~$0.10/mo)

| Resource | Purpose | Cost |
|----------|---------|------|
| VNet `10.0.0.0/16` | Network isolation | Free |
| Subnet `10.0.1.0/24` | Bot VMs | Free |
| NSG | Inbound 80/443 only | Free |
| Key Vault | Bot configs + gateway tokens | ~$0.03/mo (per-operation) |
| User-assigned Managed Identity | Key Vault + Storage access | Free |
| Storage Account + Azure Files share | Persistent bot data (credentials, sessions) | ~$0.06/mo per bot (1 GB hot tier) |

### Per-Bot

| Resource | Purpose | Cost (Standard) |
|----------|---------|-----------------|
| VMSS (maxInstances=1) | Compute with auto-healing | $30.37/mo (B2s) |
| Public IP (Standard, static) | Inbound + outbound internet | $3.65/mo |
| OS Disk (30 GB Standard SSD) | OS + Docker + Sysbox + Caddy | $2.40/mo |
| Azure Files directory | Persistent data (credentials, config) | ~$0.06/mo |
| **Total** | | **~$36.50/mo** |

## Cost Breakdown

| Tier | VM Size | RAM | Total/mo | vs AWS |
|------|---------|-----|----------|--------|
| Light | B1ms (1 vCPU) | 2 GB | **~$22/mo** | Same as AWS t3.small ($22/mo) |
| Standard | B2s (2 vCPU) | 4 GB | **~$37/mo** | AWS t3.small 2GB: $22/mo, AWS t3.medium 4GB: ~$34/mo |
| Performance | D2s_v3 (2 vCPU) | 8 GB | **~$77/mo** | AWS t3.large 8GB: ~$61/mo |

Shared infra: ~$0.10/mo total (amortized across bots).

| Bots | AWS EC2 (Caddy) | Azure VMSS (Caddy) | GCE (Caddy) |
|------|-----------------|---------------------|-------------|
| 1 | **$22** | $37 | $30 |
| 5 | **$108** | $183 | $150 |
| 10 | **$216** | $367 | $300 |

**AWS is cheapest** due to lower VM pricing, despite having less RAM (t3.small 2GB vs B2s 4GB).

**Why cheaper than AWS**: No NAT ($7 saved), no ALB ($17 saved), no ALB IPv4 ($7.30 saved). VM itself is slightly more expensive ($30 vs $15) but the infrastructure savings more than compensate.

## Security Model

### Defense in Depth (8 layers)

| # | Layer | Control | Details |
|---|-------|---------|---------|
| 1 | Network | NSG | Only TCP 80/443 inbound; all other ports denied including 18789 |
| 2 | Port binding | Docker localhost | `-p 127.0.0.1:18789:18789` — gateway port NEVER on a public interface |
| 3 | Transport | Caddy TLS | Auto-HTTPS via Let's Encrypt when domain configured |
| 4 | Application | Caddy proxy | Rate limiting, connection limits, header filtering |
| 5 | Auth | Gateway token | OpenClaw `auth.mode: "token"` — rejects unauthenticated WebSocket |
| 6 | Container | Sysbox | Sandbox containers in unprivileged user namespace (UID 100000+) |
| 7 | Access | No SSH | No SSH port open; Azure Serial Console for emergency debugging |
| 8 | Identity | Managed Identity | Zero stored credentials; VM authenticates to Key Vault/Storage via MI |
| 9 | Encryption | Disk SSE | OS and data disks encrypted at rest (platform-managed keys) |

### Honest Comparison: What You Lose vs App Gateway ($180/mo)

| Capability | App Gateway | Caddy on VM | Risk Level |
|------------|-------------|-------------|------------|
| Managed WAF (OWASP rules) | Yes (WAF_v2) | No — Caddy rate limiting only | **Medium** — OpenClaw's auth token is the primary defense; WAF is a secondary layer |
| L7 DDoS protection | Yes (integrated) | Azure DDoS Basic only (free) | **Low** — DDoS Basic handles volumetric attacks; Caddy handles slowloris |
| Separate network boundary | Yes (VM in private subnet) | No — VM has public IP with NSG | **Low** — port 18789 bound to localhost, NSG blocks all non-80/443 |
| TLS certificate management | Key Vault integration | Caddy auto-cert (Let's Encrypt) | **None** — Caddy auto-cert is simpler and equally secure |
| Health-based backend routing | Yes | N/A (single VM) | **None** — VMSS health extension handles this |

**Bottom line**: The App Gateway provides managed WAF as the only meaningful security advantage. For the $30-40/bot target, the 8-layer defense above is robust. If enterprise compliance requires WAF, App Gateway can be added later as an optional shared layer.

## Reliability Model

### VMSS Auto-Healing (zero extra cost)

Using VMSS instead of standalone VM provides auto-healing at the same price:

| Failure | Recovery | Mechanism |
|---------|----------|-----------|
| OpenClaw container crash | ~5s | Docker `--restart=always` policy |
| VM application hang | ~3 min | VMSS Application Health extension detects unhealthy → auto-repair replaces instance |
| Azure host failure | ~5 min | Azure auto-restart (built-in for all VMs) |
| OS corruption | ~3 min | VMSS auto-repair reimages instance, Azure Files preserves data |

**VMSS Configuration**:
- `maxInstances: 1`, `minInstances: 0` (scale to zero when stopped)
- Application Health extension: HTTP probe on `:80/health` (through Caddy → OpenClaw `/health`)
- Automatic repairs: enabled, grace period 10 minutes (cloud-init needs ~3 min)
- Rolling OS upgrades: automatic security patches

### Data Persistence (Azure Files)

**Problem**: When VMSS auto-repair replaces an instance, the OS disk is reimaged. WhatsApp credentials, session history, and config stored on the OS disk are lost.

**Solution**: Azure Files share mounted at `/mnt/openclaw`:
- Config (`openclaw.json`): Also in Key Vault as backup, written to Azure Files by cloud-init
- WhatsApp credentials: Stored on Azure Files, survive instance replacement
- Session history: Stored on Azure Files, survive instance replacement
- Cost: ~$0.06/mo per bot (1 GB hot tier)
- Mount: via cloud-init using `mount -t cifs` with Managed Identity auth

This eliminates the separate data disk entirely — Azure Files replaces both the data disk AND solves the persistence problem.

**Updated per-bot cost without data disk**: B2s ($30.37) + Public IP ($3.65) + OS Disk ($2.40) + Azure Files ($0.06) = **~$36.50/mo**

## Cloud-Init Script

### Why Ubuntu 24.04 is Simpler Than ECS-Optimized AL2023

| Issue | AL2023 (AWS) | Ubuntu 24.04 (Azure) |
|-------|-------------|---------------------|
| Kernel modules | Stripped — `yum reinstall kernel` + symlink hack | Present — just works |
| Sysbox `.deb` install | Manual `ar x` extraction (no `dpkg`) | `dpkg -i` — just works |
| Docker `daemon.json` | Not read on first boot — restart dance needed | Read normally |
| ECS agent crash loop | `xt_DNAT` missing — systemd override | N/A — no ECS agent |
| Package manager | `yum` — slower, fewer packages | `apt` — faster, `.deb` native |

### Script Steps (executed by cloud-init on first boot)

```
1. apt update && apt install -y docker.io jq curl cifs-utils
2. systemctl enable --now docker
3. Mount Azure Files share at /mnt/openclaw (via CIFS + managed identity)
4. Download Sysbox v0.6.7 .deb from GitHub releases (SHA256 verified)
5. dpkg -i sysbox.deb && apt-get install -f (resolve dependencies)
6. Configure /etc/docker/daemon.json with sysbox-runc runtime
7. systemctl restart docker
8. Install Caddy via official apt repo (apt install caddy)
9. Write /etc/caddy/Caddyfile:
     :80 {
       reverse_proxy 127.0.0.1:18789
     }
   (or with domain for auto-HTTPS)
10. Fetch config from Key Vault via: az keyvault secret show (managed identity)
11. Write config to /mnt/openclaw/.openclaw/openclaw.json
12. Pre-build OpenClaw Docker image:
     FROM node:22-slim
     RUN apt-get update && apt-get install -y git docker.io && rm -rf /var/lib/apt/lists/*
     RUN npm install -g openclaw@${VERSION}
13. docker run -d --name openclaw-gateway --restart=always \
      -p 127.0.0.1:18789:18789 \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v /mnt/openclaw/.openclaw:/home/node/.openclaw \
      -e OPENCLAW_GATEWAY_PORT=18789 \
      -e OPENCLAW_GATEWAY_TOKEN="$TOKEN" \
      openclaw-prebuilt:latest \
      openclaw gateway --port 18789 --allow-unconfigured
14. systemctl enable --now caddy
```

### Resilience

- Each `apt install` uses `--retry 3` and `|| true` to handle transient failures
- Docker image build has `timeout 300` with fallback to `node:22-slim` base
- Key Vault fetch retries 5 times with backoff (managed identity can take ~30s to be ready)
- Sysbox failure is non-fatal — OpenClaw runs without sandbox (degraded mode)

## OpenClaw Config Transform

```typescript
// azure-vm-target.ts getTransformOptions()
customTransforms: [
  (config) => ({
    ...config,
    gateway: {
      ...(config.gateway as Record<string, unknown>),
      mode: "local",           // Required for headless/cloud
      bind: "lan",             // 0.0.0.0 INSIDE container (Docker maps to host localhost)
      // No trustedProxies needed — Caddy is on same machine
    },
  }),
],
```

## Deployment Flow

### First Bot (~3 min)
```
0:00  install()
      +-- Ensure shared infra (VNet, NSG, Key Vault, MI, Storage) — ~30s
      +-- Store config in Key Vault — ~2s
      +-- Create VMSS (maxInstances=0) with cloud-init — ~30s
~0:30 start()
      +-- Scale VMSS to 1 — ~5s
      +-- VM provisioning — ~60s
~1:30 Cloud-init starts
      +-- apt install docker + cifs-utils — ~20s
      +-- Mount Azure Files — ~5s
      +-- Sysbox dpkg -i — ~15s
      +-- Docker restart — ~5s
      +-- apt install caddy — ~10s
      +-- Write Caddyfile — ~1s
      +-- Pre-build OpenClaw image — ~60s
      +-- Fetch config from Key Vault — ~5s
      +-- Start OpenClaw container — ~10s
      +-- Start Caddy — ~2s
~3:00 Health check passes → BOT RUNNING
```

### Subsequent Bot (~2.5 min)
Shared infra exists. Skip VNet/NSG/KV/MI/Storage creation.

### Bot Restart (~30s)
VM restart → Docker auto-restarts OpenClaw (`--restart=always`) → Caddy already running via systemd.

### Auto-Repair (~3 min)
VMSS detects unhealthy → replaces instance → cloud-init re-runs → Azure Files preserves all data → no credential re-pairing needed.

## Implementation Steps

### Step 1: Cloud-init builder
**File**: `packages/cloud-providers/src/base/startup-script-builder.ts`

Replace broken `buildCloudInitScript()` with new function:
- Sysbox `.deb` direct download (not the 404'ing GitHub install script)
- `dpkg -i` installation (Ubuntu-native)
- Caddy installation + Caddyfile generation
- Azure Files CIFS mount
- Key Vault config fetch via `az keyvault secret show`
- OpenClaw image pre-build
- Docker run with `-p 127.0.0.1:18789:18789`
- Add `caddy?: { enabled: boolean; domain?: string }` to `StartupScriptOptions`
- Add `azureFiles?: { storageAccount: string; shareName: string; mountPath: string }` to options

### Step 2: Remove Application Gateway
**Delete**:
- `managers/azure-appgateway-manager.ts`
- `managers/interfaces/azure-appgateway-manager.interface.ts`

**Modify**:
- `azure-vm-target.ts` — Remove all `appGateway*` fields, `ensureApplicationGateway()`, App GW import
- `azure-vm-config.ts` — Remove `appGatewayName`, `appGatewaySubnetName`, `appGatewaySubnetAddressPrefix`, `sslCertificateSecretId`
- `azure-manager-factory.ts` — Remove `AzureAppGatewayManager` creation, remove from `AzureManagers` interface
- `managers/index.ts` — Remove App GW exports
- `types.ts` — Remove `AppGatewayConfig`, `GatewayEndpointInfo`

### Step 3: Add Public IP + VMSS
**File**: `azure-network-manager.ts` + interface
- Add `ensurePublicIp(name)`, `getPublicIpAddress(name)`, `deletePublicIp(name)`

**File**: `azure-compute-manager.ts` + interface
- Add `createVmss(name, ...)`, `scaleVmss(name, count)`, `getVmssInstanceStatus(name)`
- Add `getVmssInstancePublicIp(name)`, `runCommandOnVmssInstance(name, commands)`
- Add health extension configuration to VMSS model
- Add automatic repair policy

**File**: `azure-vm-target.ts`
- `install()`: Create VMSS (maxInstances=0) with cloud-init, public IP config, health extension
- `start()`: Scale VMSS to 1
- `stop()`: Scale VMSS to 0
- `getEndpoint()`: Get public IP from VMSS instance
- `destroy()`: Delete VMSS + public IP + Azure Files directory

### Step 4: Update NSG rules
**File**: `azure-network-manager.ts`

`getDefaultSecurityRules()`:
- Priority 100: Allow TCP 80 from Internet
- Priority 110: Allow TCP 443 from Internet
- Default deny all other inbound (Azure built-in)
- Allow all outbound

### Step 5: Azure Files shared infra
**File**: `azure-vm-target.ts` (shared infra setup)

During `ensureSharedInfra()`:
- Create Storage Account (Standard LRS, hot tier)
- Create Azure Files share (`clawster-data`)
- Grant Managed Identity "Storage File Data SMB Share Contributor" role
- Each bot gets a subdirectory: `/clawster-data/{botName}/`

### Step 6: Config transform
**File**: `azure-vm-target.ts`

```typescript
gateway.mode = "local"
gateway.bind = "lan"  // 0.0.0.0 inside container — Docker maps to host localhost
// No trustedProxies — Caddy is same machine
```

### Step 7: Update tier specs
**File**: `azure-vm-target.ts`

```typescript
light:       { cpu: 1024, memory: 2048, dataDiskSizeGb: 0, vmSize: "Standard_B1ms" }
standard:    { cpu: 2048, memory: 4096, dataDiskSizeGb: 0, vmSize: "Standard_B2s" }
performance: { cpu: 2048, memory: 8192, dataDiskSizeGb: 0, vmSize: "Standard_D2s_v3" }
```
`dataDiskSizeGb: 0` — no data disk needed, Azure Files handles persistence.

### Step 8: Update metadata
Update `getMetadata().provisioningSteps` — remove App GW steps, add:
- "Create VMSS"
- "Configure health probes"
- "Mount Azure Files"
- "Configure Caddy"

### Step 9: Update deployment target resolver
**File**: `apps/api/src/reconciler/services/deployment-target-resolver.service.ts`
Verify `azure-vm` config mapping works without App Gateway fields.

### Step 10: Tests
- Unit: cloud-init generation (Caddy config, Sysbox .deb, Azure Files mount, Docker localhost binding)
- Unit: network manager (public IP CRUD, NSG rules)
- Unit: compute manager (VMSS CRUD, health extension, scale operations)
- Unit: target lifecycle (install → configure → start → getEndpoint → stop → destroy)
- Integration: full lifecycle with mocked Azure SDK

## Files to Modify

| File | Change |
|------|--------|
| `packages/cloud-providers/src/base/startup-script-builder.ts` | New `buildAzureCloudInit()` — Caddy, Sysbox .deb, Azure Files, Docker localhost binding |
| `packages/cloud-providers/src/targets/azure-vm/azure-vm-target.ts` | VMSS instead of VM, remove App GW, add public IP, Azure Files, health probes, update transforms |
| `packages/cloud-providers/src/targets/azure-vm/azure-vm-config.ts` | Remove App GW fields, add Azure Files config, add Caddy domain |
| `packages/cloud-providers/src/targets/azure-vm/azure-manager-factory.ts` | Remove App GW manager, keep network + compute |
| `packages/cloud-providers/src/targets/azure-vm/managers/azure-compute-manager.ts` | VMSS methods: create, scale, status, runCommand, health extension |
| `packages/cloud-providers/src/targets/azure-vm/managers/azure-network-manager.ts` | Add public IP methods, update NSG rules |
| `packages/cloud-providers/src/targets/azure-vm/managers/interfaces/*.ts` | Update interfaces for VMSS + public IP |
| `packages/cloud-providers/src/targets/azure-vm/managers/azure-appgateway-manager.ts` | **DELETE** |
| `packages/cloud-providers/src/targets/azure-vm/managers/interfaces/azure-appgateway-manager.interface.ts` | **DELETE** |
| `packages/cloud-providers/src/targets/azure-vm/managers/index.ts` | Remove App GW exports |
| `packages/cloud-providers/src/targets/azure-vm/types.ts` | Remove App GW types, add VMSS types |
| `apps/api/src/reconciler/services/deployment-target-resolver.service.ts` | Verify Azure VM config mapping |

## Verification

1. `pnpm --filter @clawster/cloud-providers build` — must succeed
2. `pnpm --filter @clawster/cloud-providers test` — all tests pass
3. `pnpm build` — full monorepo build succeeds
4. Deploy a test bot to Azure:
   - Verify VMSS creates and scales to 1
   - Verify cloud-init completes (check `/var/log/cloud-init-output.log`)
   - Verify Caddy responds on port 80 (HTTP) or 443 (HTTPS with domain)
   - Verify WebSocket connection works through Caddy
   - Verify NSG blocks direct access to port 18789
   - Verify Azure Files mount persists data across VM reimage
5. Auto-healing test: kill OpenClaw container, verify Docker restarts it within 5s
6. VMSS repair test: corrupt the health endpoint, verify VMSS replaces the instance and data persists

## Future Improvements

- **Custom VM image**: Pre-bake Docker + Sysbox + Caddy + Node.js into Azure Compute Gallery image → cloud-init drops from ~90s to ~10s, total deploy ~1.5 min
- **AKS (10+ bots)**: Sysbox daemonset + shared node pool → better density, $73/mo control plane amortized
- **Spot VMs**: Up to 90% savings for fault-tolerant bots (with Azure Files, eviction just triggers re-provision)
- **Reserved Instances**: 1-year 35% savings, 3-year 55% savings for steady-state bots
- **Shared Key Vault**: Cross-region replication for DR
- **Azure Front Door**: Global edge + WAF when scaling to multiple regions ($35/mo base)
