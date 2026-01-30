---
description: "Analysis of Molthub's current architecture, modules, DB models, and cloud providers"
globs: []
alwaysApply: false
---

# Molthub Current Codebase Analysis

## Architecture Overview

pnpm + Turbo monorepo with two apps and four shared packages.

```
molthub/
├── apps/
│   ├── api/                  # NestJS 10.3 backend (port 4000)
│   └── web/                  # Next.js 14 frontend (port 3000)
├── packages/
│   ├── core/                 # Zod schemas, types, PolicyEngine
│   ├── database/             # Prisma 5.8.1 + PostgreSQL, 20+ models
│   ├── adapters-aws/         # ECS, Secrets Manager, CloudWatch SDKs
│   ├── cloud-providers/      # 6 providers (AWS, Azure, GCP, DO, Self-Hosted, Simulated)
│   └── cli/                  # Bootstrap, auth, db, dev commands
├── scripts/                  # dev-start.sh, deploy.sh
├── molthub/infra/terraform/  # Full AWS IaC
└── .github/workflows/        # CI/CD pipelines
```

## API App — 20+ Modules, 70+ Endpoints

### Key Modules

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| auth | POST /auth/login, register, GET /me | JWT + bcrypt |
| fleets | CRUD + health + status | Environment groupings |
| bot-instances | CRUD + restart/pause/resume/stop + dashboard | Bot lifecycle |
| change-sets | CRUD + start/complete/fail/rollback + status | Rollout strategies (ALL/PERCENTAGE/CANARY) |
| traces | CRUD + tree + stats | Hierarchical execution tracing |
| audit | GET /audit | WHO did WHAT, WHEN |
| reconciler | POST /reconciler/reconcile/:id | ECS-level drift detection + reconciliation |
| manifests | CRUD per instance + reconcile trigger | Versioned configs |
| templates | List + get + create | 3 built-in (Slack, Webhook, Minimal) |
| profiles | CRUD | Shared config defaults, merge strategies |
| overlays | CRUD + findApplicable | Per-bot/fleet/env/tag overrides |
| policy-packs | CRUD + evaluate | required_field, forbidden_field rules |
| connectors | CRUD + test | 21+ connector types |
| skill-packs | CRUD + attach/detach/sync | Skill bundles with MCP servers |
| channels | CRUD + bind/unbind + test | 8 channel types |
| dashboard | metrics + health + activity | Aggregated KPIs |
| metrics | GET /metrics | Prometheus-compatible |
| health | GET /health | DB + AWS check |

### Request Lifecycle
CORS → ValidationPipe → JwtAuthGuard (if protected) → Controller → Service (Prisma) → Response

### Scheduled Jobs
- Drift detection: every 5 minutes
- Stuck instance detection: every 1 minute

## Web App — 18 Routes

| Page | Status |
|------|--------|
| / (Dashboard) | Working — KPI cards, health, fleet cards |
| /fleets, /fleets/[id] | Working — list + detail with health |
| /bots, /bots/[id] | Working — list + detail with 5 tabs |
| /traces, /traces/[id] | Working — list + tree viewer |
| /changesets, /changesets/[id] | Working — list + rollout control |
| /audit | Working — timeline with filters |
| /templates | Placeholder "Coming Soon" |
| /profiles | Placeholder "Coming Soon" |
| /overlays | Placeholder "Coming Soon" |
| /policies | Placeholder "Coming Soon" |
| /connectors | Placeholder "Coming Soon" |

**UI stack**: Tailwind CSS + shadcn/ui components + Recharts + Lucide icons. No global state management. SSR default with client-side for interactive pages.

## Database — 20+ Prisma Models

**Core**: Workspace → Fleet → BotInstance (status machine: CREATING → RUNNING → PAUSED/STOPPED/ERROR/DELETING)

**Configuration layers**: Template → Profile → Overlay → manifest (deepMerge)

**Key models**: Workspace, User, AuthUser, Fleet, BotInstance, Instance (legacy), ManifestVersion, Profile, Overlay, PolicyPack, IntegrationConnector, BotConnectorBinding, ChangeSet, Trace, AuditEvent, DeploymentEvent, Template, SkillPack, BotInstanceSkillPack, CommunicationChannel, BotChannelBinding, CredentialRotation

## Core Package — Zod Schemas + PolicyEngine

- `InstanceManifestSchema`: apiVersion "molthub/v1", kind "MoltbotInstance", metadata + spec (runtime with CPU/memory/replicas, secrets, channels, skills, network, observability, policies)
- `PolicyEngine` (legacy): Hardcoded checks — forbid public admin, require Secrets Manager, block :latest tags
- `PolicyPack` (new): 20+ rule types, 2 built-in packs (security-baseline, production-guardrails)
- Template/Profile/Overlay: deepMerge with per-field strategies

## Cloud Providers

| Provider | Service | Status |
|----------|---------|--------|
| AWS | ECS Fargate + Secrets Manager + CloudWatch | Full |
| Azure | Container Instances + Key Vault + Log Analytics | Implemented |
| GCP | Cloud Run + Secret Manager + Cloud Logging | Implemented |
| DigitalOcean | App Platform | Implemented (limited) |
| Self-Hosted | Docker + filesystem secrets | Development |
| Simulated | In-memory | Testing |

## AWS Adapters

- `ECSService`: createTaskDefinition (Fargate), createService (private subnets), updateService, deleteService, getServiceStatus
- `SecretsManagerService`: ensureSecretsForInstance at `/molthub/{workspace}/{instance}/{key}`
- `CloudWatchLogsService`: createLogGroup, getLogs, getConsoleLink

## CLI

Commands: init/bootstrap, status, doctor, auth (create-user/login/list/delete), db (start/migrate/status), dev (api/web/all), provider list

## Infrastructure

- Docker Compose: PostgreSQL 16 + Redis 7
- Terraform: VPC, ALB, ECS Cluster, RDS, ElastiCache, IAM, S3
- CI/CD: GitHub Actions (CI, Build, Release, Docker)
- Multi-stage Docker builds with non-root users

## What Aligns With Vision (can keep/extend)

- Fleet/BotInstance/Workspace/User models
- ChangeSet with rollout strategies (ALL/PERCENTAGE/CANARY)
- Audit events
- Policy pack framework
- Connector framework
- Template → Profile → Overlay layering with deepMerge
- Web UI shell, navigation, design system
- CI/CD, Docker, Terraform

## What Conflicts With Vision (needs replacing)

1. **Manifest schema** — Models CPU/memory/ECS, not Moltbot config
2. **Reconciler** — ECS-level only, no Gateway WS integration
3. **Health checks** — ECS task counts, not Moltbot health/status/doctor
4. **Templates** — Generic container specs, not Moltbot configs
5. **Channels** — Generic channel store, no Moltbot channel config generation or auth flows
6. **Policy rules** — Cloud/infra rules, not Moltbot security model
7. **RBAC** — Roles defined but not enforced at endpoint level
8. **No Gateway integration** — No WebSocket client for Moltbot control
9. **No deployment targets** — No local/VM/systemd/launchd support
10. **No Moltbot diagnostics** — No doctor/status/health wrapping
