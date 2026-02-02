---
description: "Analysis of Clawster's current architecture, modules, DB models, and cloud providers"
globs: []
alwaysApply: false
---

# Clawster Current Codebase Analysis

## Architecture Overview

pnpm + Turbo monorepo with two apps and seven shared packages.

```
clawster/
├── apps/
│   ├── api/                  # NestJS 10.3 backend (port 4000)
│   └── web/                  # Next.js 14 frontend (port 3000)
├── packages/
│   ├── core/                 # Zod schemas, types, PolicyEngine, state-sync, AI gateway
│   ├── database/             # Prisma 5.8.1 + PostgreSQL, 40+ models
│   ├── adapters-aws/         # ECS, Secrets Manager, CloudWatch, Token Rotation
│   ├── cloud-providers/      # 6 providers + 7 deployment targets
│   ├── gateway-client/       # WebSocket-based OpenClaw Gateway protocol client
│   └── cli/                  # bootstrap, auth, doctor, status commands
├── scripts/                  # dev-start.sh, deploy.sh
├── clawster/infra/terraform/  # Full AWS IaC
└── .github/workflows/        # CI/CD pipelines
```

## API App — 34 Modules, 100+ Endpoints

### Module Inventory

| Module | Key Endpoints | Purpose |
|--------|---------------|---------|
| auth | POST /auth/login, register, GET /me | JWT + bcrypt |
| bot-instances | CRUD + restart/pause/resume/stop + bulk-action + compare + ai-gateway + live-state + evolution | Bot lifecycle & agent evolution |
| fleets | CRUD + health + status | Environment groupings |
| change-sets | CRUD + start/complete/fail/rollback + status | Rollout strategies (ALL/PERCENTAGE/CANARY) |
| traces | CRUD + tree + stats | Hierarchical execution tracing |
| audit | GET /audit | WHO did WHAT, WHEN |
| reconciler | ReconcilerService + ConfigGenerator + DriftDetection + LifecycleManager + Scheduler | OpenClaw-aware lifecycle reconciliation |
| manifests | CRUD per instance + reconcile trigger | Versioned configs |
| templates | CRUD | Built-in (Slack, Webhook, Minimal) + custom workspace templates |
| profiles | CRUD | Shared config defaults, priority-based merge, locked fields |
| overlays | CRUD + findApplicable | Per-bot/fleet/env/tag overrides with rollout & schedule |
| policy-packs | CRUD + evaluate | Security policy enforcement, auto-apply, version tracking |
| connectors | CRUD + test | Integration credentials (OpenAI, Slack, Discord, etc.), rotation scheduling |
| skill-packs | CRUD + attach/detach/sync | Skill bundles with MCP servers |
| channels | CRUD + bind/unbind + test + auth flows + generate-config | 8+ channel types with OAuth/QR pairing |
| dashboard | metrics + health + activity | Aggregated KPIs |
| metrics | GET /metrics | Prometheus-compatible |
| health | HealthService + OpenClawHealthService + HealthAggregator + DiagnosticsService + AlertingService + LogStreamingGateway | Full health stack with WebSocket log streaming |
| security | SecurityAuditService + InputSanitizer + ContentFilter + SkillVerification + ProvisioningChecklist | Multi-layer security scanning |
| slos | CRUD + SloEvaluator | SLO definitions (uptime, latency, error rate), breach detection |
| costs | CostEvents + Summaries + BudgetService | Token usage tracking, per-bot/fleet budgets, provider-aware (OpenAI/Anthropic/Google/Bedrock/Azure) |
| alerts | CRUD + acknowledge/resolve/suppress/remediate + RemediationService | Health alerts with auto-remediation |
| provisioning | ProvisioningEventsGateway + ProvisioningEventsService | WebSocket real-time provisioning events |
| debug | processes/gateway-probe/config/env/state-files/connectivity | Bot debug tooling |
| onboarding | status + complete | First-time setup workflows |
| agent-evolution | live-state + evolution + sync + AgentEvolutionScheduler | Live config drift detection, periodic state snapshots |
| pairing | list + approve/reject/revoke | Device pairing for DM access control |
| state-sync | status + upload/download | Multi-backend state sync (S3, R2, GCS, Azure Blob, Local) |
| user-context | User stage tracking | Onboarding stage management |
| notification-channels | CRUD /notification-channels + test | External notification destinations (Slack webhook, generic webhook, email) + delivery service |
| bot-routing | CRUD /bot-routing-rules + POST /delegate | Bot-to-bot routing rules + delegation execution with trace creation |

### Request Lifecycle
CORS → ThrottlerGuard (60s/100req) → ValidationPipe → JwtAuthGuard (if protected) → Controller → Service (Prisma) → Response

### Guards, Decorators, Middleware
- **JwtAuthGuard**: Global auth guard (`APP_GUARD`)
- **@Public()**: Bypass auth decorator
- **ThrottlerGuard**: Rate limiting
- **GlobalExceptionFilter**: Centralized error handling
- **ValidationPipe**: class-validator integration

### Scheduled Jobs
- Drift detection: every 5 minutes (ReconcilerScheduler)
- Stuck instance detection: every 1 minute
- Agent evolution snapshots: periodic (AgentEvolutionScheduler)
- SLO evaluation: periodic (SloEvaluatorService)

## Web App — 30 Routes, 75+ Components

### Pages

| Route | Status |
|-------|--------|
| / (Dashboard) | Working — KPI cards, health, fleet cards, setup checklist |
| /fleet | Working — legacy fleet view |
| /setup | Working — onboarding wizard |
| /bots | Working — list with bulk actions |
| /bots/new | Working — create bot |
| /bots/compare | Working — multi-bot comparison |
| /bots/[id] | Working — detail dashboard with tabs |
| /bots/[id]/debug | Working — debug tools |
| /fleets | Working — fleet list |
| /fleets/[id] | Working — fleet detail with health |
| /instances | Working — legacy instance list |
| /instances/new | Working — create instance |
| /instances/[id] | Working — instance detail |
| /profiles | Working — profile list |
| /profiles/new | Working — create profile |
| /profiles/[id] | Working — profile detail |
| /templates | Working — template gallery |
| /templates/[id] | Working — template detail |
| /changesets | Working — list + rollout control |
| /changesets/[id] | Working — changeset detail |
| /traces | Working — trace list |
| /traces/[id] | Working — trace tree viewer |
| /channels | Working — channel list + setup wizards |
| /connectors | Working — connector management |
| /policies | Working — policy packs |
| /overlays | Working — configuration overlays |
| /costs | Working — cost tracking + budgets |
| /slos | Working — SLO dashboard |
| /audit | Working — audit log with filters |
| /alerts | Working — alert management |
| /notifications | Working — notification channel management (Slack/webhook) |
| /routing | Working — bot routing rules configuration |

### Component Groups

| Category | Key Components |
|----------|----------------|
| UI Primitives | badge, button, card, input, select, table, tabs, progress, skeleton, charts, status-badge, connection-status, empty-state, time-display |
| Dashboard | metric-card, setup-checklist, single-bot-dashboard, just-deployed-banner |
| OpenClaw | config-editor, gateway-status, health-snapshot, log-viewer, channel-status, skill-selector, sandbox-config, deployment-target-selector, ai-gateway-toggle, qr-pairing, evolution-banner, evolution-diff, evolution-indicator, live-skills |
| Channels | channel-matrix, discord-setup, slack-setup, telegram-setup |
| Pairing | pairing-tab, active-devices, pending-list |
| Debug | config-viewer, connectivity-test, gateway-probe, process-list |
| Profiles | profile-form, profile-list, profile-detail, defaults-editor |
| Templates | template-card, template-grid, template-detail, template-preview-dialog |
| Onboarding | template-picker, channel-setup-step, deployment-step, review-step, deploy-progress |
| Deploy Wizard | deploy-wizard, step-template, step-channels, step-review, step-deploying, wizard-layout |
| Cost & SLOs | cost-breakdown, budget-gauge, slo-card, slo-form |
| Alerts | alert-card, alert-summary |
| Chat | bot-chat-panel (slide-over chat with any bot) |
| Config Editor | config-sections-editor (Identity, Tools, Channels, Model sections) |
| Routing | routing-rules-client (CRUD routing rules with source→target) |
| Notifications | notification settings page (channels, rules, test) |
| Provisioning | provisioning-screen, step-progress |

### Hooks & Context
- `use-gateway-websocket` — Gateway WebSocket connection
- `use-health-stream` — Real-time health updates
- `use-log-stream` — Log streaming
- `use-provisioning-events` — Provisioning event stream
- `websocket-context` — Global WebSocket management
- `user-stage-context` — User onboarding state
- `use-bot-chat` — Chat state management + API calls for bot chat relay

**UI stack**: Tailwind CSS 3.4 + shadcn/ui + Recharts 3.7 + Lucide icons + date-fns 4.1. SSR default with client-side for interactive pages.

## Database — 40+ Prisma Models

### Core Platform
Workspace → User, AuthUser, Fleet → BotInstance (status machine: CREATING → PENDING → RUNNING → DEGRADED → PAUSED → STOPPED → ERROR → DELETING → RECONCILING)

### Model Categories

| Category | Models |
|----------|--------|
| Core | Workspace, User, AuthUser, Fleet, BotInstance, Instance (legacy) |
| Config layers | Template, Profile, Overlay, PolicyPack, ManifestVersion |
| Integrations | IntegrationConnector, BotConnectorBinding, CredentialRotation |
| Channels | CommunicationChannel, BotChannelBinding, ChannelAuthSession |
| Change mgmt | ChangeSet, ManifestVersion |
| Observability | Trace, AuditEvent, DeploymentEvent |
| Skills | SkillPack, BotInstanceSkillPack |
| OpenClaw | GatewayConnection, OpenClawProfile, DeploymentTarget, SecurityAuditResult, HealthSnapshot, AgentStateSnapshot, DevicePairing |
| Cost & SLOs | SloDefinition, BudgetConfig, CostEvent, HealthAlert |
| Notifications | NotificationChannel, AlertNotificationRule |
| Routing | BotRoutingRule |

### Key Enums
- `UserRole`: OWNER, ADMIN, OPERATOR, VIEWER
- `FleetStatus`: ACTIVE, PAUSED, DRAINING, ERROR
- `BotStatus`: CREATING, PENDING, RUNNING, DEGRADED, STOPPED, PAUSED, DELETING, ERROR, RECONCILING
- `BotHealth`: HEALTHY, UNHEALTHY, UNKNOWN, DEGRADED
- `DeploymentType`: LOCAL, REMOTE_VM, DOCKER, ECS_FARGATE, CLOUD_RUN, ACI, KUBERNETES
- `OpenClawChannelType`: WHATSAPP, TELEGRAM, DISCORD, SLACK, SIGNAL, IMESSAGE, MATTERMOST, GOOGLE_CHAT, MS_TEAMS, LINE, MATRIX
- `GatewayConnectionStatus`: CONNECTED, DISCONNECTED, CONNECTING, ERROR
- `ChannelAuthState`: PENDING, PAIRING, PAIRED, EXPIRED, ERROR
- `PairingState`: PENDING, APPROVED, REJECTED, REVOKED, EXPIRED
- `SloMetric`: UPTIME, LATENCY_P50/P95/P99, ERROR_RATE, CHANNEL_HEALTH
- `SloWindow`: ROLLING_1H, ROLLING_24H, ROLLING_7D, ROLLING_30D, CALENDAR_DAY/WEEK/MONTH
- `CostProvider`: OPENAI, ANTHROPIC, GOOGLE, AWS_BEDROCK, AZURE_OPENAI, CUSTOM
- `AlertSeverity`: INFO, WARNING, ERROR, CRITICAL
- `AlertStatus`: ACTIVE, ACKNOWLEDGED, RESOLVED, SUPPRESSED

## Core Package — Zod Schemas + PolicyEngine + State Sync + AI Gateway

### OpenClaw Config Schemas (40+ schemas)
- `OpenClawConfigSchema`: Full OpenClaw config (agents, sessions, messages, tools, skills, plugins, gateway, logging, models, sandbox, bindings, credential guards, browser isolation)
- `OpenClawManifestSchema`: v2 manifest wrapper (apiVersion "clawster/v2", kind "OpenClawInstance")
- `ChannelsConfigSchema`: Multi-channel config with DM access policies, pairing settings
- `PolicySchema` / `PolicyPackSchema`: Policy evaluation engine, security rules
- `ModelsConfigSchema`: AI provider + model configuration (AI Gateway)
- `ConnectorSchema`, `FleetSchema`, `BotInstanceSchema`, `TemplateSchema`

### State Sync Module
- Backend interfaces for state synchronization
- Implementations: S3, R2, GCS, Azure Blob, Local
- Encryption utilities
- Sync scheduler

### Agent Evolution
- Live config tracking
- Drift detection between desired and live state
- Evolution history

### Build & Test
- **Build**: tsup (CJS + ESM + types)
- **Test**: Vitest, 85% line coverage, 88% function coverage

## Gateway Client Package — WebSocket Protocol Client

- `GatewayClient`: WebSocket-based RPC client with auto-reconnect (exponential backoff)
- **Protocol methods**: connect, health, status, configGet, configApply, configPatch, send, agent (streaming)
- **Event streams**: agentOutput, presence, keepalive, shutdown
- **Interceptor chain**: Audit, Logger, Telemetry, ErrorTransformer (composable middleware)
- **Error types**: GatewayError, GatewayConnectionError, GatewayTimeoutError, GatewayAuthError
- **Dependencies**: ws 8.16, uuid 9.0

## Cloud Providers — 6 Providers + 7 Deployment Targets

### Providers

| Provider | Status |
|----------|--------|
| AWS (ECS Fargate + Secrets Manager + CloudWatch) | Full |
| Azure (Container Instances + Key Vault + Log Analytics) | Implemented |
| GCP (Cloud Run + Secret Manager + Cloud Logging) | Implemented |
| DigitalOcean (App Platform) | Implemented (limited) |
| Self-Hosted (Docker + filesystem secrets) | Development |
| Simulated (In-memory) | Testing |

### Deployment Targets

| Target | Description |
|--------|-------------|
| Local | Local development |
| Remote VM | SSH-based deployment |
| Docker | Docker container |
| ECS Fargate | AWS Fargate |
| Kubernetes | K8s deployments |
| Cloudflare Workers | Edge deployment (Wrangler, R2 state sync) |

## AWS Adapters

- `EcsService`: createTaskDefinition (Fargate), createService (private subnets), updateService, deleteService, getServiceStatus
- `SecretsManagerService`: ensureSecretsForInstance at `/clawster/{workspace}/{instance}/{key}`
- `CloudWatchLogsService`: createLogGroup, getLogs, getConsoleLink
- `TokenRotationService`: Automated credential rotation with rollback

## CLI — 4 Commands

| Command | Purpose |
|---------|---------|
| `bootstrap` | Infrastructure provisioning |
| `doctor` | Health diagnostics |
| `status` | Status checks |
| `auth` | login, create-user, list, delete |

## Testing — 490 Test Files

| Category | Location | Framework |
|----------|----------|-----------|
| API unit tests | `apps/api/src/**/*.spec.ts` (51 files) | Jest |
| API integration tests | `apps/api/test/*.e2e-spec.ts` | Jest + Supertest |
| Web E2E tests | `apps/web/e2e/*.spec.ts` (9 flows) | Playwright |
| Core schemas | `packages/core/src/**/*.test.ts` | Vitest |
| Gateway client | `packages/gateway-client/src/__tests__/*.test.ts` | Jest |
| Cloud providers | `packages/cloud-providers/src/targets/__integration__/*.test.ts` | Jest |

### E2E Test Flows
dashboard, bot-flow, fleet-flow, multi-bot-flow, onboarding-flow, alerts-flow, costs-flow, slos-flow, websocket-integration

### Playwright Config
- Browsers: Chromium, Firefox, Safari, Mobile Chrome, Mobile Safari
- Parallel execution, screenshots on failure, video on retry
- Auto-start API + Web dev servers

## Infrastructure

- Docker Compose: PostgreSQL 16 + Redis 7
- Terraform: VPC, ALB, ECS Cluster, RDS, ElastiCache, IAM, S3
- CI/CD: GitHub Actions (CI, Build, Release, Docker)
- Multi-stage Docker builds with non-root users

## Authentication Flow

1. **Register**: POST /auth/register → bcrypt hash (10 rounds) → JWT → default role OPERATOR
2. **Login**: POST /auth/login → validate credentials → JWT `{ sub, username, role }` → accessToken (86400s TTL)
3. **Guard**: Global `JwtAuthGuard` via `APP_GUARD`, bypass with `@Public()`
4. **Roles**: OWNER, ADMIN, OPERATOR, VIEWER (defined but not fully enforced at endpoint level)

## What Aligns With Vision (can keep/extend)

- Fleet/BotInstance/Workspace/User models
- ChangeSet with rollout strategies (ALL/PERCENTAGE/CANARY)
- Audit events
- Policy pack framework with evaluation engine
- Connector framework with credential rotation
- Template → Profile → Overlay layering with deepMerge
- OpenClaw config schemas (v2 manifest, channels, skills, agents, gateway)
- Gateway client with WebSocket protocol, interceptors, and reconnect
- Multi-target deployment (Local, Docker, VM, ECS, K8s, Cloudflare Workers)
- Channel auth flows (OAuth, QR pairing)
- Device pairing for DM access control
- Agent evolution tracking and drift detection
- SLO definitions and breach detection
- Cost tracking with multi-provider support
- Health stack with OpenClaw health integration
- Security scanning (audit, sanitizer, content filter, skill verification)
- State sync with multi-backend support
- Web UI with full page coverage, deploy wizard, debug tools
- CI/CD, Docker, Terraform

## What Still Needs Work

1. **RBAC** — Roles defined but not fully enforced at endpoint level
2. **Reconciler** — OpenClaw-aware but needs deeper Gateway WS integration for real-time sync
3. **Legacy Instance model** — Still present alongside BotInstance, should be fully migrated
4. **Some deployment targets** — Kubernetes and Cloudflare Workers are implemented but need production hardening
