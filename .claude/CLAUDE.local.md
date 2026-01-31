---
description: "Project context, architecture overview, and conventions for Molthub"
globs: []
alwaysApply: true
---

# Molthub - Project Context

## Project Goal

Molthub is an open-source, self-hosted control plane for running and operating a swarm of OpenClaws. It provides a single place to provision OpenClaw instances, configure them consistently, attach channels and integrations, enforce security guardrails, roll out changes safely, and get fleet-level visibility into health, logs, traces, cost, and quality. It integrates tightly with OpenClaw's real control surfaces: the Gateway WebSocket protocol, the `openclaw.json` config model, channel auth flows, health/doctor diagnostics, and systemd/launchd service management.

## Architecture Overview

pnpm + Turborepo monorepo with two apps and four shared packages:

```
molthub/
├── apps/
│   ├── api/                  # NestJS 10.3 backend (port 4000, 20+ modules, 70+ endpoints)
│   └── web/                  # Next.js 14 frontend (port 3000, Tailwind + shadcn/ui + Recharts)
├── packages/
│   ├── core/                 # Zod schemas, types, PolicyEngine
│   ├── database/             # Prisma 5.8.1 + PostgreSQL, 20+ models
│   ├── gateway-client/       # OpenClaw Gateway WebSocket client (new)
│   ├── adapters-aws/         # ECS, Secrets Manager, CloudWatch SDKs
│   ├── cloud-providers/      # 6 providers (AWS, Azure, GCP, DO, Self-Hosted, Simulated)
│   └── cli/                  # Bootstrap, auth, db, dev commands
├── scripts/                  # dev-start.sh, deploy.sh
└── molthub/infra/terraform/  # Full AWS IaC
```

### API Request Lifecycle

CORS → ValidationPipe → JwtAuthGuard (if protected) → Controller → Service (Prisma) → Response

### Database Core Model

Workspace → Fleet → BotInstance (status machine: CREATING → RUNNING → PAUSED/STOPPED/ERROR/DELETING)

Configuration layering: Template → Profile → Overlay → manifest (deepMerge)

## Key Concepts

- **Fleet**: Environment grouping of BotInstances with shared defaults and deployment target type
- **BotInstance**: A single OpenClaw with its own config, Gateway connection, profile, and deployment target
- **Template**: Starting point configs ("WhatsApp Personal Bot", "Discord Server Bot", etc.) that generate valid `openclaw.json`
- **Profile**: Shared config defaults ("Prod baseline", "EU residency baseline") with merge strategies
- **Overlay**: Small config deltas applied to a group, fleet, or single bot
- **Connector**: Reusable integration credential (Slack token, Telegram bot token, model provider API key) — bots attach to connectors, rotate once
- **Policy Pack**: Security guardrail rules evaluated against instance configs (e.g., forbid open dmPolicy in prod, require gateway auth)
- **ChangeSet**: Rollout strategy (ALL/PERCENTAGE/CANARY) for applying changes across a fleet
- **Deployment Target**: Where an OpenClaw runs — local (systemd/launchd), remote VM (SSH), Docker, ECS Fargate, Cloud Run, ACI, Kubernetes
- **Gateway Connection**: WebSocket link to a running OpenClaw instance (port 18789) for config apply, health, status, and logs

## OpenClaw Integration Essentials

- **Gateway WebSocket** on default port 18789 is the canonical transport for control and telemetry
- **Config model**: JSON5 at `~/.openclaw/openclaw.json`, schema-validated at startup. Sections: agents, sessions, messages, channels (11 types), tools, sandbox, skills, plugins, gateway, logging, bindings
- **Config RPC**: `config.get` (returns config + hash), `config.apply` (validate + write + restart, requires baseHash), `config.patch` (JSON merge-patch)
- **Health**: `health` method returns structured snapshot, `status` returns summary, `openclaw doctor` for diagnostics
- **Multi-instance isolation**: Use `--profile` to scope config/state/workspace. Port spacing must be 20+ apart
- **Service management**: macOS LaunchAgent (`bot.molt.<profile>`), Linux systemd user service (`openclaw-gateway-<profile>.service`)
- **Signals**: SIGTERM for graceful shutdown, SIGUSR1 for hybrid reload (config-only changes)
- **Channel auth**: WhatsApp uses QR pairing via `openclaw channels login`. WhatsApp and Telegram require Node.js (not Bun)
- **Security model**: Three-layer access control (identity verification → operational scope → model capability). dmPolicy default is `"pairing"`

## Important Conventions

- NestJS modules with controller/service/DTO pattern throughout `apps/api`
- Zod schemas in `packages/core` for all config validation
- Prisma as the sole database access layer in `packages/database`
- `@Public()` decorator to opt out of JWT auth on specific endpoints
- `deepMerge` with per-field strategies for Template → Profile → Overlay config layering
- All cloud providers implement a common interface; new deployment targets implement `DeploymentTarget` interface
- Tailwind CSS + shadcn/ui components for all frontend UI

## Things to Know Before Making Changes

- JWT_SECRET must be set as an environment variable (no fallback)
- All API endpoints require JWT auth by default; use `@Public()` decorator to opt out
- Helmet + rate limiting (100 req/60s) are globally applied
- Swagger docs only available in non-production environments
- Self-hosted provider uses Docker spawn (no shell exec) to prevent command injection
- ValidationPipe with `whitelist: true` strips unknown properties from DTOs
- OpenClaw config changes should use `config.apply` (with baseHash for optimistic concurrency) or `config.patch`, never direct file writes
- Port spacing of 20+ between Gateway instances is mandatory (derived ports: browser +2, canvas +4, CDP +11 through +110)
- Old `molthub/v1` manifest schema is deprecated but must remain functional alongside new `molthub/v2`

## Current State / Active Work

Transformation from cloud-generic container orchestrator to OpenClaw-native operator layer is in progress. Two phases with 10 work packages:

**Phase 1 (foundation, can run in parallel):**
- WP-01: OpenClaw Config Schema & Types (`packages/core`)
- WP-02: Gateway WebSocket Client (`packages/gateway-client`)
- WP-03: Deployment Provider Abstraction (local/VM/Docker/K8s)
- WP-04: Channel Configuration System (11 channel types + auth flows)
- WP-05: Policy Rules & Security (OpenClaw three-layer security model)
- WP-06: Database Schema Migration (new models: GatewayConnection, OpenClawProfile, ChannelAuthSession, DeploymentTarget, SecurityAuditResult, HealthSnapshot)

**Phase 2 (depends on Phase 1 outputs):**
- WP-07: Reconciler V2 — Gateway WS config apply + deployment targets (depends: WP-01, 02, 03, 06)
- WP-08: Templates & Config Generator — valid `openclaw.json` generation (depends: WP-01, 04)
- WP-09: Web UI OpenClaw Pages — Gateway status, health, config editor, channel auth (depends: WP-01, 06)
- WP-10: Health & Observability Dashboard — real OpenClaw health polling + diagnostics (depends: WP-02, 06)
