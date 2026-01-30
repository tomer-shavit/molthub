---
description: "10 work-package spec for transforming Molthub into a Moltbot-native operator layer"
globs: ["apps/api/src/**/*.ts", "packages/**/*.ts"]
alwaysApply: false
---

# Molthub Moltbot-Native Transformation Spec

## Overview

Transform Molthub from a cloud-generic container orchestrator into a **Moltbot-native operator layer** that integrates with Moltbot's real control surfaces: Gateway WebSocket protocol, `moltbot.json` config model, channel auth flows, health/doctor diagnostics, and systemd/launchd service management.

**10 work packages**, 6 can start immediately in parallel, 4 depend on Phase 1 outputs.

## Dependency Graph

```
Phase 1 (all start immediately):
  WP-01  Moltbot Config Schema ─────────────┐
  WP-02  Gateway WebSocket Client ───────────┤
  WP-03  Deployment Providers ───────────────┤
  WP-04  Channel Config System ──────────────┤
  WP-05  Policy Rules & Security ────────────┤
  WP-06  Database Schema Migration ──────────┘
                                              │
Phase 2 (start when deps ready):              ▼
  WP-07  Reconciler V2 ←── WP-01, WP-02, WP-03, WP-06
  WP-08  Templates & Config Generator ←── WP-01, WP-04
  WP-09  Web UI Moltbot Pages ←── WP-01, WP-06
  WP-10  Health & Observability ←── WP-02, WP-06
```

---

## WP-01: Moltbot Configuration Schema & Types

**Goal**: Define Zod schemas modeling the full Moltbot `moltbot.json` config surface. Replaces the current `InstanceManifestSchema` (which models CPU/memory/ECS) with schemas that represent Moltbot's actual config model.

**Dependencies**: None

**Scope**:
- Full Moltbot config Zod schemas: agents (list + defaults), sessions (scope, reset, pruning, compaction), messages (queue, TTS, streaming), channels (all 11 types with dmPolicy/groupPolicy/allowFrom), tools (profiles, groups, sandbox), skills/plugins, browser, models/providers, auth, logging, bindings, commands, gateway settings, heartbeat
- `MoltbotManifestSchema` (`apiVersion: "molthub/v2"`) wrapping Moltbot config with Molthub metadata (instance name, workspace, environment, labels, deployment target, profile name)
- Keep old `molthub/v1` schema alongside (deprecated)
- `$include` directive support (`z.lazy()` for recursive includes)
- Environment variable substitution type (`${VAR_NAME}`)
- Multi-instance profile isolation types: config path, state dir, workspace, port, port spacing validation (20+)

**Files**:
- Create: `packages/core/src/moltbot-config.ts` — Full config schema
- Create: `packages/core/src/moltbot-manifest.ts` — v2 manifest wrapper
- Create: `packages/core/src/moltbot-profile.ts` — Multi-instance isolation types
- Create: `packages/core/src/moltbot-channels.ts` — Channel-specific schemas
- Modify: `packages/core/src/index.ts` — New exports
- Create: `packages/core/src/__tests__/moltbot-config.test.ts`

**Exports for other WPs**:
- `MoltbotConfigSchema` / `MoltbotConfig` type
- `MoltbotManifestSchema` / `MoltbotManifest` type
- `MoltbotProfileConfig` type
- Fragment types: `MoltbotChannelConfig`, `MoltbotSkillConfig`, `MoltbotToolConfig`, `MoltbotSandboxConfig`, `MoltbotGatewayConfig`
- `validateMoltbotConfig()`, `validateMoltbotManifest()`

**Acceptance criteria**:
- `MoltbotConfigSchema.parse(realisticConfig)` validates successfully
- All 11 channel types have proper schemas with dmPolicy, groupPolicy, allowFrom
- Multi-instance profile config validates port spacing (20+)
- Old `molthub/v1` schemas still work unchanged
- 10+ config fixture tests covering channels, skills, tools, sandbox, gateway

**Key reference**: Moltbot config docs at `docs.molt.bot/gateway/configuration`. Config is JSON5 at `~/.clawdbot/moltbot.json`. Schema-validated at startup. Channels use discriminated union by type. dmPolicy enum: `"pairing" | "allowlist" | "open" | "disabled"`. Tool profiles: `"minimal" | "coding" | "messaging" | "full"`. Sandbox modes: `"off" | "non-main" | "all"`.

---

## WP-02: Gateway WebSocket Client Package

**Goal**: Create a TypeScript client library for Moltbot's Gateway WebSocket protocol (port 18789). This is the core transport for Molthub to communicate with every Moltbot instance.

**Dependencies**: None

**Scope**:
- `GatewayClient` class: WebSocket connect handshake (protocol version, client metadata, auth), method invocations, event streaming, keepalive, graceful disconnect
- All Gateway methods: `health` (snapshots), `status` (summaries), `presence` (deltas), `send` (messaging), `agent` (execution with two-stage ack), `config.get` (returns config + hash), `config.apply` (validate + write + restart), `config.patch` (JSON merge-patch)
- Event stream parsing: seq-tagged agent output, presence deltas, keepalive ticks, shutdown notifications
- `GatewayManager`: fleet-scale connection pool, tracks connections by instance ID, connection lifecycle management
- Auth support (token and password modes)
- Auto-reconnection with exponential backoff
- Timeout handling per method

**Files**:
- Create: `packages/gateway-client/` (new package)
  - `package.json`, `tsconfig.json`, `tsup.config.ts`
  - `src/client.ts` — `GatewayClient`
  - `src/manager.ts` — `GatewayManager` fleet pool
  - `src/protocol.ts` — Message types, method schemas, event types
  - `src/auth.ts` — Token/password auth
  - `src/errors.ts` — Typed errors (NOT_LINKED, AGENT_TIMEOUT, INVALID_REQUEST, UNAVAILABLE)
  - `src/__tests__/client.test.ts` — Tests with mock WS server
- Modify: `pnpm-workspace.yaml` — Add gateway-client

**Exports for other WPs**:
- `GatewayClient`, `GatewayManager`
- `GatewayHealthSnapshot`, `GatewayStatusSummary`, `GatewayPresence`
- `ConfigGetResult`, `ConfigApplyResult`, `ConfigPatchResult`
- `GatewayEvent` union type
- `GatewayConnectionOptions`

**Acceptance criteria**:
- Client connects to mock WS server and completes handshake
- `client.health()` / `client.status()` return parsed types
- `client.configGet()` returns config + hash
- `client.configApply(config)` handles validate/write/restart flow
- `client.configPatch(patch)` sends JSON merge-patch with hash
- Event streaming with `client.on('agentOutput', cb)` works
- Auto-reconnect after connection drop (tested with mock)
- `GatewayManager.getClient(instanceId)` returns pooled connection
- Package builds with tsup (CJS + ESM + DTS)

**Key reference**: Gateway uses WebSocket on default port 18789. Connect handshake includes protocol version bounds, client metadata, capabilities, auth. Methods return structured responses. Agent requests use two-stage pattern (ack then completion). Error codes: `NOT_LINKED`, `AGENT_TIMEOUT`, `INVALID_REQUEST`, `UNAVAILABLE`. Use `ws` npm package.

---

## WP-03: Deployment Provider Abstraction (Local/VM/Docker/K8s)

**Goal**: Extend the cloud provider system to support Moltbot-native deployment models: local machine (systemd/launchd), remote VM (SSH + systemd), Docker, and Kubernetes — all using Moltbot's actual installation and service management.

**Dependencies**: None

**Scope**:
- New `DeploymentTarget` interface alongside existing `CloudProvider`: `install()`, `configure(config)`, `start()`, `stop()`, `restart()`, `getStatus()`, `getLogs()`, `getEndpoint()`, `destroy()`
- `LocalMachineTarget`: detect OS (macOS/Linux/WSL2), use `moltbot gateway install --profile <name>`, systemd/launchd, SIGTERM/SIGUSR1, `moltbot doctor`
- `RemoteVMTarget`: SSH tunnel + same commands remotely, systemd user service with `loginctl enable-linger`
- `DockerContainerTarget`: Docker CLI, config mounted as volume, gateway port mapped, `CLAWDBOT_CONFIG_PATH` env var
- `KubernetesTarget`: generate Deployment + Service + ConfigMap manifests, `@kubernetes/client-node`
- `DeploymentTargetFactory.create(type, config)`
- `DeploymentTargetType` enum: `"local" | "remote-vm" | "docker" | "ecs-fargate" | "cloud-run" | "aci" | "kubernetes"`
- Existing `CloudProvider` implementations continue working

**Files**:
- Create: `packages/cloud-providers/src/interface/deployment-target.ts`
- Create: `packages/cloud-providers/src/targets/local/local-target.ts`
- Create: `packages/cloud-providers/src/targets/remote-vm/remote-vm-target.ts`
- Create: `packages/cloud-providers/src/targets/docker/docker-target.ts`
- Create: `packages/cloud-providers/src/targets/kubernetes/kubernetes-target.ts`
- Create: `packages/cloud-providers/src/targets/factory.ts`
- Modify: `packages/cloud-providers/src/index.ts` — Export new targets

**Exports for other WPs**:
- `DeploymentTarget` interface
- `DeploymentTargetType` enum
- `DeploymentTargetConfig` per-type config
- `DeploymentTargetFactory`
- All target implementations

**Acceptance criteria**:
- `LocalMachineTarget` detects OS and generates correct service manager commands
- `LocalMachineTarget.install()` produces `moltbot gateway install --profile <name>`
- `RemoteVMTarget` connects via SSH and executes commands
- `DockerContainerTarget` runs Moltbot container with correct volume mounts
- `KubernetesTarget` generates valid K8s manifests
- Factory creates correct target type from config
- Port spacing validation (20+ apart)
- Existing `SelfHostedProvider` unaffected

**Key reference**: `moltbot gateway install` creates systemd/launchd services. `--profile <name>` scopes config/state/workspace automatically. Service names: `bot.molt.<profile>` (macOS), `moltbot-gateway-<profile>.service` (Linux). SIGTERM for graceful shutdown, SIGUSR1 for hybrid reload. Use `ssh2` for SSH, `@kubernetes/client-node` for K8s.

---

## WP-04: Moltbot Channel Configuration System

**Goal**: Replace the generic `CommunicationChannel` system with Moltbot-native channel config that generates valid Moltbot channel blocks and handles auth flows (WhatsApp QR pairing, Telegram bot tokens, Discord setup).

**Dependencies**: None (WP-01 schemas will be imported later; use stub types initially)

**Scope**:
- Rewrite `ChannelsService` for all 11 Moltbot channel types: WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Mattermost, Google Chat, MS Teams, LINE, Matrix
- Model each channel's policies: dmPolicy, groupPolicy, allowFrom, per-group/guild config
- WhatsApp QR pairing flow: call `moltbot channels login` on instance, stream QR back to UI
- Telegram bot token setup, Discord bot token + guild config
- Generate Moltbot-compatible channel config JSON for `config.apply`
- Track channel auth state: `"pending" | "pairing" | "paired" | "expired" | "error"`
- Validate runtime compatibility (WhatsApp/Telegram require Node.js, not Bun)

**Files**:
- Rewrite: `apps/api/src/channels/channels.service.ts`
- Rewrite: `apps/api/src/channels/channels.dto.ts`
- Modify: `apps/api/src/channels/channels.controller.ts` — New auth flow endpoints
- Create: `apps/api/src/channels/channel-auth.service.ts`
- Create: `apps/api/src/channels/channel-config-generator.ts`
- Create: `apps/api/src/channels/channel-types.ts`

**Exports for other WPs**:
- `POST /channels/:id/auth/start` — Begin auth flow
- `GET /channels/:id/auth/status` — Poll auth state
- `POST /channels/:instanceId/generate-config` — Generate channel config block
- `generateChannelConfig()` function

**Acceptance criteria**:
- All 11 channel types configurable through API
- WhatsApp QR flow works: start → QR returned → poll until paired
- Generated config JSON passes Moltbot validation
- Runtime compatibility check blocks WhatsApp/Telegram on Bun
- Each channel has proper dmPolicy defaults

**Key reference**: WhatsApp uses `moltbot channels login` for QR pairing. dmPolicy default is `"pairing"` (one-hour codes). Telegram needs `botToken` / `tokenFile`. Discord needs `token` + guild config. Slack needs `botToken` + `appToken` for Socket Mode. WhatsApp/Telegram require Node.js (Bun not supported).

---

## WP-05: Moltbot-Specific Policy Rules & Security Audit

**Goal**: Extend PolicyEngine with Moltbot-specific security rules matching `moltbot security audit` and `moltbot doctor` checks. Replace cloud/infra-centric rules with Moltbot's three-layer security model.

**Dependencies**: None

**Scope**:
- New policy rule types:
  - `require_gateway_auth` — Token/password auth required
  - `require_dm_policy` — Not "open" in production
  - `require_config_permissions` — File permissions 600/700
  - `forbid_elevated_tools` — Elevated tools need allowFrom
  - `require_sandbox` — Docker sandbox in non-dev
  - `limit_tool_profile` — Not "full" in production
  - `require_model_guardrails` — Model restrictions for prod
  - `require_workspace_isolation` — Unique workspace per instance
  - `require_port_spacing` — 20+ port gap between instances
  - `forbid_open_group_policy` — Group policy restrictions
- Built-in packs: "Moltbot Security Baseline", "Moltbot Production Hardening", "Moltbot Channel Safety"
- `MoltbotSecurityAuditService`: structured findings with severity + suggested config patches
- `POST /security/audit` and `POST /security/audit/fix` endpoints

**Files**:
- Modify: `packages/core/src/policy-pack.ts` — New rule types
- Create: `packages/core/src/moltbot-policies.ts` — Built-in packs
- Modify: `packages/core/src/policy.ts` — Extend validation
- Create: `apps/api/src/security/security-audit.service.ts`
- Create: `apps/api/src/security/security-audit.controller.ts`
- Create: `apps/api/src/security/security-audit.module.ts`
- Create: `packages/core/src/__tests__/moltbot-policies.test.ts`

**Acceptance criteria**:
- 10+ Moltbot-specific rules defined and functional
- "open" dmPolicy in production = ERROR violation
- Missing gateway auth = ERROR violation
- "full" tool profile in production = WARNING
- Missing sandbox in production = WARNING
- Port spacing violations detected
- Fix suggestions return JSON merge-patches
- All rules have unit tests

---

## WP-06: Database Schema Migration

**Goal**: Evolve Prisma schema for Moltbot-native concepts while maintaining backwards compatibility.

**Dependencies**: None

**Scope**:
- New models:
  - `GatewayConnection` (instanceId unique, host, port, authMode, status, lastHeartbeat, configHash)
  - `MoltbotProfile` (profileName, configPath, stateDir, workspace, port, parentInstanceId)
  - `ChannelAuthSession` (instanceId, channelType, state, qrCodeData, expiresAt, pairedAt)
  - `DeploymentTarget` (type enum, config JSON, sshCredentials, kubeContext, status)
  - `SecurityAuditResult` (instanceId, findings JSON, auditedAt, configHash)
  - `HealthSnapshot` (instanceId, data JSON, capturedAt — time-series friendly)
- Modify `BotInstance`: add `deploymentTargetId`, `gatewayPort`, `profileName`, `moltbotVersion`, `configHash`, `deploymentType` enum (`LOCAL | REMOTE_VM | DOCKER | ECS_FARGATE | CLOUD_RUN | ACI | KUBERNETES`)
- Modify `Fleet`: add `defaultDeploymentTargetType`, make ECS fields optional
- All new fields on existing models have defaults (non-breaking migration)

**Files**:
- Modify: `packages/database/prisma/schema.prisma`
- Create: migration SQL (via `prisma migrate dev`)

**Acceptance criteria**:
- `prisma db push` succeeds
- Migration applies cleanly to existing database
- Existing BotInstance records not broken
- New models can be created/queried
- No foreign key violations

---

## WP-07: Reconciler V2 (Moltbot-Aware Lifecycle)

**Goal**: Rewrite reconciler to use Gateway WS for config apply, deployment targets for instance management, and Moltbot config schema for validation. Replaces ECS-only reconciliation.

**Dependencies**: WP-01, WP-02, WP-03, WP-06

**Scope**:
- Reconciliation flow:
  1. Load instance + desired manifest (v2)
  2. Validate against policy packs
  3. Generate `moltbot.json` from manifest
  4. Determine deployment target type
  5. New instance: install via target → write config → start gateway
  6. Existing instance: `config.get` via Gateway WS → compare hash → `config.apply` or `config.patch` if different
  7. Health check via Gateway WS `health`
  8. Update DB status
- Drift detection: Gateway WS `config.get` (hash comparison) + `status` instead of ECS task counts
- `moltbot doctor` endpoint for diagnostics/auto-repair
- SIGUSR1 hybrid reload for config-only changes, full restart for breaking changes
- Version management: `moltbot update` via target

**Files**:
- Rewrite: `apps/api/src/reconciler/reconciler.service.ts`
- Rewrite: `apps/api/src/reconciler/drift-detection.service.ts`
- Create: `apps/api/src/reconciler/config-generator.service.ts`
- Create: `apps/api/src/reconciler/lifecycle-manager.service.ts`
- Modify: `apps/api/src/reconciler/reconciler.module.ts`
- Modify: `apps/api/src/reconciler/reconciler.scheduler.ts`

**Exports**:
- `POST /instances/:id/reconcile`, `POST /instances/:id/doctor`, `POST /instances/:id/update`, `GET /instances/:id/drift`

**Acceptance criteria**:
- Generates valid `moltbot.json` from v2 manifest
- Applies config via Gateway WS `config.apply`
- Drift detection uses config hash comparison
- SIGUSR1 used for config-only changes
- Doctor endpoint returns structured diagnostics
- All actions create audit events
- ECS reconciler path kept as fallback for `ecs-fargate` deployment type

---

## WP-08: Moltbot-Native Templates & Config Generator

**Goal**: Replace generic templates with Moltbot-aware templates that generate valid `moltbot.json` configurations.

**Dependencies**: WP-01, WP-04

**Scope**:
- Built-in templates:
  - "WhatsApp Personal Bot" — WhatsApp + pairing, basic skills, sandbox
  - "Telegram Bot" — Telegram, coding profile, Docker sandbox
  - "Discord Server Bot" — Discord, per-guild config, messaging profile
  - "Slack Workspace Bot" — Slack Socket Mode, full profile
  - "Multi-Channel Bot" — WhatsApp + Telegram + Discord, shared skills
  - "Coding Assistant" — No channels, coding profile, elevated tools + sandbox
  - "Minimal Gateway" — API-only, minimal tools
- `ConfigGenerator`: template + user inputs → `moltbot.json` + `MoltbotManifest` + secret refs list
- Template preview endpoint (show config without applying)
- Template customization (override any field before generation)

**Files**:
- Rewrite: `apps/api/src/templates/templates.service.ts`
- Create: `apps/api/src/templates/config-generator.ts`
- Create: `apps/api/src/templates/builtin-templates.ts`
- Modify: `apps/api/src/templates/templates.dto.ts`
- Modify: `apps/api/src/templates/templates.controller.ts`

**Acceptance criteria**:
- Each template generates valid `moltbot.json` passing `MoltbotConfigSchema.parse()`
- Preview shows full config without side effects
- Secrets extracted as `${VAR_NAME}` references, never embedded
- Templates have sensible defaults for dmPolicy, sandbox, tools per use case

---

## WP-09: Web UI — Moltbot Instance Management Pages

**Goal**: Redesign web UI to show Moltbot-native info: Gateway connection status, health snapshots, channel auth state, config editor, live logs.

**Dependencies**: WP-01 (types), WP-06 (DB schema)

**Scope**:
- **Bot detail page** (`/bots/[id]`):
  - Gateway connection status (connected/disconnected, latency)
  - Moltbot health snapshot
  - Channel status with auth state (WhatsApp paired/pending QR)
  - Active skills/plugins, sandbox status, tool profile
  - Deployment target info instead of ECS ARNs
- **Config editor tab**: JSON5 editor, diff view (current vs desired), apply button, inline validation
- **Channel management tab**: per-channel status cards, WhatsApp QR during pairing, policy editor
- **Live log viewer**: WebSocket-based streaming, level filtering, search
- **Instance creation wizard** (5+ steps):
  1. Template selector
  2. Channel setup with auth flows
  3. Skill/plugin selection
  4. Tool profile + sandbox config
  5. Deployment target selection (local/VM/Docker/cloud)
  6. Review + config preview
- **Fleet list**: show deployment target types, Gateway connection counts

**Files**:
- Rewrite: `apps/web/src/app/bots/[id]/page.tsx`
- Create: `apps/web/src/components/moltbot/config-editor.tsx`
- Create: `apps/web/src/components/moltbot/channel-status.tsx`
- Create: `apps/web/src/components/moltbot/health-snapshot.tsx`
- Create: `apps/web/src/components/moltbot/gateway-status.tsx`
- Create: `apps/web/src/components/moltbot/log-viewer.tsx`
- Create: `apps/web/src/components/moltbot/qr-pairing.tsx`
- Create: `apps/web/src/components/moltbot/skill-selector.tsx`
- Create: `apps/web/src/components/moltbot/sandbox-config.tsx`
- Create: `apps/web/src/components/moltbot/deployment-target-selector.tsx`
- Rewrite: `apps/web/src/app/instances/new/page.tsx` — Creation wizard
- Modify: `apps/web/src/lib/api.ts` — New API methods

**Acceptance criteria**:
- Bot detail shows Gateway status instead of ECS ARN
- Health snapshot shows structured Moltbot health data
- Channel status shows per-channel auth state
- Config editor supports JSON5 with inline validation
- Live log viewer streams via WebSocket
- WhatsApp QR code displays during pairing
- Creation wizard covers all steps with valid output
- No CloudWatch/ECS references in new UI (except ECS deployment type)

---

## WP-10: Health, Observability & Diagnostics Dashboard

**Goal**: Moltbot-native health monitoring using Gateway WS health/status/doctor instead of ECS task counts. Fleet-wide aggregation, diagnostics, alerting, log streaming.

**Dependencies**: WP-02, WP-06

**Scope**:
- `MoltbotHealthService`: scheduled polling via Gateway WS `health` and `status` (default 30s interval)
- Store health snapshots in DB for trending
- Fleet health aggregation: healthy/degraded/unhealthy/unreachable counts
- `moltbot doctor` equivalent via API: config validation, service audit, auth checks
- Deep health check endpoint (Gateway WS `health --deep`)
- Alerting rules: unreachable, degraded >N min, config drift, channel auth expired
- Log streaming proxy: NestJS WebSocket gateway → Gateway WS logs → client SSE/WS
- Update dashboard with real Moltbot data instead of simulated metrics
- Security audit integration (on-demand or scheduled)

**Files**:
- Create: `apps/api/src/health/moltbot-health.service.ts`
- Create: `apps/api/src/health/health-aggregator.service.ts`
- Create: `apps/api/src/health/diagnostics.service.ts`
- Create: `apps/api/src/health/log-streaming.gateway.ts`
- Create: `apps/api/src/health/alerting.service.ts`
- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.ts`

**Exports**:
- `GET /instances/:id/health` — Real Moltbot health
- `GET /instances/:id/health/deep` — Deep check
- `GET /instances/:id/diagnostics` — Full diagnostics
- `WS /instances/:id/logs` — Live log stream
- `GET /fleet/:id/health` — Aggregated fleet health

**Acceptance criteria**:
- Health polling runs on schedule, stores snapshots
- Health data comes from real Gateway (not simulated)
- Fleet aggregation counts correctly
- Doctor diagnostics return structured results
- Log streaming WebSocket proxies Gateway logs
- Dashboard shows real data
- Alerting detects unreachable instances, prolonged degradation, config drift
- Historical health queryable by time range

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Gateway WS protocol docs may have gaps | WP-02 creates mock server; validate against real Moltbot early |
| Schema migration breaks existing data | WP-06 uses additive-only changes with defaults |
| Moltbot config surface is massive | WP-01 prioritizes channels/skills/tools/sandbox/gateway; remaining config passthrough |
| Channel auth flows need live Moltbot | WP-04 stubs execution; integration testing in WP-07 |
| Web UI scope creep | WP-09 prioritizes detail page + creation wizard; other pages follow-up |

## Verification

After all WPs complete:
1. `pnpm build` — All packages build cleanly
2. `pnpm test` — All tests pass
3. `pnpm db:push` — Schema applies to fresh DB
4. Create a bot instance via creation wizard → generates valid `moltbot.json`
5. Reconciler applies config to a local Moltbot instance via Gateway WS
6. Health dashboard shows real health from Gateway polling
7. Channel auth flow (WhatsApp QR) works end-to-end
8. Policy evaluation catches insecure configs
9. Drift detection identifies config hash mismatch
10. Live log streaming works in the UI
