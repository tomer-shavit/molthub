---
description: "Clawster system architecture — how all pieces fit together for local and cloud deployments"
globs: []
alwaysApply: false
---

# Clawster Dream Architecture

This document explains **exactly** how Clawster works, end to end, for both local and cloud deployments. If you're adding a feature, read this first.

---

## The Big Picture

Clawster is a **control plane** for OpenClaw agents. It does NOT run inside OpenClaw. It sits alongside it and communicates over WebSocket.

There are always **two separate things running**:

1. **Clawster** (API + Web UI) — the management layer you interact with
2. **OpenClaw Gateway(s)** — the actual agent runtime(s) that Clawster manages

They talk to each other over the **OpenClaw Gateway WebSocket Protocol** on port 18789 (default).

```
┌─────────────────────────────────────────────────────┐
│                    USER                              │
│                      │                               │
│                      ▼                               │
│  ┌──────────────────────────────────┐                │
│  │         Clawster Web UI           │                │
│  │       (Next.js, port 3000)       │                │
│  │                                  │                │
│  │  - Deploy wizard                 │                │
│  │  - Bot dashboard                 │                │
│  │  - Channel management            │                │
│  │  - Health monitoring             │                │
│  │  - Config editing                │                │
│  └──────────────┬───────────────────┘                │
│                 │ HTTP                                │
│                 ▼                                     │
│  ┌──────────────────────────────────┐                │
│  │         Clawster API              │                │
│  │     (NestJS, port 4000)          │                │
│  │                                  │                │
│  │  - Bot lifecycle (CRUD)          │                │
│  │  - Reconciler (provision/update) │                │
│  │  - Config generator              │                │
│  │  - Health polling                │                │
│  │  - Drift detection               │                │
│  │  - Templates, profiles, overlays │                │
│  │  - Policy enforcement            │                │
│  │  - Audit, costs, SLOs            │                │
│  └──────────┬───────────────────────┘                │
│             │                                        │
│             │ Deployment Target Interface             │
│             │ (install / configure / start / stop)    │
│             │                                        │
│     ┌───────┴────────┐                               │
│     │                │                               │
│     ▼                ▼                               │
│  Infrastructure   WebSocket (ws://host:18789)        │
│  Management       Gateway Protocol                   │
│  (Docker CLI,     (health, status, config.get,       │
│   kubectl,         config.apply, config.patch,       │
│   aws ecs,         send, agent)                      │
│   systemctl)                                         │
│     │                │                               │
│     ▼                ▼                               │
│  ┌──────────────────────────────────┐                │
│  │      OpenClaw Gateway            │                │
│  │      (port 18789)                │                │
│  │                                  │                │
│  │  - Agent runtime                 │                │
│  │  - Channel connections           │                │
│  │    (WhatsApp, Telegram, etc.)    │                │
│  │  - Skills & tools                │                │
│  │  - Sandbox execution             │                │
│  │  - Config management             │                │
│  └──────────────────────────────────┘                │
└─────────────────────────────────────────────────────┘
```

---

## How OpenClaw Gets Installed

OpenClaw is **not bundled with Clawster**. It's an independent project installed separately:

```bash
# Linux/macOS
curl -fsSL https://openclaw.ai/install.sh | bash

# Windows
iwr -useb https://openclaw.ai/install.ps1 | iex

# Or via npm
npm install -g openclaw@latest
```

After installation, OpenClaw runs its own onboarding:

```bash
openclaw onboard --install-daemon
```

This sets up: model auth, gateway settings, channels, DM pairing, workspace, skills, and a background service (systemd on Linux, launchd on macOS).

**Key point**: OpenClaw already runs in its own Docker container or as a system service. Clawster doesn't need to containerize it — it needs to **connect to it and manage it**.

---

## The Two Deployment Modes

### Mode 1: Local (Currently the Only Enabled Option)

In the wizard, Local is the only selectable platform. AWS, Azure, and Google Cloud are visible but grayed out until those integrations are production-ready. This is the "Builder" persona from the UX dream — someone running OpenClaw on their own machine or a single server.

```
┌──────────────────────────────────────────────────┐
│              Single Machine / VM                  │
│                                                   │
│  ┌─────────────────────┐                          │
│  │   Clawster            │                          │
│  │   (single Docker     │                          │
│  │    container)        │     WebSocket             │
│  │                      │────────────────┐         │
│  │  API (4000)          │                │         │
│  │  Web (3000)          │                │         │
│  │  SQLite (embedded)   │                │         │
│  └─────────────────────┘                ▼         │
│                              ┌──────────────────┐ │
│                              │  OpenClaw         │ │
│                              │  Gateway          │ │
│                              │  (18789)          │ │
│                              │                   │ │
│                              │  Installed via:   │ │
│                              │  curl/npm/Docker  │ │
│                              └──────────────────┘ │
└──────────────────────────────────────────────────┘
```

**How it works:**

1. User installs OpenClaw independently (script or npm)
2. OpenClaw Gateway starts (as system service or Docker container)
3. User runs Clawster (single Docker container with API + Web + SQLite)
4. Clawster connects to the OpenClaw Gateway on `ws://localhost:18789`
5. Clawster manages config, monitors health, provides the dashboard

**Infrastructure management**: Clawster uses the `LocalMachineTarget` or `DockerContainerTarget`:
- **LocalMachineTarget**: Manages OpenClaw via systemd (Linux) or launchctl (macOS). Sends SIGUSR1 for config reload.
- **DockerContainerTarget**: Manages OpenClaw running in a Docker container via Docker CLI. Mounts config as a volume.

**Multiple bots on one machine**: Each bot gets:
- Its own OpenClaw profile (`--profile <name>`)
- Isolated config file (`OPENCLAW_CONFIG_PATH`)
- Isolated state directory (`OPENCLAW_STATE_DIR`)
- Separate workspace (`agents.defaults.workspace`)
- Unique port (spaced 20+ apart: 18789, 18809, 18829, ...)

```
Machine
├── OpenClaw Gateway (profile: support-bot, port 18789)
├── OpenClaw Gateway (profile: devops-bot, port 18809)
├── OpenClaw Gateway (profile: assistant, port 18829)
└── Clawster (connects to all three via WebSocket)
```

### Mode 2: Cloud Provider (Grayed Out in Wizard — Coming Soon)

For deploying OpenClaw gateways to remote infrastructure. Clawster still runs locally (or on a management server) and connects to remote gateways. These options (AWS, Azure, GCP) are visible in the wizard but disabled until each provider's integration is hardened.

```
┌─────────────────┐           ┌──────────────────────────┐
│  Clawster         │           │  Cloud / Remote Infra     │
│  (local or mgmt  │           │                           │
│   server)        │           │  ┌─────────────────────┐  │
│                  │  WebSocket│  │ OpenClaw Gateway     │  │
│  API (4000) ─────┼──────────┼─▶│ (Docker container    │  │
│  Web (3000)      │           │  │  or K8s pod or       │  │
│  SQLite          │           │  │  ECS task or         │  │
│                  │           │  │  CF Worker)          │  │
│                  │           │  │ Port 18789           │  │
└─────────────────┘           │  └─────────────────────┘  │
                              │                           │
                              │  ┌─────────────────────┐  │
                              │  │ OpenClaw Gateway #2  │  │
                              │  │ Port 18809           │  │
                              │  └─────────────────────┘  │
                              └──────────────────────────┘
```

**Supported cloud targets:**

| Target | How It Works | Status |
|--------|-------------|--------|
| **Docker** | Docker CLI on local/remote host. Config mounted as volume. | Ready |
| **Local** | systemd/launchctl on the same machine. | Ready |
| **Remote VM** | SSH to remote host, run Docker/systemd there. | Beta |
| **Kubernetes** | StatefulSet + ConfigMap + Service. kubectl applies manifests. | Beta |
| **ECS Fargate** | AWS task definition + service. Config in Secrets Manager. | Ready |
| **Cloudflare Workers** | Wrangler deploy. State in R2. | Beta |

**No Kubernetes required.** K8s is one option among many. The default (Docker or Local) is simpler and sufficient for most users.

---

## The Deployment Target Interface

Every cloud/infra target implements the same interface. This is the abstraction that makes multi-target deployment work.

```typescript
interface DeploymentTarget {
  install(options): Promise<InstallResult>;    // Install OpenClaw on the target
  configure(config): Promise<ConfigureResult>; // Write openclaw.json config
  start(): Promise<void>;                      // Start the gateway
  stop(): Promise<void>;                       // Stop the gateway
  restart(): Promise<void>;                    // Restart the gateway
  getStatus(): Promise<TargetStatus>;          // Is it running?
  getLogs(options?): Promise<string[]>;         // Get gateway logs
  getEndpoint(): Promise<GatewayEndpoint>;     // Where to connect (host:port)
  destroy(): Promise<void>;                    // Tear everything down
}
```

The `DeploymentTargetFactory` creates the right implementation based on config:

```typescript
const target = DeploymentTargetFactory.create({
  type: "docker",
  docker: {
    containerName: "openclaw-support-bot",
    imageName: "openclaw:local",
    configPath: "/var/openclaw/support-bot",
    gatewayPort: 18789,
  }
});
```

**All targets use CLI tools** (docker, kubectl, aws, wrangler) via `child_process.execFile`. No SDK dependencies for core operations.

---

## The Gateway WebSocket Protocol

This is how Clawster talks to running OpenClaw instances. It's the **only** runtime communication channel.

```
Clawster API                          OpenClaw Gateway
    │                                       │
    │  ── ws://host:18789 ──────────────▶   │
    │  { type: "connect",                   │
    │    auth: { mode: "token", token },    │
    │    protocolVersion: { min: 1, max: 1 }│
    │  }                                    │
    │                                       │
    │  ◀─────────────────────────────────   │
    │  { type: "connected",                 │
    │    presence, health, stateVersion }   │
    │                                       │
    │  ── health ───────────────────────▶   │
    │  ◀── { ok, channels, uptime } ────    │
    │                                       │
    │  ── config.get ───────────────────▶   │
    │  ◀── { config, hash } ────────────    │
    │                                       │
    │  ── config.apply ─────────────────▶   │
    │  { raw, baseHash }                    │
    │  ◀── { success, validationErrors } ── │
    │                                       │
    │  ◀── agentOutput (streaming) ──────   │
    │  ◀── presence (deltas) ────────────   │
    │  ◀── keepalive ────────────────────   │
    │  ◀── shutdown ─────────────────────   │
```

**Key RPC methods:**

| Method | Purpose | Used By |
|--------|---------|---------|
| `health` | Get channel health, uptime | Health polling (every 30s) |
| `status` | Get state, version, config hash | Drift detection |
| `config.get` | Get current config + hash | Before applying changes |
| `config.apply` | Replace entire config (optimistic concurrency via hash) | Reconciler |
| `config.patch` | Partial config update (merge-patch) | Quick config changes |
| `send` | Send message via channel | Message sending |
| `agent` | Execute agent (ack + streaming + completion) | Agent invocation, chat relay, bot-to-bot delegation |

**Concurrency control**: `config.apply` and `config.patch` require the current `baseHash`. If the hash doesn't match (someone else changed config), the call fails. This prevents lost updates.

The `GatewayManager` in Clawster pools WebSocket connections by instance ID. One connection per bot instance, reused across health checks, config updates, and other operations.

---

## Clawster Internal Architecture

### Monorepo Structure

```
clawster/
├── apps/
│   ├── api/                    # NestJS backend
│   │   └── src/
│   │       ├── bot-instances/  # Bot CRUD + lifecycle actions
│   │       ├── reconciler/     # Core orchestration engine
│   │       │   ├── reconciler.service.ts
│   │       │   ├── config-generator.service.ts
│   │       │   ├── lifecycle-manager.service.ts
│   │       │   ├── drift-detection.service.ts
│   │       │   └── reconciler-scheduler.ts
│   │       ├── onboarding/     # First-time setup wizard
│   │       ├── templates/      # Built-in + custom templates
│   │       ├── channels/       # Channel management + auth flows
│   │       ├── health/         # Health polling + diagnostics + alerting + notification delivery
│   │       ├── provisioning/   # Real-time provisioning events (WS)
│   │       ├── notification-channels/ # External notification destinations + delivery
│   │       ├── bot-routing/    # Bot-to-bot routing rules + delegation service
│   │       └── ... (34 modules total)
│   │
│   └── web/                    # Next.js frontend
│       └── src/
│           ├── app/            # App Router pages
│           ├── components/     # UI components
│           ├── hooks/          # WebSocket hooks
│           └── lib/            # API client, contexts
│
├── packages/
│   ├── core/                   # Zod schemas, types, PolicyEngine
│   ├── database/               # Prisma + SQLite
│   ├── gateway-client/         # WebSocket client for OpenClaw Gateway
│   ├── cloud-providers/        # Deployment target implementations
│   ├── adapters-aws/           # AWS-specific adapters
│   └── cli/                    # CLI tool
│
└── docker/
    └── openclaw/
        └── Dockerfile          # OpenClaw gateway Docker image
```

### The Reconciler — Core Orchestration Engine

The reconciler is the brain of Clawster. It takes a desired state (manifest) and makes reality match.

```
User clicks "Deploy" in wizard
         │
         ▼
BotInstancesService.create()
  → Creates BotInstance record (status: CREATING)
  → Stores desiredManifest
         │
         ▼
ReconcilerService.reconcile(instanceId)
  │
  ├── 1. Load BotInstance + manifest from DB
  │
  ├── 2. ConfigGeneratorService.generateOpenClawConfig(manifest)
  │      → Template defaults
  │      → Profile overrides
  │      → Overlay deltas
  │      → Secure defaults enforcement
  │      → Config hash generation (SHA-256)
  │
  ├── 3. Resolve DeploymentTarget
  │      → DeploymentTargetFactory.create(config)
  │      → Returns: LocalMachineTarget | DockerContainerTarget | ...
  │
  ├── 4. LifecycleManagerService.provision()
  │      ├── target.install()     → Install OpenClaw
  │      ├── target.configure()   → Write openclaw.json
  │      ├── target.start()       → Start gateway process
  │      ├── target.getEndpoint() → Get ws://host:port
  │      ├── GatewayClient.connect()
  │      └── GatewayClient.health()
  │
  ├── 5. Update DB: status=RUNNING, health=HEALTHY
  │
  └── 6. Store GatewayConnection + OpenClawProfile records
```

**For updates** (config changes to running instances):

```
Config change detected (hash mismatch)
         │
         ▼
LifecycleManagerService.update()
  ├── GatewayClient.configGet() → get current hash
  ├── GatewayClient.configApply({ raw, baseHash })
  └── Update DB with new configHash
```

**Scheduled jobs:**
- **Drift detection**: Every 5 minutes — compares desired config hash vs. live gateway hash
- **Stuck instance detection**: Every 1 minute — finds instances stuck in CREATING/RECONCILING
- **Health polling**: Every 30 seconds — calls `health` on all connected gateways
- **Agent evolution**: Periodic — snapshots live state for evolution tracking

### Configuration Layering

Config is assembled from multiple layers, merged in order:

```
Built-in Defaults (hardcoded secure baseline)
         │
         ▼
Template Defaults (support-bot, devops-bot, etc.)
         │
         ▼
Profile Overrides (fleet-wide shared config, with merge strategies)
         │
         ▼
Overlay Deltas (per-bot/fleet/env/tag, priority-ordered)
         │
         ▼
Instance Direct Overrides (user edits via UI/API)
         │
         ▼
Secure Defaults Enforcement (gateway auth, DM policy, sandbox)
         │
         ▼
Final OpenClawConfig → sent to gateway via config.apply
```

**Merge strategies** per field:
- `deep`: Recursively merge objects
- `replace`: Completely replace value
- `array-append`: Append to arrays
- `array-replace`: Replace entire array

**Locked fields**: Profiles can lock specific paths (e.g., `channels.whatsapp.dmPolicy`) to prevent instance-level overrides.

### Database (SQLite)

Key models and their relationships:

```
Workspace
  └── Fleet (environment grouping: dev/staging/prod)
       └── BotInstance (the core entity)
            ├── GatewayConnection (1:1) — ws://host:port, auth token, status
            ├── OpenClawProfile (1:1) — profile name, config path, state dir
            ├── ChannelAuthSession (1:many) — QR pairing, bot tokens
            ├── HealthSnapshot (1:many) — periodic health captures
            ├── AgentStateSnapshot (1:many) — live state for evolution tracking
            ├── DevicePairing (1:many) — DM access control
            ├── BotChannelBinding (1:many) → CommunicationChannel
            ├── BotConnectorBinding (1:many) → IntegrationConnector
            ├── BotInstanceSkillPack (1:many) → SkillPack
            ├── ChangeSet (1:many) — config rollouts
            ├── Trace (1:many) — execution traces
            ├── CostEvent (1:many) — token usage
            ├── SloDefinition (1:many) — uptime/latency targets
            └── HealthAlert (1:many) — alert history
```

**BotInstance status machine:**
```
CREATING → PENDING → RUNNING ↔ DEGRADED
                       ↕           ↕
                     PAUSED     RECONCILING
                       ↕
                    STOPPED → DELETING
                       ↕
                     ERROR
```

### Frontend Architecture

```
Next.js App Router
  │
  ├── Providers (nested):
  │   AuthProvider → WebSocketProvider → UserStageProvider
  │
  ├── Pages (server-side data fetching → client components):
  │   /              → Dashboard (adapts by stage: empty/getting-started/fleet)
  │   /setup         → Deploy wizard (full-screen, no sidebar)
  │   /bots          → Bot list
  │   /bots/[id]     → Bot detail (tabs: Overview, Channels, Pairing,
  │   │                              Config, Logs, Skills, Evolution)
  │   /fleets        → Fleet management
  │   /channels      → Channel management
  │   /templates     → Template gallery
  │   ... (30 routes total)
  │
  ├── WebSocket hooks:
  │   useGatewayWebSocket(instanceId) → generic WS connection
  │   useHealthStream(instanceId)     → real-time health (falls back to polling)
  │   useLogStream(instanceId)        → real-time log streaming
  │
  └── API client (lib/api.ts):
      Singleton ApiClient with 150+ methods, JWT auth, error handling
```

**Real-time data flow:**

```
WebSocketContext
  ├── Per-instance WebSocket connections
  ├── Reference counting (created on first subscriber, destroyed on last)
  ├── Auto-reconnect with exponential backoff
  ├── Heartbeat (ping every 30s)
  └── Event-based pub/sub for hooks
```

---

## The Wizard: Template = Platform + Channels

A **template** in Clawster is not just an agent personality — it's the **entire deployment configuration**: which platform to deploy on AND which channels to connect. The user picks everything in one flow and deploys.

### Wizard Flow

```
┌──────────────────────────────────────────────────────────┐
│  Step 1: Pick Your Platform                              │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Local   │  │   AWS    │  │  Azure   │  │  Google  │ │
│  │  Docker  │  │          │  │          │  │  Cloud   │ │
│  │          │  │ (grayed  │  │ (grayed  │  │ (grayed  │ │
│  │ ✓ Active │  │   out)   │  │   out)   │  │   out)   │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                          │
│  Platform-specific config appears here when selected:    │
│  - Local: no extra config needed                         │
│  - AWS: region, credentials, ECS cluster (future)        │
│  - Azure: resource group, subscription (future)          │
│  - GCP: project, region (future)                         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Step 2: Pick Your Channels (below platform selection)   │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │ WhatsApp   │  │ Telegram   │  │ Discord    │  ...    │
│  │ ☐ Enable   │  │ ☐ Enable   │  │ ☐ Enable   │         │
│  │            │  │ Bot token: │  │ Bot token: │         │
│  │ (QR after  │  │ [________] │  │ [________] │         │
│  │  deploy)   │  │            │  │            │         │
│  └────────────┘  └────────────┘  └────────────┘         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Bot name: [support-bot_______]                          │
│                                                          │
│  [Deploy]                                                │
└──────────────────────────────────────────────────────────┘
```

**Key design decisions:**

1. **Platform first, channels second.** The platform determines where the agent runs. Channels determine how it communicates. Together they form the complete template.
2. **Cloud options grayed out initially.** Only Local/Docker is enabled until cloud provider integration is production-ready. This prevents users from hitting broken paths.
3. **One template = platform + channels.** When saved, this combination becomes a reusable template. Users can create new bots from saved templates without re-picking platform and channels.
4. **Platform-specific config only appears when needed.** Local needs nothing extra. Cloud providers will show credential fields, region pickers, etc. when enabled.

### What Gets Sent to the API

```
POST /onboarding/deploy {
  botName: "support-bot",
  deploymentTarget: {
    type: "docker",              // from platform selection
    // cloud providers will add: region, credentials, etc.
  },
  channels: [
    { type: "telegram", config: { botToken: "..." } },
    { type: "discord", config: { botToken: "..." } }
  ]
}
```

### Template Storage

A template captures the full wizard state for reuse:

```typescript
Template {
  name: "Support Bot (Docker + Telegram)",
  deploymentTarget: { type: "docker" },
  channels: [
    { type: "telegram", config: { /* defaults */ } }
  ],
  agentConfig: { /* personality, skills, goals */ }
}
```

When creating a new bot from a template, the wizard pre-fills platform and channels from the template. The user can modify before deploying.

---

## Provisioning Flow: Step by Step

When a user clicks Deploy in the wizard:

### 1. Frontend → API

```
POST /onboarding/deploy {
  botName: "support-bot",
  deploymentTarget: { type: "docker" },
  channels: [{ type: "telegram", config: { botToken: "..." } }]
}
```

### 2. API (Onboarding → Reconciler)

```
OnboardingService.deploy()
  → Creates BotInstance record (with deployment target + channels from wizard)
  → Triggers ReconcilerService.reconcile()
  → Emits provisioning events via WebSocket
```

### 3. Provisioning Events (Real-Time)

The frontend polls `GET /provisioning/:instanceId/status` every 3 seconds and displays step progress:

```
Steps:
  [✓] Validate configuration
  [✓] Security audit
  [✓] Pull image / Install OpenClaw
  [✓] Write configuration
  [✓] Start container / Start service
  [✓] Wait for gateway connection
  [✓] Health check
```

### 4. Runtime

After provisioning completes:
- Health polling starts (every 30s)
- Drift detection starts (every 5min)
- Agent evolution snapshots start (periodic)
- WebSocket connection maintained in GatewayManager pool
- Dashboard shows live bot status

---

## Config Transformation: Clawster → OpenClaw

Clawster generates `openclaw.json` from its internal schema. Key transformations:

| Clawster Internal | OpenClaw Config | Notes |
|-----------------|-----------------|-------|
| `gateway.host` | `gateway.bind` | OpenClaw uses "bind" not "host" |
| `sandbox` (root) | `agents.defaults.sandbox` | Different nesting |
| `skills.allowUnverified` | (removed) | Not a valid OpenClaw key |
| `host: "127.0.0.1"` | `bind: "loopback"` | String mapping |

The `ConfigGeneratorService` handles all transformations. The `DockerContainerTarget.configure()` also applies Docker-specific transformations when writing config to the mounted volume.

---

## Security Architecture

### Layers (inherited from OpenClaw)

1. **Gateway Auth**: Token-based auth for all WebSocket connections. Auto-generated on deploy.
2. **DM Policies**: `pairing` (default) — unknown senders get one-hour codes. `allowlist`, `open`, `disabled`.
3. **Sandbox**: Docker isolation for tool execution. Modes: `off`, `non-main`, `all`.
4. **Tool Restrictions**: Allow/deny lists per tool. Elevated execution with `allowFrom` restrictions.
5. **File Permissions**: Config 600, state dir 700.

### Clawster additions

- **PolicyEngine**: Validates manifests against policy packs before deployment
- **Secure defaults enforcement**: Gateway auth required, DM pairing by default, logging redaction
- **Security audit**: Scans for plaintext secrets, permission issues, misconfigurations
- **Credential rotation**: Scheduled rotation with blast radius tracking

---

## Bot-to-Bot Delegation Architecture

When a user sends a message to Bot A and routing rules match, Clawster can delegate the message to Bot B before or instead of processing it with Bot A.

```
User → Chat API (POST /bot-instances/:id/chat)
         │
         ▼
  BotDelegationService.attemptDelegation(sourceBotId, message)
         │
         ├── Query BotRoutingRules for sourceBotId (enabled, priority-ordered)
         ├── Regex match message against triggerPattern
         │
         ├── [No match] → Proceed to source bot via GatewayClient.agent()
         │
         └── [Match found] →
              ├── Create Trace record (type: TASK, metadata.delegationType: "delegation")
              ├── Send message to target bot via GatewayClient.agent()
              ├── Return delegation result (targetBotId, response, traceId)
              └── Source bot is NOT invoked (delegation replaces)
```

Delegation traces are visible in the traces UI with a visual chain: User → Source Bot → Target Bot → Response.

---

## External Notifications Architecture

When an alert fires (health degraded, token spike, budget threshold), the notification delivery service sends to configured channels.

```
AlertingService.evaluateAlerts() (cron every 60s)
  │
  ├── evaluateHealthAlerts()
  ├── evaluateTokenSpikeAlerts()
  └── evaluateBudgetThresholds()
         │
         ▼
  upsertAlertAndNotify(alert)
    ├── alertsService.upsertAlert() → DB
    └── notificationDeliveryService.deliverAlert() → fire-and-forget
           │
           ├── Query AlertNotificationRules matching severity/alertRule
           ├── For each matching rule → get NotificationChannel
           │
           ├── SLACK_WEBHOOK → Format as Slack Block Kit → HTTP POST to webhook URL
           ├── WEBHOOK → Format as JSON → HTTP POST with optional headers/secret
           └── EMAIL → (future: SMTP delivery)
```

---

## For Feature Developers: What to Know

### Adding a new deployment target

1. Create a new class implementing `DeploymentTarget` in `packages/cloud-providers/src/targets/`
2. Add the type to `DeploymentTargetType` enum
3. Add config type to the `DeploymentTargetConfig` discriminated union
4. Register in `DeploymentTargetFactory`
5. Add resolution logic in `LifecycleManagerService.resolveTarget()`

### Adding a new channel type

1. Add the type to `OpenClawChannelType` enum in `packages/core/`
2. Add Zod schema in `packages/core/src/schemas/`
3. Add channel metadata in `apps/api/src/channels/`
4. Add auth flow if needed (QR, OAuth, token)
5. Add UI components in `apps/web/src/components/channels/`

### Modifying bot lifecycle

1. The reconciler is the source of truth — changes flow through `ReconcilerService`
2. Config changes go through `ConfigGeneratorService` → `LifecycleManagerService`
3. All communication with running gateways goes through `GatewayClient` (never direct)
4. Status updates must update both `BotInstance` and `GatewayConnection` records

### Adding a new API endpoint

1. Follow NestJS patterns: Controller → Service → Prisma
2. Use DTOs with class-validator for input validation
3. Protected by default (JwtAuthGuard). Use `@Public()` to opt out.
4. Rate limited (100 req/60s) by ThrottlerGuard

### Adding frontend features

1. Server-side data fetching in page.tsx → pass as props to client components
2. Real-time data via WebSocket hooks (useHealthStream, useLogStream)
3. API calls via the singleton `api` client in `lib/api.ts`
4. Follow progressive disclosure: check `useUserStage()` to show appropriate UI

---

## Key Invariants

These must always be true. If your change breaks any of these, something is wrong.

1. **Clawster never runs inside OpenClaw.** They are separate processes communicating over WebSocket.
2. **OpenClaw is installed independently.** Via its own installer script, npm, or Docker. Clawster doesn't bundle it.
3. **All runtime communication goes through the Gateway WebSocket Protocol.** No SSH, no exec into containers, no file reads from running instances.
4. **Config changes use optimistic concurrency.** Always `config.get` for the hash before `config.apply`.
5. **Port spacing of 20+ between instances.** Each OpenClaw gateway needs a range of derived ports.
6. **Profile isolation is mandatory for multi-instance.** Each bot gets its own config path, state dir, workspace, and port range.
7. **The reconciler is the single path for infrastructure changes.** Don't bypass it to manage deployment targets directly.
8. **SQLite is the database.** Embedded, zero-dependency. No PostgreSQL or external DB required.
9. **Security defaults are enforced, not optional.** Gateway auth, DM pairing, and sandbox are always configured.
10. **No Kubernetes required.** K8s is one optional deployment target. The default path is Docker or Local.
