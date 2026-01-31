# Molthub Production-Grade Master Plan

## Handover: Read Before Implementing

Before starting any work on this plan, read these docs **in order**. They provide the full context needed to make correct implementation decisions.

### 1. UX Dream (North Star)
**File**: `.claude/docs/ux-dream.md`
**Why**: This is the north star for every UI decision. It defines 12 core UX principles, 3 user stages (0 agents, 1-3 agents, 4+ agents), anti-patterns to avoid, and the screen-by-screen journey. Every feature in Phase 2 maps to one or more of these principles. If a design choice conflicts with this doc, the doc wins.

**Key concepts to internalize**:
- Progressive disclosure — UI adapts to user's agent count
- Bidirectional awareness — agents evolve autonomously, Molthub reflects their live state
- The wizard is the front door — same flow for 1st agent and 10th agent
- OpenClaw-native language — Gateway health, not container status; Channels, not integrations
- No fake data — empty states are honest, not filled with zeros

### 2. OpenClaw Technical Reference
**File**: `.claude/docs/openclaw-reference.md`
**Why**: Defines Gateway WebSocket protocol (port 18789, methods: `health`, `status`, `config.get`, `config.apply`, `config.patch`, `agent`, `send`), config model (JSON5 with 15+ sections), channel types (WhatsApp/Telegram/Discord/Slack + more), security model (3-layer access control), and health/diagnostics. Every backend service must use these real surfaces — no abstractions that don't map to OpenClaw's actual protocol.

**Key concepts to internalize**:
- Gateway WS methods and their request/response shapes
- Config sections: `channels`, `tools`, `skills`, `sandbox`, `session`, `gateway`, `agents`
- DM policies: `pairing` (default), `allowlist`, `open`, `disabled`
- Profile isolation: `OPENCLAW_CONFIG_PATH`, `OPENCLAW_STATE_DIR`, port spacing 20+

### 3. Current Codebase Analysis
**File**: `.claude/docs/current-codebase-analysis.md`
**Why**: Maps the full monorepo structure — NestJS API (20+ modules, 70+ endpoints), Next.js frontend (18 routes), Prisma schema (20+ models), cloud providers (6 targets), core package (Zod schemas + PolicyEngine). Shows what aligns with the vision and what conflicts.

**Key architecture patterns**:
- Backend: NestJS module → controller → service → Prisma
- Frontend: Next.js 14 app router, server components by default, client components for interactivity
- Schemas: Zod in `packages/core/`, DTOs in API controllers
- UI: Tailwind + shadcn/ui + Recharts + Lucide icons

### 4. Molthub Vision
**File**: `.claude/docs/molthub-vision.md`
**Why**: Product vision — deploy anywhere, secure by default, autonomous agents with personality, teams with hierarchy, observable and controllable. Defines who it's for (solo operators, small teams, enterprises) and the "one-person corporate" vision.

### 5. This Plan
**File**: This document (`.claude/plans/structured-wandering-thacker.md`)
**Why**: The implementation roadmap. Phase 1 is complete (8 WPs, PRs #5-#12). Phase 2 is COMPLETE — 8/8 WPs done: WP2.5+WP2.6 (PR #13), WP2.8 (PR #14), WP2.3 (PR #15), WP2.7 (PR #16), WP2.1 (PR #17), WP2.2+WP2.4 (PR #18). Phase 3 is 5 WPs for polish.

### 6. Workflow Rules
**File**: `.claude/CLAUDE.md`
**Why**: Mandatory development workflow — read docs → explore → plan → implement with parallel agents → E2E tests → automated code review → verify against docs → create PR. Never skip tests. Never skip review.

### 7. What's Already Been Built (Current State)

**Phase 1 — COMPLETE** (PRs #5–#12): WebSocket integration, Gateway interceptors, debug endpoints, provisioning UX, unit tests, channel auth.

**Phase 2 — IN PROGRESS** (PRs #13, #14, #15, #16):

**WP2.5 (Progressive Disclosure Shell)** — COMPLETE (PR #13):
- Backend: `GET /user-context` endpoint in `apps/api/src/user-context/` (controller + service + module). Computes user stage from agent count + fleet count. Stage thresholds: 0 → `"empty"`, 1-3 → `"getting-started"`, 4+ or multiple fleets → `"fleet"`. Threshold constant: `FLEET_STAGE_THRESHOLD = 4`.
- Frontend: `UserStageProvider` context in `apps/web/src/lib/user-stage-context.tsx`. Wrapped at root layout via `user-stage-provider-wrapper.tsx`. `useUserStage()` throws if used outside provider.
- Sidebar (`apps/web/src/components/layout/sidebar.tsx`): Filters nav items by stage. Empty = null (no sidebar). Getting-started = Dashboard, Bots, Channels. Fleet = all items. "Deploy New Bot" button always present.
- DashboardLayout (`apps/web/src/components/layout/dashboard-layout.tsx`): Client component, hides sidebar for "empty" stage.
- Single-tenant workspace scoping (same `findFirst()` pattern as OnboardingService). TODO comment for multi-tenant.

**WP2.6 (Universal Deploy Wizard)** — COMPLETE (PR #13):
- Unified `DeployWizard` component in `apps/web/src/components/deploy-wizard/`. 4-step flow: Template+Name → Channels → Review → Deploying.
- `WizardLayout` — full-screen, no sidebar chrome. Used by both `/setup` (isFirstTime=true) and `/bots/new` (isFirstTime=false).
- Bot name validation: regex `^[a-zA-Z0-9][a-zA-Z0-9_-]*$`, maxLength 63, enforced at input level and in `canProceed()`.
- `StepDeploying` uses `useProvisioningEvents` hook directly (single polling source). Shows error/timeout state with retry button via `onRetryDeploy` callback.
- Deleted: `apps/web/src/app/setup/setup-wizard.tsx` (replaced by unified wizard).
- Terminology: "OpenClaw" is the agent brand (not OpenClaw). This is correct throughout.

**WP2.8 (Next-Step Guidance & Empty States)** — COMPLETE (PR #14):
- Created reusable `EmptyState` component (`apps/web/src/components/ui/empty-state.tsx`) with icon, title, description, CTA buttons.
- `SetupChecklist` on dashboard for "getting-started" users (`apps/web/src/components/dashboard/setup-checklist.tsx`). Uses `useUserStage()` context. Self-hides when all steps complete.
- `JustDeployedBanner` for bots < 5 min old (`apps/web/src/components/dashboard/just-deployed-banner.tsx`). Auto-dismisses with timer cleanup.
- `ContextualSuggestions` on bot detail page (`apps/web/src/components/bots/contextual-suggestions.tsx`). Derives next actions from bot state (no channels → "Add channel", unhealthy → "Run diagnostics", etc.). Max 3 suggestions.
- `NoChartData` component replaces mock chart data honestly (`apps/web/src/components/ui/charts.tsx`). Charts show "Not enough data to display" instead of flat lines.
- Empty states added to Channels, Fleets, Alerts pages. No fake data — costs say "No cost data yet", trends only shown with real data.
- Removed all hardcoded trend props from MetricCard instances on dashboard.

**WP2.3 (Templates & Profiles Web Pages)** — COMPLETE (PR #15):
- Extended API client (`apps/web/src/lib/api.ts`) with `createTemplate`, `previewTemplateConfig`, `getProfile`, `createProfile`, `updateProfile`, `deleteProfile` methods + types (`TemplateRequiredInput`, `TemplateChannelPreset`, `TemplateConfigPreview`, `CreateTemplatePayload`, `CreateProfilePayload`, `UpdateProfilePayload`).
- Template grid page with category filter tabs (All/Communication/Development/Operations/Minimal) and search (`apps/web/src/components/templates/template-grid.tsx`).
- Template card shows name, description, category badge, channel badges, builtin indicator, "Use Template" CTA (`apps/web/src/components/templates/template-card.tsx`).
- Template detail page with channels, required inputs, default config JSON, config preview dialog (`apps/web/src/components/templates/template-detail.tsx`, `template-preview-dialog.tsx`).
- Shared template constants extracted to `template-constants.ts` (category colors, channel icons).
- Profile list page with cards sorted by priority, status badges, fleet scope, merge strategy (`apps/web/src/components/profiles/profile-list.tsx`).
- Create/edit profile form with all fields: name, description, priority, fleet scope, merge strategy, locked fields, JSON defaults editor (`apps/web/src/components/profiles/profile-form.tsx`, `defaults-editor.tsx`).
- Profile detail page with view/edit toggle and delete confirmation (`apps/web/src/components/profiles/profile-detail.tsx`).
- Shared profile utilities in `profile-utils.ts`.
- "Use Template" wires to deploy wizard via `?templateId=` query param. `DeployWizard` accepts `initialTemplateId` prop. `/bots/new` page reads search params.
- Error handling on all mutation paths (create, update, delete) with visible error messages.
- `workspaceId` passed as prop to `ProfileForm` (not hardcoded).

**WP2.7 (Bidirectional Awareness & Agent Evolution)** — COMPLETE (PR #16):
- Core diff logic in `packages/core/src/agent-evolution.ts` — pure functions: `computeEvolutionDiff()`, `extractSkills()`, `extractMcpServers()`, `extractEnabledChannels()`, `extractToolProfile()`, `diffArrays()`, `summarizeEvolution()`. Types: `EvolutionChange`, `AgentEvolutionDiff`, `EvolutionSummary`, `ToolProfileState`. Exported from `packages/core/src/index.ts`. 21 unit tests in `packages/core/src/__tests__/agent-evolution.test.ts`.
- Database: `AgentStateSnapshot` model added to `packages/database/prisma/schema.prisma` with fields: `liveConfig` (Json), `liveConfigHash`, `liveSkills` (Json), `liveMcpServers` (Json), `liveChannels` (Json), `liveToolProfile` (Json?), `diffFromDeployed` (Json?), `hasEvolved` (Boolean), `totalChanges` (Int), `gatewayReachable` (Boolean), `capturedAt` (DateTime). Indexes on `[instanceId]` and `[instanceId, capturedAt]`. Relation added to `BotInstance`.
- Backend NestJS module in `apps/api/src/agent-evolution/`:
  - `agent-evolution.service.ts` — `captureState()` fetches live config from Gateway via `GatewayManager`, extracts skills/MCPs/channels/tools, computes diff vs `desiredManifest`, stores snapshot. `getLatestSnapshot()`, `getEvolutionHistory()`, `getLiveState()` (real-time with fallback to last snapshot), `cleanupOldSnapshots()`.
  - `agent-evolution.scheduler.ts` — `@Cron('0 */2 * * * *')` syncs all RUNNING bots with CONNECTED gateways (90s dedup). `@Cron('0 0 * * * *')` prunes old snapshots.
  - `agent-evolution.controller.ts` — `GET :id/live-state`, `GET :id/evolution`, `GET :id/evolution/history` (with validated limit param), `POST :id/evolution/sync`.
  - `agent-evolution.module.ts` — registered in `apps/api/src/app.module.ts`.
  - 6 service unit tests in `__tests__/agent-evolution.service.spec.ts`.
- Frontend API client (`apps/web/src/lib/api.ts`): Types `EvolutionChange`, `AgentEvolutionDiff`, `EvolutionSummary`, `AgentLiveState`, `AgentEvolutionSnapshot`. Methods: `getLiveState()`, `getEvolution()`, `getEvolutionHistory()`, `syncEvolution()`.
- Frontend components:
  - `apps/web/src/components/openclaw/evolution-banner.tsx` — "This agent has evolved since deployment" banner with expandable change details, sync button, gateway reachability indicator.
  - `apps/web/src/components/openclaw/live-skills.tsx` — Two-column deployed vs live skills comparison. Green (both), blue (added at runtime), red strikethrough (removed). Also shows MCP servers.
  - `apps/web/src/components/openclaw/evolution-diff.tsx` — Side-by-side config diff grouped by category with expandable sections.
  - `apps/web/src/components/openclaw/evolution-indicator.tsx` — Dashboard badge with GitBranch icon showing "N evolved".
- Frontend integration:
  - `apps/web/src/app/bots/[id]/bot-detail-client.tsx` — New "Evolution" tab with EvolutionDiff. EvolutionBanner on Overview tab. LiveSkills on Skills tab when evolution data available. Sync handler with loading state.
  - `apps/web/src/app/bots/[id]/page.tsx` — Fetches evolution data server-side via `api.getEvolution(id).catch(() => null)` in parallel `Promise.all`.
  - `apps/web/src/components/dashboard/single-bot-dashboard.tsx` — EvolutionIndicator badge next to bot status/health. useEffect with cleanup flag for safe unmount.
- Shared utility: `formatTimeAgo()` extracted to `apps/web/src/lib/utils.ts` (used by both banner and indicator).

**WP2.1 (AI Gateway Abstraction Layer)** — COMPLETE (PR #17):
- Core schemas in `packages/core/src/ai-gateway/config.ts` — Zod schemas: `ModelApiSchema` (6 API protocols: openai-completions, openai-responses, anthropic-messages, google-generative-ai, github-copilot, bedrock-converse-stream), `ModelProviderConfigSchema` (matching OpenClaw's shape: baseUrl, apiKey, auth, api, headers, models[]), `ModelsConfigSchema` (top-level config section), `AiGatewaySettingsSchema` (stored on BotInstance DB).
- Pure functions in `packages/core/src/ai-gateway/provider-builder.ts`:
  - `buildGatewayProvider(settings)` → builds `ModelProviderConfig` from `AiGatewaySettings`, throws if `gatewayUrl` missing
  - `rewriteModelRef(originalRef, gatewayProviderName)` → prepends gateway name (e.g., `vercel-ai-gateway/anthropic/claude-sonnet-4-20250514`)
  - `buildFallbackChain(originalRef, existingFallbacks?)` → creates deduplicated fallback array with original ref first
  - `injectGatewayIntoConfig(config, settings)` → immutably injects gateway provider into `models.providers`, rewrites `agents.defaults.model.primary`, sets fallbacks. Returns config unchanged when disabled or missing URL.
- Barrel exports in `packages/core/src/ai-gateway/index.ts`. Added `export * from "./ai-gateway"` to `packages/core/src/index.ts`.
- Added `models: ModelsConfigSchema.optional()` to `OpenClawConfigSchema` in `packages/core/src/openclaw-config.ts` — prerequisite for gateway provider injection.
- Database: 4 fields added to `BotInstance` in `packages/database/prisma/schema.prisma`: `aiGatewayEnabled Boolean @default(false)`, `aiGatewayUrl String?`, `aiGatewayApiKey String?`, `aiGatewayProvider String @default("vercel-ai-gateway")`.
- Config generator (`apps/api/src/reconciler/config-generator.service.ts`): Accepts optional `aiGatewaySettings` param. When enabled, calls `injectGatewayIntoConfig()` before `enforceSecureDefaults()`.
- API endpoint: `PATCH /bot-instances/:id/ai-gateway` in controller. `UpdateAiGatewaySettingsDto` with `@IsBoolean() enabled`, `@IsUrl() @IsOptional() gatewayUrl`, `@IsString() @MaxLength(500) @IsOptional() gatewayApiKey`, `@IsString() @MaxLength(100) @IsOptional() providerName`.
- Service method `updateAiGatewaySettings()` with server-side validation (enabled requires URL → `BadRequestException`), API key redacted from response (`aiGatewayApiKey: null`).
- Frontend API client (`apps/web/src/lib/api.ts`): `AiGatewaySettings` interface, `updateAiGatewaySettings()` method, AI Gateway fields on `BotInstance` interface.
- UI component `apps/web/src/components/openclaw/ai-gateway-toggle.tsx`: Card with enable/disable toggle, provider selector dropdown (Vercel/Cloudflare/Custom), gateway URL input, API key password input with show/hide (`aria-label`), save button with loading/error/success states.
- Integrated into Config tab of `apps/web/src/app/bots/[id]/bot-detail-client.tsx` above ConfigEditor.
- 15 unit tests in `packages/core/src/ai-gateway/__tests__/provider-builder.test.ts` covering all functions + edge cases.
- Security: API key never returned in responses (redacted to null), `@IsUrl()` validation on gateway URL, server-side enabled+URL consistency check.

**WP2.2 (Device Pairing Management UI)** — COMPLETE (PR #18):
- Database: `DevicePairing` model added to `packages/database/prisma/schema.prisma` with fields: `instanceId`, `channelType` (OpenClawChannelType), `senderId`, `senderName`, `platform`, `state` (PairingState: PENDING/APPROVED/REJECTED/REVOKED/EXPIRED), `approvedAt`, `revokedAt`, `lastSeenAt`, `ipAddress`, `deviceInfo`. Composite unique constraint `@@unique([instanceId, channelType, senderId])`. Indexes on `instanceId`, `state`, `channelType`. Relation added to `BotInstance`.
- Backend NestJS module in `apps/api/src/pairing/`:
  - `pairing.service.ts` — `verifyInstanceExists()` (NotFoundException if missing), `listPairings()` (optional state filter), `getPendingPairings()`, `approvePairing()` (upsert), `rejectPairing()`, `batchApproveAll()`, `revokePairing()`, `syncPairingsFromGateway()` (placeholder — TODO: GatewayManager integration). Uses `OpenClawChannelType` throughout (no `as any` casts).
  - `pairing.controller.ts` — 7 REST endpoints at `bot-instances/:id/pairings`. Uses `PairingActionDto` and `ListPairingsQueryDto` for input validation. Calls `verifyInstanceExists()` on every endpoint.
  - `pairing.dto.ts` — class-validator DTOs: `PairingActionDto` (`@IsEnum(PairingChannelType)` + `@IsString @IsNotEmpty senderId`), `ListPairingsQueryDto` (`@IsOptional @IsEnum(PairingStateFilter) state`).
  - `pairing.module.ts` — registered in `apps/api/src/app.module.ts`.
  - 15 unit tests in `__tests__/pairing.service.spec.ts` covering all service methods including `verifyInstanceExists`.
- Frontend API client (`apps/web/src/lib/api.ts`): `DevicePairing` interface. Methods: `getPairings()`, `getPendingPairings()`, `approvePairing()`, `rejectPairing()`, `approveAllPairings()`, `revokePairing()`, `syncPairings()`.
- Frontend components:
  - `apps/web/src/components/pairing/pairing-utils.ts` — shared `maskSenderId()` and `channelBadgeColor()` functions.
  - `apps/web/src/components/pairing/pending-list.tsx` — Card grid of pending pairing requests with approve/reject buttons per card, batch "Approve All" button when 2+ pending.
  - `apps/web/src/components/pairing/active-devices.tsx` — Table of active paired devices with sender, channel badge, status, paired since, last seen, and revoke button with confirmation.
  - `apps/web/src/components/pairing/pairing-tab.tsx` — Orchestrator component with 10-second polling, "Sync from Gateway" button, loading/error states, collapsible revoked/rejected/expired section.
- Frontend integration:
  - `apps/web/src/app/bots/[id]/bot-detail-client.tsx` — New "Pairing" tab with Smartphone icon after Channels tab.

**WP2.4 (Integration Tests for All Deployment Targets)** — COMPLETE (PR #18):
- Created `packages/cloud-providers/jest.integration.config.js` — separate Jest config with `*.integration.test.ts` regex, 180s timeout, cleared `testPathIgnorePatterns`.
- Modified `packages/cloud-providers/jest.config.js` — added `testPathIgnorePatterns: ["/__integration__/"]` to exclude integration tests from unit runs.
- Added `"test:integration": "jest --config jest.integration.config.js --no-cache --runInBand"` to `packages/cloud-providers/package.json`.
- Shared test utilities in `packages/cloud-providers/src/targets/__integration__/test-utils.ts`: `generateTestProfile()`, `generateTestPort()` (range 19000-19900), `buildTestConfig()`, `waitForHealth()`, `runCommand()`, `cleanupTarget()`, `itIf()`, `describeIf()`.
- 5 integration test files using `(condition ? describe : describe.skip)` for proper conditional skipping:
  - `docker.integration.test.ts` — Skips if Docker not available. Full lifecycle: install (pull image), configure, start, status, endpoint, logs, stop, destroy.
  - `local.integration.test.ts` — Skips if not Linux/macOS or no `openclaw` CLI. Full lifecycle: install, configure, start, status, endpoint, stop, destroy.
  - `kubernetes.integration.test.ts` — Skips if no kubectl/cluster. Creates test namespace, full lifecycle, cleans up namespace.
  - `ecs-fargate.integration.test.ts` — Skips if missing AWS creds (5 env vars). Full lifecycle with 30s startup wait.
  - `cloudflare-workers.integration.test.ts` — Skips if missing wrangler CLI or CF creds. Full lifecycle: install (generate config), configure, start (deploy), status, endpoint, destroy.

**Known pre-existing issues** (not introduced by Phase 2):
- 5 test suites fail on clean master: onboarding.service.spec, connectors.service.spec, fleets.service.spec, bot-instances.service.spec, instances.spec. These are pre-existing failures.

---

## Objective

Take Molthub from current state to production-grade quality by applying every lesson learned from `cloudflare/moltworker` — not just for Cloudflare, but across all deployment targets (local, Docker, K8s, AWS, Azure, GCP, Cloudflare). Then exceed moltworker with fleet management, inter-bot communication, and enterprise observability that moltworker lacks entirely.

**North Star**: The UX Dream (`ux-dream.md`). Every feature must serve Sarah — the builder deploying her first few agents — before scaling to fleet operators. Moltworker patterns make it production-grade; the UX dream makes it feel right.

---

## Progress

### Phase 1: COMPLETE ✅ (PRs #5–#12 merged to master)

| WP | Title | PR |
|----|-------|----|
| WP1.1 | Cloudflare Workers Deployment Target | #5 |
| WP1.2 | Universal State Persistence & Backup | #10 |
| WP1.3 | Real WebSocket Integration in Frontend | #7 |
| WP1.4 | Gateway Client Middleware & Interceptors | #12 |
| WP1.5 | Per-Instance Debug Endpoints | #6 |
| WP1.6 | Loading & Cold-Start UX | #9 |
| WP1.7 | Unit Test Coverage for Critical Paths | #8 |
| WP1.8 | Real Channel Auth Integration | #11 |

### Phase 2: COMPLETE ✅ (8/8 WPs, PRs #13–#18)

| WP | Title | Status | PR |
|----|-------|--------|----|
| WP2.5 | Progressive Disclosure Shell | ✅ Complete | #13 |
| WP2.6 | Universal Deploy Wizard | ✅ Complete | #13 |
| WP2.8 | Next-Step Guidance & Empty States | ✅ Complete | #14 |
| WP2.3 | Templates & Profiles Web Pages | ✅ Complete | #15 |
| WP2.7 | Bidirectional Awareness & Agent Evolution | ✅ Complete | #16 |
| WP2.1 | AI Gateway Abstraction Layer | ✅ Complete | #17 |
| WP2.2 | Device Pairing Management UI | ✅ Complete | #18 |
| WP2.4 | Integration Tests for All Targets | ✅ Complete | #18 |

---

## Dependency Graph (Phase 2+)

```
Phase 2 — Parallel Group A (no deps, start immediately):
  WP2.3  Templates & Profiles Web Pages ──────────────┐
  WP2.5  Progressive Disclosure Shell ─────────────────┤
  WP2.6  Universal Deploy Wizard ──────────────────────┤
                                                        │
Phase 2 — Parallel Group B (Phase 1 deps, start immediately):
  WP2.1  AI Gateway Abstraction Layer ─────────────────┤
  WP2.2  Device Pairing Management UI ─────────────────┤
  WP2.4  Integration Tests for All Targets ────────────┤
  WP2.7  Bidirectional Awareness & Agent Evolution ────┤
                                                        │
Phase 2 — Sequential (internal dep):                    │
  WP2.8  Next-Step Guidance & Empty States ←── WP2.5 ──┘
                                                        │
Phase 3 (start when Phase 2 deps ready):                ▼
  WP3.1  Inter-Bot Communication Foundation
  WP3.2  Enhanced Observability Dashboard
  WP3.3  Performance Optimization & Caching
  WP3.4  Security Hardening & Compliance
  WP3.5  Documentation & Onboarding
```

---

## Phase 1: Foundation (8 WPs, All Parallel)

### WP1.1: Cloudflare Workers Deployment Target

**Goal**: Enable OpenClaw deployment to Cloudflare Workers with Sandbox containers and R2 state persistence — mirroring what moltworker does as a standalone app, but managed by Molthub.

**Moltworker lessons**: R2 state sync, config generation from env vars, idempotent process lifecycle, Durable Objects for singleton, cold-start handling.

**Scope**:
- `CloudflareWorkersTarget` implementing `DeploymentTarget` interface
- R2 state sync service (backup every 5min, timestamp-based restore, file validation before overwrite)
- Wrangler config generation (`wrangler.jsonc` + Dockerfile + `start-openclaw.sh`)
- Environment variable mapping (Worker secrets → container env → `openclaw.json`)
- AI Gateway provider injection when Vercel/CF AI Gateway is configured (gateway-as-provider pattern, not URL rewriting)
- Cold-start handling (container boot takes 1-2min)
- `CLOUDFLARE_WORKERS` added to `DeploymentTargetType` enum

**Files**:
- Create: `packages/cloud-providers/src/targets/cloudflare-workers/cloudflare-workers-target.ts`
- Create: `packages/cloud-providers/src/targets/cloudflare-workers/r2-state-sync.ts`
- Create: `packages/cloud-providers/src/targets/cloudflare-workers/wrangler-generator.ts`
- Create: `packages/cloud-providers/src/targets/cloudflare-workers/env-mapper.ts`
- Create: `packages/cloud-providers/src/targets/cloudflare-workers/index.ts`
- Modify: `packages/cloud-providers/src/targets/factory.ts` — add CF Workers case
- Modify: `packages/cloud-providers/src/interface/deployment-target.ts` — add `CLOUDFLARE_WORKERS` enum value
- Modify: `packages/database/prisma/schema.prisma` — add `CLOUDFLARE_WORKERS` to DeploymentType enum
- Create: `packages/cloud-providers/src/targets/cloudflare-workers/__tests__/cloudflare-workers-target.test.ts`

**Acceptance criteria**:
- `DeploymentTargetFactory.create('cloudflare-workers', config)` returns a working target
- `install()` generates wrangler.jsonc + Dockerfile + start script
- `configure(config)` maps env vars and generates openclaw.json
- `start()` deploys via `wrangler deploy` and waits for health
- R2 sync runs every 5min, validates timestamps before overwriting
- AI Gateway provider injected into `models.providers` when `aiGatewayEnabled = true`, model ref rewritten to gateway-provider format with direct fallback
- Unit tests cover env mapping, config generation, R2 sync logic

---

### WP1.2: Universal State Persistence & Backup

**Goal**: Implement state backup/restore across ALL deployment targets — not just Cloudflare R2 but S3, Azure Blob, GCS, and local filesystem.

**Moltworker lessons**: Cron-based sync (every 5min), timestamp-based conflict resolution, file validation before overwrite, rsync-like incremental sync.

**Scope**:
- `StateSyncBackend` interface with pluggable implementations
- Backends: S3, R2, Azure Blob Storage, GCS, local filesystem
- Scheduled backup (configurable interval, default 5min)
- Timestamp-based restore (only download if remote is newer)
- File integrity validation (SHA-256 checksums before overwrite)
- Manual backup/restore API endpoints
- Per-instance backup configuration
- Encryption at rest support (AES-256-GCM)

**Files**:
- Create: `packages/core/src/state-sync/interface.ts` — `StateSyncBackend`, `SyncResult`, `SyncOptions`
- Create: `packages/core/src/state-sync/s3-backend.ts`
- Create: `packages/core/src/state-sync/r2-backend.ts`
- Create: `packages/core/src/state-sync/azure-blob-backend.ts`
- Create: `packages/core/src/state-sync/gcs-backend.ts`
- Create: `packages/core/src/state-sync/local-backend.ts`
- Create: `packages/core/src/state-sync/sync-scheduler.ts`
- Create: `packages/core/src/state-sync/encryption.ts`
- Create: `packages/core/src/state-sync/index.ts`
- Create: `apps/api/src/state-sync/state-sync.service.ts`
- Create: `apps/api/src/state-sync/state-sync.controller.ts`
- Create: `apps/api/src/state-sync/state-sync.module.ts`
- Modify: `packages/database/prisma/schema.prisma` — add `StateSyncConfig` model (backend, bucket, interval, lastSyncAt, lastSyncStatus)
- Create: `packages/core/src/state-sync/__tests__/sync-scheduler.test.ts`
- Create: `packages/core/src/state-sync/__tests__/s3-backend.test.ts`

**Acceptance criteria**:
- Cron job backs up state directory every 5 minutes (configurable)
- Restore only downloads files newer than local timestamp
- Checksums validated before overwriting local files
- All 5 backends implement the same interface
- Manual `POST /instances/:id/state/backup` and `POST /instances/:id/state/restore` work
- Encrypted backups can be restored with correct key
- Unit tests for scheduler, conflict resolution, and each backend

---

### WP1.3: Real WebSocket Integration in Frontend

**Goal**: Replace polling with native WebSocket for real-time health updates, log streaming, and agent output.

**Moltworker lessons**: N/A directly (moltworker proxies WS to Gateway), but Molthub needs this for its multi-instance dashboard.

**Scope**:
- React context provider for WebSocket connection management
- `useGatewayWebSocket(instanceId)` hook — connects to NestJS WS gateway at `/logs`
- Real-time health status updates (push from backend when health changes)
- Live log streaming with level filtering
- Agent output streaming during runs
- Connection status indicator (connected/disconnected/reconnecting)
- Auto-reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Graceful fallback to polling if WS unavailable

**Files**:
- Create: `apps/web/src/lib/websocket-context.tsx` — `WebSocketProvider`, connection management
- Create: `apps/web/src/hooks/use-gateway-websocket.ts` — per-instance WS hook
- Create: `apps/web/src/hooks/use-log-stream.ts` — log streaming hook
- Create: `apps/web/src/hooks/use-health-stream.ts` — real-time health updates
- Create: `apps/web/src/components/ui/connection-status.tsx` — WS connection indicator
- Modify: `apps/web/src/components/openclaw/log-viewer.tsx` — use WS instead of polling
- Modify: `apps/web/src/components/openclaw/health-snapshot.tsx` — use WS for live updates
- Modify: `apps/web/src/components/openclaw/gateway-status.tsx` — use WS for connection status
- Modify: `apps/web/src/app/bots/[id]/page.tsx` — wrap with WebSocketProvider
- Modify: `apps/web/src/app/layout.tsx` — add global WebSocketProvider

**Acceptance criteria**:
- Health updates appear within 1 second of Gateway event (no polling)
- Log viewer streams new lines in real-time without refresh
- Connection status shows connected/disconnected/reconnecting states
- Auto-reconnects after network interruption
- Falls back to polling when WS unavailable
- No polling when WS is active (eliminates unnecessary API calls)

---

### WP1.4: Gateway Client Middleware & Message Interceptors

**Goal**: Add interceptor/middleware layer to the Gateway WebSocket client for message transformation, logging, telemetry, and error normalization.

**Moltworker lessons**: WebSocket message interception — moltworker transforms error messages in-flight between client and Gateway, rewrites internal URLs.

**Scope**:
- `GatewayInterceptor` interface with `onOutbound(msg)` and `onInbound(msg)` hooks
- `LoggerInterceptor` — logs all WS traffic when debug mode is on
- `ErrorTransformerInterceptor` — rewrites cryptic Gateway error codes into actionable messages
- `TelemetryInterceptor` — records request/response timing, emits metrics
- `AuditInterceptor` — logs config.apply/config.patch operations to audit trail
- Configurable interceptor chain per `GatewayClient` instance
- Interceptors can short-circuit (reject a message before sending)

**Files**:
- Create: `packages/gateway-client/src/interceptors/interface.ts`
- Create: `packages/gateway-client/src/interceptors/logger.ts`
- Create: `packages/gateway-client/src/interceptors/error-transformer.ts`
- Create: `packages/gateway-client/src/interceptors/telemetry.ts`
- Create: `packages/gateway-client/src/interceptors/audit.ts`
- Create: `packages/gateway-client/src/interceptors/index.ts`
- Modify: `packages/gateway-client/src/client.ts` — add interceptor chain to send/receive paths
- Modify: `packages/gateway-client/src/manager.ts` — pass interceptor config to clients
- Modify: `packages/gateway-client/src/index.ts` — export interceptors
- Create: `packages/gateway-client/src/__tests__/interceptors.test.ts`

**Acceptance criteria**:
- Interceptors can modify outbound messages before sending
- Interceptors can transform inbound responses before resolving
- Error transformer rewrites `NOT_LINKED` → "Bot is not connected to Gateway. Check deployment status."
- Logger logs full message bodies when `debug: true`
- Telemetry records latency per method (health: 50ms avg, config.apply: 200ms avg)
- Interceptors composable in any order
- Unit tests for each interceptor

---

### WP1.5: Per-Instance Debug Endpoints

**Goal**: Add debug/introspection endpoints per BotInstance for production debugging — modeled after moltworker's `/debug/*` routes.

**Moltworker lessons**: `/debug/processes`, `/debug/gateway-api`, `/debug/container-config`, `/debug/ws-test`, `/debug/env` — all behind auth.

**Scope**:
- `GET /instances/:id/debug/processes` — list running processes in container/VM
- `GET /instances/:id/debug/gateway-probe` — test Gateway WS connection, execute health/status
- `GET /instances/:id/debug/config` — show resolved openclaw.json (secrets redacted)
- `GET /instances/:id/debug/env` — show environment variable status (set/unset, no values)
- `GET /instances/:id/debug/state-files` — list files in state directory with sizes
- `GET /instances/:id/debug/connectivity` — test network connectivity (DNS, ports, endpoints)
- All endpoints require ADMIN role
- Feature-flagged via `DEBUG_ENDPOINTS_ENABLED` env var
- Web UI debug tab on bot detail page

**Files**:
- Create: `apps/api/src/debug/debug.controller.ts`
- Create: `apps/api/src/debug/debug.service.ts`
- Create: `apps/api/src/debug/debug.module.ts`
- Create: `apps/web/src/app/bots/[id]/debug/page.tsx`
- Create: `apps/web/src/components/debug/process-list.tsx`
- Create: `apps/web/src/components/debug/gateway-probe.tsx`
- Create: `apps/web/src/components/debug/config-viewer.tsx`
- Create: `apps/web/src/components/debug/connectivity-test.tsx`
- Modify: `apps/api/src/app.module.ts` — register DebugModule (conditionally)

**Acceptance criteria**:
- All debug endpoints require ADMIN role (403 for VIEWER/OPERATOR)
- Gateway probe shows connection status, latency, protocol version
- Config viewer redacts `auth.token`, API keys, passwords
- Process list shows PID, command, CPU%, memory, uptime
- State files list shows directory tree with file sizes
- Endpoints work for all deployment target types (local, Docker, K8s, ECS, CF Workers)
- Feature flag disables all debug routes in production if desired

---

### WP1.6: Loading & Cold-Start UX

**Goal**: Show real-time provisioning progress during slow deployments (Docker pull: 30s, ECS task: 2min, CF Workers: 1-2min).

**Moltworker lessons**: HTML loading spinner during container boot, background startup with immediate visual response.

**Scope**:
- Provisioning event system (lifecycle-manager emits events as it progresses)
- NestJS WebSocket gateway for provisioning events (real-time push to frontend)
- Loading screen component with step-by-step progress
- Steps: "Validating config" → "Running security audit" → "Provisioning infrastructure" → "Installing OpenClaw" → "Writing config" → "Starting gateway" → "Waiting for health check" → "Ready"
- Error state with actionable message and retry button
- Timeout handling (configurable, default 5min)
- Works for all deployment types (different steps per target)

**Files**:
- Create: `apps/api/src/provisioning/provisioning-events.gateway.ts` — NestJS WS gateway
- Create: `apps/api/src/provisioning/provisioning-events.service.ts` — event emitter
- Create: `apps/web/src/components/provisioning/provisioning-screen.tsx` — loading UI
- Create: `apps/web/src/components/provisioning/step-progress.tsx` — step indicator
- Create: `apps/web/src/hooks/use-provisioning-events.ts` — WS hook for events
- Modify: `apps/api/src/reconciler/lifecycle-manager.service.ts` — emit events at each step
- Modify: `apps/web/src/components/onboarding/deploy-progress.tsx` — use real events instead of polling

**Acceptance criteria**:
- Loading screen appears immediately when provisioning starts
- Progress updates in real-time via WebSocket (no polling)
- Each step shows name + status (pending/in-progress/completed/error)
- Error step shows error message with "Retry" and "View Logs" buttons
- Timeout after 5min shows "Provisioning timed out" with diagnostics link
- Different step sequences per deployment target type

---

### WP1.7: Unit Test Coverage for Critical Paths

**Goal**: Add unit tests for all core business logic — currently the codebase only has E2E Playwright tests.

**Moltworker lessons**: Colocated test files (`*.test.ts`), mock-based testing for external deps, edge case coverage.

**Scope**:
- `packages/core/` — config schemas, policy evaluation, openclaw-policies, profile validation, state-sync
- `packages/gateway-client/` — protocol parsing, client lifecycle, interceptors, manager pool
- `apps/api/` — reconciler service, drift detection, config generator, health service, security audit, alerting
- Mock utilities for Prisma, WebSocket, deployment targets
- Jest config with coverage thresholds (80% for packages/core, packages/gateway-client)
- CI integration (fail build if coverage drops below 70%)

**Files**:
- Create: `packages/core/src/__tests__/openclaw-config.test.ts` — schema validation tests
- Create: `packages/core/src/__tests__/openclaw-policies.test.ts` — all 14 rule evaluations
- Create: `packages/core/src/__tests__/openclaw-profile.test.ts` — port spacing, service names
- Create: `packages/core/src/__tests__/openclaw-manifest.test.ts` — v2 manifest validation
- Create: `packages/core/src/__tests__/policy-pack.test.ts` — policy pack evaluation
- Create: `packages/gateway-client/src/__tests__/client.test.ts` — connect, health, config.apply
- Create: `packages/gateway-client/src/__tests__/manager.test.ts` — pool lifecycle
- Create: `packages/gateway-client/src/__tests__/protocol.test.ts` — message parsing
- Create: `apps/api/src/reconciler/__tests__/reconciler.service.test.ts`
- Create: `apps/api/src/reconciler/__tests__/drift-detection.test.ts`
- Create: `apps/api/src/reconciler/__tests__/config-generator.test.ts`
- Create: `apps/api/src/health/__tests__/openclaw-health.test.ts`
- Create: `apps/api/src/health/__tests__/alerting.test.ts`
- Create: `apps/api/src/security/__tests__/security-audit.test.ts`
- Create: `apps/api/src/channels/__tests__/channel-auth.test.ts`
- Create: `apps/api/test/utils/mock-prisma.ts` — shared Prisma mock
- Create: `apps/api/test/utils/mock-gateway.ts` — shared Gateway WS mock

**Acceptance criteria**:
- 80%+ line coverage for `packages/core/src/`
- 80%+ line coverage for `packages/gateway-client/src/`
- 70%+ line coverage for `apps/api/src/reconciler/`, `apps/api/src/health/`, `apps/api/src/security/`
- All tests run in <60 seconds
- CI pipeline fails if coverage drops below thresholds
- Mock utilities reusable across all test files

---

### WP1.8: Real Channel Auth Integration

**Goal**: Replace mock/simulated channel auth with real flows — WhatsApp QR pairing, Telegram token validation, Discord guild verification.

**Moltworker lessons**: Device pairing flow (list pending → approve → poll status), QR code streaming from container.

**Scope**:
- WhatsApp: Execute `openclaw channels login` on instance via deployment target, stream QR code back
- Telegram: Validate bot token via Telegram Bot API (`getMe` call)
- Discord: Validate token + fetch guild list via Discord API
- Slack: Validate bot token + app token, test Socket Mode connection
- Auth state machine: `pending` → `pairing` → `paired` | `expired` | `error`
- QR refresh (WhatsApp generates new QR every ~20s)
- Re-pairing flow when session expires
- Channel-specific auth service per platform

**Files**:
- Create: `apps/api/src/channels/auth/whatsapp-auth.service.ts` — QR pairing via Gateway
- Create: `apps/api/src/channels/auth/telegram-auth.service.ts` — Bot API validation
- Create: `apps/api/src/channels/auth/discord-auth.service.ts` — Token + guild fetch
- Create: `apps/api/src/channels/auth/slack-auth.service.ts` — Socket Mode validation
- Create: `apps/api/src/channels/auth/auth-factory.ts` — factory for channel-specific auth
- Modify: `apps/api/src/channels/channel-auth.service.ts` — delegate to platform-specific services
- Modify: `apps/api/src/channels/channels.controller.ts` — add QR streaming endpoint
- Modify: `apps/web/src/components/openclaw/qr-pairing.tsx` — display real QR with auto-refresh
- Create: `apps/web/src/components/channels/telegram-setup.tsx` — token validation UI
- Create: `apps/web/src/components/channels/discord-setup.tsx` — token + guild selector UI
- Create: `apps/web/src/components/channels/slack-setup.tsx` — Socket Mode setup UI

**Acceptance criteria**:
- WhatsApp QR code generated by real OpenClaw instance (via Gateway `agent` command)
- QR refreshes automatically every 20 seconds
- Pairing success detected within 5 seconds
- Telegram token validated via `https://api.telegram.org/bot<token>/getMe`
- Discord token validated and guild list displayed for selection
- Slack bot+app tokens validated and Socket Mode tested
- All auth sessions persisted to `ChannelAuthSession` table
- Expired sessions show re-pair button in UI

---

## Phase 2: Integration + UX Foundation (8 WPs)

**UX Dream alignment**: Phase 2 adds the 4 original integration WPs plus 4 new UX-focused WPs that close the gaps between the master plan and the UX dream. The north star is Sarah's journey: deploy fast, understand her agents, deploy more.

### Parallel Group A — Pure Frontend (no backend deps, start immediately)

---

### WP2.5: Progressive Disclosure Shell

**Dependencies**: None

**Goal**: Make the sidebar, layout, and navigation adapt to the user's stage — 0 agents (wizard only), 1-3 agents (focused dashboard), 4+ agents or has fleets (full fleet view). This is UX Dream Principle #1 and #6.

**Current state**: Sidebar shows all 15+ nav items regardless of user stage. Dashboard has conditional rendering (0→redirect to /setup, 1→SingleBotDashboard, 2+→fleet view), but sidebar doesn't adapt.

**Scope**:
- API endpoint: `GET /user-context` — returns `{ agentCount, hasFleets, hasTeams, stage: "empty" | "getting-started" | "fleet" }`
- React context: `UserStageProvider` wrapping the app, fetches user context on mount
- `useUserStage()` hook — returns current stage + agent count
- Adaptive sidebar:
  - **Stage "empty"** (0 agents): No sidebar at all. Full-screen wizard layout.
  - **Stage "getting-started"** (1-3 agents, no fleets): Minimal sidebar — Dashboard, Bots, Channels, "Deploy New Bot" button. No Configuration submenu, no Traces/Audit/Policies/Connectors.
  - **Stage "fleet"** (4+ agents OR has fleets): Full sidebar with all sections — Operations (Fleets, Alerts, SLOs, Costs), Configuration (Profiles, Overlays, Templates), Advanced (Traces, Change Sets, Audit, Policies, Connectors).
- "Deploy New Bot" button always visible in sidebar (all stages except empty)
- Layout component switches between full-screen (empty) and sidebar layout (getting-started/fleet)

**Files**:
- Create: `apps/api/src/user-context/user-context.service.ts`
- Create: `apps/api/src/user-context/user-context.controller.ts`
- Create: `apps/api/src/user-context/user-context.module.ts`
- Create: `apps/web/src/lib/user-stage-context.tsx` — `UserStageProvider` + `useUserStage()`
- Modify: `apps/web/src/components/layout/sidebar.tsx` — filter nav items by stage
- Modify: `apps/web/src/components/layout/dashboard-layout.tsx` — conditional sidebar rendering
- Modify: `apps/web/src/app/layout.tsx` — wrap with `UserStageProvider`
- Modify: `apps/web/src/app/page.tsx` — use stage context instead of inline conditionals
- Modify: `apps/api/src/app.module.ts` — register UserContextModule

**Acceptance criteria**:
- 0 agents: No sidebar visible. Only wizard layout.
- 1-3 agents: Sidebar shows Dashboard, Bots, Channels, Deploy New Bot only
- 4+ agents: Full sidebar with all nav groups
- Creating a fleet at any agent count unlocks full sidebar
- Sidebar transitions feel natural (no jarring layout shifts)
- "Deploy New Bot" is always 1 click away (except 0-agent state where it's the entire screen)
- Unit tests for stage calculation logic

---

### WP2.6: Universal Deploy Wizard

**Dependencies**: None

**Goal**: Merge `/setup` (first-time) and `/bots/new` (subsequent) into one universal deploy flow. The wizard is the product's front door (UX Dream Principle #9) and deploying agent N+1 must be as easy as agent 1 (Principle #2).

**Current state**: Two separate wizard implementations — `apps/web/src/app/setup/setup-wizard.tsx` (5 steps) and `apps/web/src/app/bots/new/page.tsx` (6 steps). Both use the same underlying components but have duplicated state management.

**Scope**:
- Unify into single `DeployWizard` component used by both `/setup` and `/bots/new`
- Full-screen layout (no sidebar, no navigation chrome) — Principle #9
- 4-step flow (simplified from current 5-6):
  1. **Template + Name** — Pick role, name your bot. One screen, two decisions.
  2. **Channels (optional)** — Configure messaging channels. "Skip" is prominent.
  3. **Review + Deploy** — Summary with one-click deploy.
  4. **Deploying** — Live provisioning progress with celebration on success.
- Smart defaults: Docker is default target (not shown as a choice unless user has configured others). Auth tokens auto-generated. Port allocation automatic.
- Post-deploy: "Your OpenClaw agent is live!" + clear next steps ("Add a Channel" or "Go to Dashboard" or "Deploy Another Bot")
- Fleet selection only shown if user has fleets (progressive disclosure within wizard)
- Deployment target selection only shown if user has configured multiple targets
- Template cards show OpenClaw-native language: agent role, personality snippet, suggested channels, tool profile

**Files**:
- Create: `apps/web/src/components/deploy-wizard/deploy-wizard.tsx` — unified wizard
- Create: `apps/web/src/components/deploy-wizard/step-template.tsx` — template + name
- Create: `apps/web/src/components/deploy-wizard/step-channels.tsx` — channel config
- Create: `apps/web/src/components/deploy-wizard/step-review.tsx` — review + deploy
- Create: `apps/web/src/components/deploy-wizard/step-deploying.tsx` — progress + celebration
- Create: `apps/web/src/components/deploy-wizard/wizard-layout.tsx` — full-screen layout
- Rewrite: `apps/web/src/app/setup/page.tsx` — use `DeployWizard`
- Rewrite: `apps/web/src/app/bots/new/page.tsx` — use `DeployWizard`
- Delete or deprecate: `apps/web/src/app/setup/setup-wizard.tsx` (replaced by unified component)

**Acceptance criteria**:
- `/setup` and `/bots/new` render the same wizard component
- Wizard uses full-screen layout with no sidebar or nav chrome
- 4 steps maximum for default Docker deployment
- Deployment target selector only appears when user has multiple configured targets
- Fleet selector only appears when user has existing fleets
- Post-deploy screen shows "Deploy Another Bot" CTA
- Template cards show agent personality, channels, tool profile
- Deploying agent #5 feels identical to agent #1

---

### WP2.3: Templates & Profiles Web Pages

**Dependencies**: None

**Goal**: Replace "Coming Soon" placeholder pages with full CRUD management UIs. These are power-user pages that appear in sidebar only at "fleet" stage (WP2.5), but must work correctly for any user who navigates to them.

**UX Dream alignment**: Principle #12 (consistent mental model) — Templates are the starting point for agents. Profiles are shared config. Both reinforce the mental model.

**Scope**:
- **Templates page**: Grid of all templates (7 built-in + custom). Each card shows: name, category icon, description, channel presets as badges, "Use Template" action (links to deploy wizard with template pre-selected).
- **Template detail page**: Read-only view for built-in templates (show config, channels, required inputs, recommended policies). Editable for custom templates (JSON editor + structured form).
- **Template preview**: POST `/templates/:id/preview` — shows full `openclaw.json` output without side effects.
- **Profiles page**: List all profiles with priority badges, fleet scope, merge strategy summary. Create/edit/delete.
- **Profile detail page**: Structured defaults editor, per-field merge strategy dropdowns (override/merge/prepend/append), locked fields checkboxes, fleet assignment.
- **"Use Template" flow**: Clicking "Use Template" on any template card opens the deploy wizard with that template pre-selected. This connects templates to the deploy flow naturally.

**Files**:
- Rewrite: `apps/web/src/app/templates/page.tsx` — grid of template cards
- Create: `apps/web/src/app/templates/[id]/page.tsx` — template detail
- Create: `apps/web/src/components/templates/template-card.tsx` — card with "Use Template" CTA
- Create: `apps/web/src/components/templates/template-detail.tsx` — config viewer + editor
- Create: `apps/web/src/components/templates/template-preview.tsx` — config preview modal
- Rewrite: `apps/web/src/app/profiles/page.tsx` — profile list
- Create: `apps/web/src/app/profiles/[id]/page.tsx` — profile detail
- Create: `apps/web/src/components/profiles/profile-card.tsx`
- Create: `apps/web/src/components/profiles/profile-editor.tsx` — structured form
- Create: `apps/web/src/components/profiles/merge-preview.tsx` — visual merge result

**Acceptance criteria**:
- Templates page shows 7 built-in + any custom templates in responsive grid
- Built-in templates are read-only (no edit/delete)
- Custom template creation with form + JSON editor
- "Use Template" opens deploy wizard with template pre-selected
- Preview generates full config without side effects
- Profiles page shows all profiles sorted by priority
- Profile editor supports per-field merge strategies
- Merge preview shows accurate Template + Profile result
- Empty states have clear CTAs ("Create your first profile")

---

### Parallel Group B — Backend + Frontend (Phase 1 deps ready, start immediately)

---

### WP2.1: AI Gateway Abstraction Layer

**Dependencies**: WP1.1 (Cloudflare Workers target) — COMPLETE

**Goal**: Route LLM API traffic through an AI Gateway proxy (Vercel AI Gateway, Cloudflare AI Gateway, or any OpenAI-compatible proxy) for caching, rate limiting, analytics, and cost reduction.

**OpenClaw integration analysis** (Jan 2026):
OpenClaw's model system was reviewed in detail. Key findings that shaped this WP:

1. **Gateway-as-provider, NOT URL rewriting**: OpenClaw treats Vercel AI Gateway as a first-class provider (`vercel-ai-gateway`) in `models.providers`, not as a URL rewrite layer. Model references use `vercel-ai-gateway/anthropic/claude-opus-4.5` — the model ID embeds the underlying provider path. The gateway knows which backend to route to from the model ID.

2. **Multi-provider architecture**: OpenClaw supports 6 API protocols (`openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, `github-copilot`, `bedrock-converse-stream`). Each provider has `baseUrl`, `apiKey`, `auth` mode, `api` type, `headers`, and `models[]`. The rewriter must preserve this structure.

3. **Missing prerequisite — `models.providers`**: Molthub's `OpenClawConfigSchema` currently has NO `models` section (only `agents.defaults.model` for model selection). A `ModelsConfig` with `providers` record must be added to the config schema BEFORE the gateway provider can be configured. This is the most important prerequisite.

4. **Auth profile system**: OpenClaw stores API keys in `auth-profiles.json` with multiple profiles per provider (api_key, oauth, token modes), profile ordering, and cooldown tracking. Molthub should store the gateway API key in the BotInstance or a dedicated secret store, not just as an env var.

5. **Model fallback chain**: OpenClaw's `model-fallback.ts` tries multiple providers in order. When gateway fails, it falls back to the direct provider. The config generator should set `agents.defaults.model.fallbacks` to include the direct provider as fallback.

6. **Vercel AI Gateway is the primary**: The provider name is `vercel-ai-gateway`, env var is `AI_GATEWAY_API_KEY`, API is `anthropic-messages` compatible. Onboarding: `openclaw onboard --auth-choice ai-gateway-api-key`.

**Scope** (revised):
1. Add `ModelsConfig` section to `OpenClawConfigSchema` — `models.providers` record matching OpenClaw's `ModelProviderConfig` shape (`baseUrl`, `apiKey`, `auth`, `api`, `headers`, `models[]`)
2. Add `ModelApiSchema` enum: `openai-completions | openai-responses | anthropic-messages | google-generative-ai | github-copilot | bedrock-converse-stream`
3. Gateway provider injection in config generator — when AI Gateway is enabled for an instance, inject a `vercel-ai-gateway` (or custom) provider entry into `models.providers` and set `agents.defaults.model.primary` to route through it, with the original direct provider as `fallbacks[0]`
4. Per-instance toggle (DB fields on BotInstance: `aiGatewayEnabled`, `aiGatewayUrl`, `aiGatewayApiKey`)
5. Config UI: toggle + URL input + API key input on bot detail page
6. Pure functions for gateway provider construction + model ref rewriting

**How it works end-to-end**:
1. User enables AI Gateway for a bot via toggle in Molthub UI
2. User provides gateway URL (e.g., `https://gateway.vercel.ai/v1/...`) and API key
3. Config generator runs on deploy/update:
   - Reads `aiGatewayEnabled`, `aiGatewayUrl`, `aiGatewayApiKey` from BotInstance
   - If enabled: injects a gateway provider entry into `models.providers` with the gateway's baseUrl and apiKey
   - Sets `agents.defaults.model.primary` to `<gateway-provider>/<original-provider>/<model-id>`
   - Sets `agents.defaults.model.fallbacks` to include the original direct model ref
4. Config is applied to the running bot via Gateway WS `config.apply`
5. Bot uses gateway for API calls; if gateway fails, fallback chain tries direct provider
6. Toggle off → config generator omits the gateway provider, reverts model ref to direct

**Files** (revised):
- Create: `packages/core/src/ai-gateway/config.ts` — `AiGatewayConfigSchema`, `ModelProviderConfigSchema`, `ModelsConfigSchema`, `ModelApiSchema`
- Create: `packages/core/src/ai-gateway/provider-builder.ts` — `buildGatewayProvider()`, `rewriteModelRef()`, `injectGatewayIntoConfig()`
- Create: `packages/core/src/ai-gateway/index.ts` — barrel exports
- Create: `packages/core/src/ai-gateway/__tests__/provider-builder.test.ts` — unit tests
- Modify: `packages/core/src/openclaw-config.ts` — add `models: ModelsConfigSchema.optional()` to `OpenClawConfigSchema`
- Modify: `apps/api/src/reconciler/config-generator.service.ts` — call `injectGatewayIntoConfig()` when `aiGatewayEnabled`
- Modify: `packages/database/prisma/schema.prisma` — add `aiGatewayEnabled Boolean?`, `aiGatewayUrl String?`, `aiGatewayApiKey String?` to BotInstance
- Create: `apps/web/src/components/openclaw/ai-gateway-toggle.tsx` — toggle + URL + API key inputs
- Modify: `apps/web/src/lib/api.ts` — add update endpoint for gateway settings
- Modify: `apps/web/src/app/bots/[id]/bot-detail-client.tsx` — add gateway toggle to Settings tab

**Acceptance criteria** (revised):
- `OpenClawConfigSchema` includes `models.providers` record with full `ModelProviderConfig` shape
- Config generator injects gateway provider when `aiGatewayEnabled=true` and sets model ref + fallbacks
- Config generator omits gateway when disabled — direct model ref only
- Model ref format: `<gateway-provider>/<underlying-provider>/<model-id>` matches OpenClaw convention
- Fallback chain: gateway → direct provider (via `agents.defaults.model.fallbacks`)
- UI toggle persists `aiGatewayEnabled`, `aiGatewayUrl`, `aiGatewayApiKey` to BotInstance
- Unit tests: gateway injection, model ref rewriting, fallback construction, disabled state
- API key stored securely (not in config JSON — passed via BotInstance DB fields)

---

### WP2.2: Device Pairing Management UI

**Dependencies**: WP1.8 (Real channel auth) — COMPLETE

**Goal**: Admin UI for managing OpenClaw device pairings — approve pending, list active, revoke. This is the OpenClaw-native way to manage DM access (Principle #10).

**Moltworker lessons**: Device pairing admin page (list pending → approve/reject → poll), batch approve-all.

**Scope**:
- New "Pairing" tab on bot detail page
- Fetch pending pairings via Gateway WS
- Approve/reject individual pairings with `config.apply`
- Batch approve-all
- List active paired devices with last-seen timestamps
- Revoke active pairings (remove from allowlist + apply config)
- Pairing history in audit log

**Files**:
- Create: `apps/api/src/pairing/pairing.service.ts`
- Create: `apps/api/src/pairing/pairing.controller.ts`
- Create: `apps/api/src/pairing/pairing.module.ts`
- Create: `apps/web/src/components/pairing/pending-list.tsx`
- Create: `apps/web/src/components/pairing/active-devices.tsx`
- Create: `apps/web/src/components/pairing/pairing-tab.tsx`
- Modify: `apps/web/src/app/bots/[id]/bot-detail-client.tsx` — add Pairing tab
- Modify: `packages/database/prisma/schema.prisma` — add `DevicePairing` model
- Modify: `apps/api/src/app.module.ts` — register PairingModule

**Acceptance criteria**:
- Pending pairings appear within 5 seconds of request
- Approve generates pairing code and updates config via `config.apply`
- Reject removes pending entry
- Active devices show last-seen, platform, IP
- Revoke removes from allowlist + applies config
- All actions logged to audit trail

---

### WP2.7: Bidirectional Awareness & Agent Evolution

**Dependencies**: WP1.3 (Real WebSocket), WP1.4 (Gateway interceptors) — COMPLETE

**Goal**: Show the live reality of each agent — not just what was deployed, but what the agent has become. Skills it added, tools it's using, MCP servers it connected, config it changed. This is UX Dream Principle #11 and the single most important differentiator from fire-and-forget deployment tools.

**Current state**: Bot detail page shows data from `desiredManifest` (what was deployed). No mechanism to read live agent state from Gateway.

**Scope**:
- **Agent state sync service**: Periodically polls each connected bot's Gateway via `config.get`, `health`, `status` to read live state
- **Agent evolution model**: Store snapshots of agent state. Compare current state vs. deployed state. Track: skills added/removed, tools changed, MCP servers connected, config sections modified.
- **Evolution diff on bot detail page**: "This agent has evolved since deployment" banner with expandable details — new skills, changed tool profile, new MCP servers, modified config sections. Show "You set this" vs "The agent changed this" labels.
- **Live skills/tools/MCP display**: Bot detail Skills tab shows current live skills (from Gateway), not just deployed skills. Same for tools and MCP servers.
- **"What's changed" indicator**: Bot cards on dashboard show subtle badge when agent has evolved ("2 changes since deploy")
- **API**: `GET /bot-instances/:id/live-state` — returns current agent state from Gateway. `GET /bot-instances/:id/evolution` — returns diff between deployed and current state.

**Files**:
- Create: `apps/api/src/agent-evolution/agent-evolution.service.ts` — state polling + diff logic
- Create: `apps/api/src/agent-evolution/agent-evolution.controller.ts`
- Create: `apps/api/src/agent-evolution/agent-evolution.module.ts`
- Create: `apps/api/src/agent-evolution/agent-evolution.scheduler.ts` — periodic sync (every 2min)
- Modify: `packages/database/prisma/schema.prisma` — add `AgentStateSnapshot` model (liveConfig JSON, liveSkills, liveMcpServers, capturedAt, diffFromDeployed JSON)
- Create: `apps/web/src/components/openclaw/evolution-banner.tsx` — "Agent has evolved" banner
- Create: `apps/web/src/components/openclaw/live-skills.tsx` — live skills display (Gateway-sourced)
- Create: `apps/web/src/components/openclaw/evolution-diff.tsx` — side-by-side deployed vs current
- Modify: `apps/web/src/app/bots/[id]/bot-detail-client.tsx` — add evolution banner + live state
- Modify: `apps/web/src/components/dashboard/single-bot-dashboard.tsx` — show evolution indicator
- Modify: `apps/api/src/app.module.ts` — register AgentEvolutionModule
- Create: `apps/api/src/agent-evolution/__tests__/agent-evolution.service.test.ts`

**Acceptance criteria**:
- Bot detail page shows live skills from Gateway (not just deployed manifest)
- Evolution banner appears when agent state differs from deployed state
- Diff shows clearly what changed: "Skills added: github, jira" / "Tool profile changed: minimal → coding"
- Dashboard bot cards show evolution badge ("3 changes")
- State sync runs every 2 minutes for connected bots
- If Gateway is unreachable, show last known state with "Last synced X min ago" label
- Unit tests for diff calculation logic

---

### WP2.4: Integration Tests for All Deployment Targets

**Dependencies**: WP1.1 (CF Workers), WP1.2 (State sync) — COMPLETE

**Goal**: Verify all deployment targets work end-to-end — provision real OpenClaw, check health, tear down.

**Scope**:
- Docker target: start container, wait for Gateway, check health, destroy
- Local target: install via `openclaw gateway install`, start, check health, stop
- Kubernetes target: apply manifests to kind cluster, wait for pod, check health, delete
- ECS Fargate target: task definition + service, wait, check health, delete (requires AWS)
- Cloudflare Workers target: `wrangler deploy`, wait, check health, `wrangler delete` (requires CF)
- Parameterized test runner (same assertions against all targets)
- Skip if credentials unavailable

**Files**:
- Create: `packages/cloud-providers/src/targets/__integration__/docker.integration.test.ts`
- Create: `packages/cloud-providers/src/targets/__integration__/local.integration.test.ts`
- Create: `packages/cloud-providers/src/targets/__integration__/kubernetes.integration.test.ts`
- Create: `packages/cloud-providers/src/targets/__integration__/ecs-fargate.integration.test.ts`
- Create: `packages/cloud-providers/src/targets/__integration__/cloudflare-workers.integration.test.ts`
- Create: `packages/cloud-providers/src/targets/__integration__/test-utils.ts`
- Create: `packages/cloud-providers/jest.integration.config.ts`

**Acceptance criteria**:
- Each test provisions real OpenClaw instance
- Waits for Gateway health check (up to 3min)
- Verifies `config.get` returns expected config
- Tears down cleanly (no orphaned resources)
- Tests skip gracefully when credentials unavailable
- Runs in separate CI job (not blocking fast pipeline)

---

### Sequential (internal dep)

---

### WP2.8: Next-Step Guidance & Empty States

**Dependencies**: WP2.5 (Progressive Disclosure Shell)

**Goal**: At every point in the user's journey, answer "What should I do next?" (UX Dream Principle #3). Eliminate dead ends. Make empty states actionable. No fake data (Principle #8).

**Current state**: Dashboard has some conditional rendering but no guided next-step flow. Empty pages show generic placeholders. No post-action suggestions.

**Scope**:
- **Post-deploy guidance**: After deploying agent #1 → "Your OpenClaw agent is live! Now connect a channel." After channel connected → "Send a test message." After verified → "Deploy another bot or configure skills."
- **Setup checklist on dashboard**: For "getting-started" stage users, show a checklist: ✅ Deploy first bot, ☐ Connect a channel, ☐ Verify health, ☐ Configure skills, ☐ Deploy another bot. Each item links to the relevant action.
- **Empty state overhaul**: Every page that can be empty gets a designed empty state with icon, message, and primary CTA. No "0 items" tables. No flat-line charts. Examples:
  - Channels page (no channels): "Connect your first channel" + channel type cards
  - Alerts page (no alerts): "All quiet! No alerts to show." (positive empty state, no CTA needed)
  - Fleets page (no fleets): Don't show this page at all (hidden by progressive disclosure)
- **Contextual suggestions on bot detail**: After bot is healthy, suggest next actions inline: "Add a channel", "Configure skills", "Deploy another bot"
- **"Just deployed" state**: When a bot was deployed < 5 min ago, show gentle onboarding state instead of empty metrics: "Just deployed, waiting for first health check. This usually completes in under 2 minutes."
- **No fake data enforcement**: Trend percentages only shown with 2+ data points. Charts only render with real data. Cost cards say "No cost data yet" instead of "$0.00/hr".

**Files**:
- Create: `apps/web/src/components/guidance/setup-checklist.tsx` — dashboard checklist
- Create: `apps/web/src/components/guidance/next-step-banner.tsx` — contextual suggestion
- Create: `apps/web/src/components/guidance/post-deploy-guide.tsx` — post-deploy next steps
- Create: `apps/web/src/components/ui/empty-state.tsx` — reusable empty state component
- Modify: `apps/web/src/components/dashboard/single-bot-dashboard.tsx` — add checklist + suggestions
- Modify: `apps/web/src/app/page.tsx` — add checklist for getting-started stage
- Modify: `apps/web/src/app/channels/page.tsx` — empty state with channel CTAs
- Modify: `apps/web/src/app/alerts/page.tsx` — positive empty state
- Modify: `apps/web/src/app/bots/[id]/bot-detail-client.tsx` — contextual suggestions + just-deployed state
- Modify: `apps/web/src/components/deploy-wizard/step-deploying.tsx` — post-deploy next steps

**Acceptance criteria**:
- After deploying first bot, dashboard shows setup checklist with clear next actions
- Every empty page has a designed empty state (no "0 items" tables)
- Post-deploy screen shows 3 clear next actions with CTAs
- Bot detail shows "Just deployed" state for bots < 5 min old
- Trend percentages only appear with sufficient data
- Charts only render when real data exists
- No "$0.00" costs shown — "No cost data yet" instead
- Every dead end is eliminated — user always knows what to do next

---

## Phase 2 Implementation Strategy

### Execution Order (7 parallel + 1 sequential)

All 7 WPs in Groups A and B launch in parallel as Task agents. WP2.8 starts after WP2.5 completes.

```
Wave 1 (all parallel):
  Agent 1: WP2.5 Progressive Disclosure Shell     (frontend + small API)
  Agent 2: WP2.6 Universal Deploy Wizard           (frontend refactor)
  Agent 3: WP2.3 Templates & Profiles Pages         (frontend)
  Agent 4: WP2.1 AI Gateway Abstraction             (core + API + frontend)
  Agent 5: WP2.2 Device Pairing Management           (API + frontend)
  Agent 6: WP2.7 Bidirectional Awareness              (API + frontend)
  Agent 7: WP2.4 Integration Tests                     (tests only)

Wave 2 (after WP2.5 completes):
  Agent 8: WP2.8 Next-Step Guidance & Empty States  (frontend, uses UserStageProvider from WP2.5)
```

### Shared Prisma Migration

WPs 2.1, 2.2, and 2.7 all modify `schema.prisma`. To avoid merge conflicts:
- Each WP adds its models/fields to schema.prisma independently
- After all WPs complete, run `pnpm prisma format` and a single `pnpm prisma migrate dev`
- Agent adding models: WP2.1 adds `aiGatewayEnabled`/`aiGatewayUrl` fields. WP2.2 adds `DevicePairing` model. WP2.7 adds `AgentStateSnapshot` model.

### Build & Test Verification

After all WPs complete:
1. `pnpm build` — all packages build cleanly
2. `pnpm test` — all unit tests pass
3. `pnpm prisma migrate dev` — DB migration applies cleanly
4. Manual verification: deploy wizard flow, progressive disclosure transitions, bot detail evolution banner

---

## Phase 3: Polish & Production (5 WPs)

### WP3.1: Inter-Bot Communication Foundation

**Dependencies**: WP1.3 (Real WebSocket), WP2.1 (AI Gateway)

**Goal**: Enable OpenClaws to communicate with each other through Molthub — rule-governed, auditable, hierarchical.

**Scope**:
- `InterBotMessage` model (sender, recipient, content, status, parentMessageId)
- Messaging API: `POST /inter-bot/send` (bot A → Molthub → bot B via Gateway WS `send`)
- Routing rules engine: who can talk to whom (allowlists per team)
- Team model: lead bot + member bots, team goals, shared context
- Task delegation: lead sends task → member executes → result flows back
- Approval gates: sensitive actions require human confirmation before forwarding
- Shared context store per team (key-value, accessible by all team members)
- Full audit trail of all inter-bot messages
- Web UI: Teams page, team hierarchy visualization, message flow viewer

**Files**:
- Create: `apps/api/src/inter-bot/messaging.service.ts`
- Create: `apps/api/src/inter-bot/routing-rules.service.ts`
- Create: `apps/api/src/inter-bot/context-sharing.service.ts`
- Create: `apps/api/src/inter-bot/delegation.service.ts`
- Create: `apps/api/src/inter-bot/inter-bot.controller.ts`
- Create: `apps/api/src/inter-bot/inter-bot.module.ts`
- Modify: `packages/database/prisma/schema.prisma` — add `Team`, `TeamMember`, `InterBotMessage`, `SharedContext`, `ApprovalGate` models
- Create: `apps/web/src/app/teams/page.tsx`
- Create: `apps/web/src/app/teams/[id]/page.tsx`
- Create: `apps/web/src/components/teams/team-hierarchy.tsx`
- Create: `apps/web/src/components/teams/message-flow.tsx`
- Create: `apps/web/src/components/teams/delegation-viewer.tsx`

**Acceptance criteria**:
- Bot A sends message to Bot B via API → delivered via Gateway WS `send`
- Message blocked if routing rules don't allow communication
- Team lead can delegate task → member bot receives → result returns to lead
- Approval gates pause message delivery until human approves
- Shared context readable/writable by all team members
- All messages logged with sender, recipient, content, timestamp
- Teams page shows hierarchy with lead/member roles
- Message flow shows real-time inter-bot communication

---

### WP3.2: Enhanced Observability Dashboard

**Dependencies**: WP1.3 (Real WebSocket), WP2.1 (AI Gateway analytics)

**Goal**: Fleet-wide observability with aggregated metrics, trend visualization, and Prometheus export.

**Scope**:
- Fleet health overview: all instances at a glance with status/health indicators
- Cost dashboard: spend per instance/fleet/workspace, daily/weekly/monthly trends
- Token usage trends: charts over time per model provider
- Channel activity heatmap: messages per channel per hour
- SLO compliance dashboard: current compliance %, breach history
- Alert timeline: incident history with resolution tracking
- Prometheus `/metrics` endpoint for Grafana integration
- Export data (CSV, JSON) for external analysis

**Files**:
- Create: `apps/web/src/app/observability/page.tsx`
- Create: `apps/web/src/components/observability/fleet-overview.tsx`
- Create: `apps/web/src/components/observability/cost-trends.tsx`
- Create: `apps/web/src/components/observability/token-usage.tsx`
- Create: `apps/web/src/components/observability/channel-heatmap.tsx`
- Create: `apps/web/src/components/observability/slo-compliance.tsx`
- Create: `apps/web/src/components/observability/alert-timeline.tsx`
- Create: `apps/api/src/metrics/prometheus-exporter.service.ts`
- Modify: `apps/api/src/metrics/metrics.controller.ts` — add Prometheus text format endpoint
- Modify: `apps/web/src/components/layout/sidebar.tsx` — add Observability nav item

**Acceptance criteria**:
- Fleet overview shows all instances with color-coded health
- Cost trends chart shows daily spend over last 30 days
- Token usage shows per-model breakdown over time
- Channel heatmap shows message volume per hour per channel
- SLO compliance shows current % and breach count
- Prometheus `/metrics` returns valid text format metrics
- Data export works for all views (CSV + JSON)

---

### WP3.3: Performance Optimization & Caching

**Dependencies**: None (can start with Phase 3)

**Goal**: Optimize for production fleets (100+ instances) with Redis caching, pagination, and background jobs.

**Scope**:
- Redis-backed caching (health snapshots: 30s TTL, fleet lists: 60s, config hashes: 5min)
- Cache invalidation on mutations (instance update → invalidate fleet list)
- Cursor-based pagination for large lists (instances, traces, audit events)
- Database index optimization for frequent queries
- Background job queue (BullMQ) for provisioning, state sync, bulk operations
- Rate limiting per API key (100 req/min default)

**Files**:
- Create: `apps/api/src/cache/cache.module.ts`
- Create: `apps/api/src/cache/redis-cache.service.ts`
- Create: `apps/api/src/queue/queue.module.ts`
- Create: `apps/api/src/queue/provisioning.processor.ts`
- Create: `apps/api/src/queue/state-sync.processor.ts`
- Modify: `apps/api/src/health/openclaw-health.service.ts` — cache health snapshots
- Modify: `apps/api/src/bot-instances/bot-instances.service.ts` — pagination + cache
- Modify: `apps/api/src/audit/audit.service.ts` — cursor-based pagination
- Modify: `packages/database/prisma/schema.prisma` — add indexes for common queries

**Acceptance criteria**:
- Health endpoint responds in <50ms (cached)
- Instance list paginated (default 50, max 200)
- Cache hit rate >80% for read-heavy endpoints under load
- Background provisioning doesn't block API responses
- Rate limiter returns 429 at threshold

---

### WP3.4: Security Hardening & Compliance

**Dependencies**: None (can start with Phase 3)

**Goal**: Production-grade security: secrets rotation, RBAC enforcement, encrypted storage, MFA.

**Moltworker lessons**: Multi-layer auth chain (CF Access → Gateway token → Device pairing → CDP secret), timing-safe comparisons.

**Scope**:
- Automated Gateway token rotation (every 90 days, via `config.apply`)
- RBAC enforcement at every endpoint (currently defined but not enforced)
- Secret encryption at rest in DB (AES-256-GCM for `authToken`, API keys)
- Audit log export (CSV, JSON) with date range filtering
- IP allowlisting for admin/debug endpoints
- Session management (token expiry, refresh tokens)
- Timing-safe comparisons for all token validations

**Files**:
- Create: `apps/api/src/secrets/rotation.service.ts`
- Create: `apps/api/src/secrets/rotation.scheduler.ts`
- Create: `apps/api/src/auth/rbac.guard.ts` — endpoint-level enforcement
- Create: `apps/api/src/auth/ip-allowlist.guard.ts`
- Create: `apps/api/src/audit/export.service.ts`
- Create: `apps/api/src/crypto/encryption.service.ts` — AES-256-GCM
- Modify: `apps/api/src/auth/jwt-auth.guard.ts` — add role checks
- Modify: `packages/database/prisma/schema.prisma` — mark encrypted fields

**Acceptance criteria**:
- Token rotation runs on schedule and applies new token via Gateway WS
- RBAC guard blocks VIEWER from DELETE/POST endpoints (403)
- Secrets encrypted at rest, decrypted only when needed
- Audit export includes all events with user attribution and date filtering
- IP allowlist enforced on `/debug/*` endpoints
- All token comparisons use timing-safe equality

---

### WP3.5: Documentation & Developer Onboarding

**Dependencies**: None (can start with Phase 3)

**Goal**: Comprehensive docs for self-hosting, contributing, and API usage.

**Scope**:
- Quickstart guide (first bot in <5 minutes)
- Architecture overview with diagrams
- API reference auto-generated from Swagger/OpenAPI
- Deployment guides per target (local, Docker, K8s, AWS ECS, Cloudflare Workers)
- Security best practices guide
- Troubleshooting runbook (common issues + solutions)
- Contributing guide (local dev setup, PR process, test requirements)
- CLI reference

**Files**:
- Create: `docs/quickstart.md`
- Create: `docs/architecture.md`
- Create: `docs/deployment/local.md`
- Create: `docs/deployment/docker.md`
- Create: `docs/deployment/kubernetes.md`
- Create: `docs/deployment/aws-ecs.md`
- Create: `docs/deployment/cloudflare-workers.md`
- Create: `docs/security.md`
- Create: `docs/troubleshooting.md`
- Create: `docs/contributing.md`
- Create: `docs/api-reference.md`
- Create: `docs/cli-reference.md`

**Acceptance criteria**:
- Quickstart gets user from zero to running bot in documented steps
- Architecture doc covers all packages and their relationships
- Each deployment guide is copy-pasteable and tested
- Security guide covers the full auth chain and threat model
- Troubleshooting covers top 10 issues from moltworker's patterns
- Contributing guide enables new developers to submit PRs

---

## Moltworker Lessons Applied (Summary)

| Moltworker Pattern | Where Applied | WP |
|---|---|---|
| R2/S3 state sync with timestamp validation | Universal state persistence for all targets | WP1.2 |
| Cloudflare Workers deployment | New deployment target type | WP1.1 |
| Config generation from env vars | CF Workers config generator | WP1.1 |
| AI Gateway provider injection | AI Gateway abstraction layer | WP2.1 |
| WebSocket message interception | Gateway client interceptors | WP1.4 |
| Loading page during cold start | Provisioning progress UX | WP1.6 |
| Device pairing admin UI | Device pairing management | WP2.2 |
| Debug endpoints (/debug/*) | Per-instance debug routes | WP1.5 |
| Idempotent process lifecycle | Reconciler lifecycle manager | WP1.1, WP2.4 |
| Multi-layer auth chain | Security hardening | WP3.4 |
| Colocated tests with mocks | Unit test coverage | WP1.7 |
| Real channel auth (QR pairing) | Channel auth integration | WP1.8 |
| Cron-based backup sync | State sync scheduler | WP1.2 |
| Timing-safe string comparison | Token validation security | WP3.4 |

---

## What Molthub Adds Beyond Moltworker

Moltworker is single-tenant, single-instance. Molthub adds:

| Capability | Moltworker | Molthub |
|---|---|---|
| Fleet management | No | Yes — manage 100+ bots |
| Multi-cloud deployment | Cloudflare only | Local, Docker, K8s, AWS, Azure, GCP, CF |
| Inter-bot communication | No | Yes — rule-governed, auditable |
| Team hierarchy | No | Yes — lead + member bots |
| Policy enforcement | No | Yes — 49 rule types, 3 built-in packs |
| SLO tracking | No | Yes — uptime, latency, error rate |
| Cost management | No | Yes — per-bot, per-fleet budgets |
| Config templating | No | Yes — templates + profiles + overlays |
| Rollout strategies | No | Yes — all/percentage/canary |
| Security audit | No | Yes — auto-scoring + remediation |
| RBAC | CF Access only | Yes — 4 roles with endpoint-level enforcement |
| Observability | Basic logs | Fleet dashboard + Prometheus + alerting |

---

## Verification Plan

After all WPs complete:
1. `pnpm build` — all packages build cleanly
2. `pnpm test` — all unit tests pass (80%+ coverage)
3. `pnpm test:e2e` — all Playwright E2E tests pass
4. `pnpm test:integration` — deployment target integration tests pass (Docker at minimum)
5. Create bot via wizard → template generates valid openclaw.json
6. Deploy to Docker target → Gateway health check passes
7. Channel auth (simulated) → QR pairing flow completes
8. Health dashboard shows real Gateway data
9. Debug endpoints return instance runtime state
10. Inter-bot messaging works between two instances
11. Prometheus /metrics endpoint returns valid metrics
12. State backup/restore round-trips successfully
