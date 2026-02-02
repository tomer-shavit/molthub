# Plan: A2A Protocol Integration for Bot-to-Bot Delegation

## Goal
Modify Clawster's bot-to-bot delegation to follow the A2A (Agent-to-Agent) protocol. Each OpenClaw bot managed by Clawster becomes an A2A-compliant agent with an Agent Card, and inter-bot communication uses A2A JSON-RPC 2.0 methods (`message/send`, `tasks/get`, `tasks/cancel`).

## Current State
- `BotDelegationService.attemptDelegation()` checks routing rules, then calls `BotInstancesService.chat()` directly
- `chat()` creates a temporary GatewayClient, calls `client.agent()` (WebSocket RPC), returns response
- A Trace record is created for audit
- No A2A protocol, no Agent Cards, no JSON-RPC 2.0 endpoints

## OpenClaw Integration Context

### How OpenClaw Actually Works (Must-Know for This Plan)

1. **Gateway WebSocket `agent` method** accepts: `message`, `idempotencyKey` (required), `agentId`, `sessionId`, `sessionKey`, `to`, `replyTo`, `channel`, `attachments` (max 5MB), `extraSystemPrompt`, `timeout`, `thinking`. Clawster's `GatewayClient` wrapper currently uses a simplified `AgentRequest { prompt, context?, timeoutMs? }` — this wrapper will need extending.

2. **Two-phase response**: Gateway ACKs immediately with `{ runId, status: "accepted" }`, then streams `AgentEvent` frames (`{ runId, seq, stream, ts, data }`) with monotonic `seq` for gap detection, and finally sends completion `{ runId, status: "ok"|"error", result }`.

3. **OpenClaw's native A2A is intra-gateway only**: `sessions_send`, `sessions_list`, `sessions_history` tools let agents within the *same* gateway talk to each other. There is NO cross-gateway federation. Clawster builds the cross-instance A2A layer.

4. **OpenClaw has HTTP APIs** on the same gateway port:
   - `POST /v1/chat/completions` — OpenAI-compatible (supports streaming via SSE)
   - `POST /v1/responses` — OpenResponses protocol
   - `POST /tools/invoke` — direct tool invocation
   All require bearer token auth (`gateway.auth.token`).

5. **Multi-agent per gateway**: OpenClaw supports multiple agents per gateway via the `agents.list` config and channel bindings. The `agent` RPC method accepts an `agentId` parameter to target a specific agent.

6. **Skills come from config**, not from Clawster's SkillPack table. Live skills are in `openclaw.json` under `skills.entries` and `skills.allowBundled`. Clawster's SkillPacks represent *desired* state; actual loaded skills may differ.

### Design Implications

- **v1 scope**: Single default agent per BotInstance. Multi-agent targeting is a future enhancement.
- **Transport choice**: `message/send` (one-shot) will use the HTTP `/v1/chat/completions` endpoint for simplicity and reliability (no WebSocket setup/teardown per request). `message/stream` will use WebSocket via GatewayClient for real streaming.
- **Agent Card skills**: Generated from both Clawster SkillPacks (desired state) AND live config via `configGet()` when the gateway is connected. Falls back to SkillPacks-only when gateway is offline.
- **Co-located bots**: When source and target bots share the same OpenClaw gateway, Clawster still routes through the A2A layer (not OpenClaw's native `sessions_send`) for consistency and auditability. Native routing is a future optimization.

## Architecture

Clawster acts as the A2A server for all its managed bots. Each bot gets its own A2A endpoint URL. External A2A clients (or other Clawster bots) send JSON-RPC 2.0 requests to Clawster, which translates them into OpenClaw gateway calls.

```
External A2A Client (or Clawster bot-to-bot)
        │
        ▼
POST /a2a/:botId  (JSON-RPC 2.0)
        │
        ▼
  A2aController → A2aService
        │
        ├── Authenticate (JWT for internal, API key for external)
        │
        ├── Validate message parts (TextPart supported; FilePart → attachment; DataPart → reject)
        │
        ├── Check routing rules (existing BotRoutingService)
        │     └── [match?] → recursive A2A delegation to target bot
        │
        ├── Create Trace (type: "A2A_TASK")
        │
        ├── [message/send] → HTTP POST /v1/chat/completions → OpenClaw Gateway
        │
        ├── [message/stream] → GatewayClient.agent() (WebSocket) → SSE response
        │
        └── Response → A2A Task object → JSON-RPC response
```

### Key Decisions
1. **Single controller, per-bot URL**: `POST /a2a/:botInstanceId` with Agent Cards at `GET /a2a/:botInstanceId/agent-card`
2. **No SDK dependency**: Implement A2A JSON-RPC directly (5 methods, ~200 lines of types) — cleaner NestJS integration than wrapping the Express-oriented `@a2a-js/sdk`
3. **Traces as Task store**: A2A Task lifecycle maps to Trace records (no new DB model). Trace `type` field is a plain String so `"A2A_TASK"` needs no migration.
4. **Dual transport**: HTTP for `message/send` (simpler, no connection management), WebSocket for `message/stream` (real streaming)
5. **Backward compatible**: Existing `POST /bot-instances/:id/chat` continues to work; delegation service gets a new A2A-native path
6. **Dual auth**: JWT for internal Clawster clients, API keys for external A2A clients
7. **v1 = single agent per instance**: Multi-agent targeting (`agentId`) deferred to v2

---

## Phase 0: Gateway Client Enhancements (Prerequisite)

### 0a. Extend GatewayClient AgentRequest
**Modify**: `packages/gateway-client/src/protocol.ts`

Current `AgentRequest` is:
```typescript
{ prompt: string; context?: Record<string, unknown>; timeoutMs?: number }
```

Extend to match OpenClaw's actual agent schema:
```typescript
{
  prompt: string;              // maps to OpenClaw's `message`
  context?: Record<string, unknown>;
  timeoutMs?: number;
  idempotencyKey?: string;     // NEW — required by OpenClaw, auto-generated if omitted
  agentId?: string;            // NEW — target specific agent (v2)
  sessionId?: string;          // NEW — session continuity
  attachments?: Array<{        // NEW — file forwarding
    type: string;
    mimeType: string;
    fileName: string;
    content: string;           // base64
  }>;
}
```

### 0b. Add idempotencyKey auto-generation in GatewayClient
**Modify**: `packages/gateway-client/src/client.ts`

In `agent()` method, if `request.idempotencyKey` is not provided, generate one via `uuidv4()`. This ensures OpenClaw's deduplication works correctly.

### 0c. Add HTTP transport method to GatewayClient
**New method**: `packages/gateway-client/src/client.ts`

Add `chatCompletion(message: string, options?)` method that:
- Makes HTTP POST to `http://${host}:${port}/v1/chat/completions`
- Uses bearer token auth (same `gateway.auth.token`)
- Returns response without needing WebSocket connection
- Used by `message/send` for one-shot calls

---

## Phase 1: A2A Types + Agent Card Service + Auth (Independent)

### 1a. Create A2A protocol types
**New file**: `apps/api/src/a2a/a2a.types.ts`

Types to define:
- JSON-RPC 2.0: `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`
- Agent Card: `AgentCard`, `AgentSkill`, `AgentCapabilities`, `AgentAuthentication`
- Messages: `A2AMessage`, `TextPart`, `FilePart`, `DataPart`, `Part`
- Tasks: `A2ATask`, `TaskStatus`, `TaskState` (submitted/working/input-required/completed/failed/canceled), `Artifact`
- Method params: `MessageSendParams`, `TasksGetParams`, `TasksCancelParams`
- Streaming events: `TaskStatusUpdateEvent`, `TaskArtifactUpdateEvent`
- Helper: `jsonRpcSuccess()`, `jsonRpcError()` response builders
- Error codes: standard JSON-RPC errors + A2A-specific (`-32001 TaskNotFound`, `-32002 UnsupportedPart`, `-32003 AgentUnavailable`)

### 1b. Create Agent Card generation service
**New file**: `apps/api/src/a2a/a2a-agent-card.service.ts`

- Inject `PrismaService`, `GatewayManager` (from gateway-client package)
- `generate(botInstanceId: string): Promise<AgentCard>` method that:
  - Loads BotInstance with relations (skillPacks, openclawProfile, gatewayConnection)
  - Extracts identity info from `desiredManifest` (name, description from system prompt)
  - **Skills resolution** (hybrid approach):
    1. If gateway is connected → call `configGet()` and extract `skills.entries` + `skills.allowBundled` for live skills
    2. Fall back to Clawster SkillPacks as desired-state skills
    3. Merge both sources, deduplicate by skill name
  - Sets `url` to `${CLAWSTER_BASE_URL}/a2a/${botInstanceId}`
  - Sets capabilities: `{ streaming: true, pushNotifications: false, stateTransitionHistory: true }`
  - Sets authentication: `{ schemes: ["bearer"], apiKeyEndpoint: "/a2a/${botInstanceId}/api-key" }` (both JWT and API key accepted)
  - Returns `AgentCard`

### 1c. Create API key auth for external A2A clients
**New file**: `apps/api/src/a2a/a2a-auth.guard.ts`

- Custom guard that accepts EITHER:
  - Standard Clawster JWT (for internal bot-to-bot and dashboard calls)
  - Per-bot API key (for external A2A clients)
- API keys stored in `BotInstance.metadata` or a new `a2aApiKey` field
- Guard extracts bearer token from `Authorization` header, tries JWT first, falls back to API key lookup

**Modify**: `packages/database/prisma/schema.prisma`
- Add `a2aApiKey String?` field to `BotInstance` model (nullable, generated on demand)

---

## Phase 2: A2A Service (Core Logic) — Depends on Phase 0 + 1

### 2a. Create A2A service
**New file**: `apps/api/src/a2a/a2a.service.ts`

Inject: `BotInstancesService`, `BotRoutingService`, `TracesService`, `PrismaService`, `GatewayManager`

**Methods:**

`messageSend(botInstanceId, params: MessageSendParams, requestId, delegationContext?)`:
1. **Validate and extract parts** from `params.message.parts`:
   - `TextPart` → extract text content
   - `FilePart` → convert to OpenClaw attachment format (`{ type, mimeType, fileName, content }`, enforce 5MB limit)
   - `DataPart` → return JSON-RPC error `-32002 UnsupportedPart` ("DataPart not supported in v1")
2. Check routing rules via `BotRoutingService.findMatchingRules(botInstanceId, text)`
3. If match → recursive call to `messageSend(targetBotId, ...)` with delegation trace
4. If no match → proceed with this bot
5. Generate `idempotencyKey` (UUID) for deduplication
6. Create Trace: `type: "A2A_TASK"`, `status: "PENDING"`, `input: JSON(message)`, `metadata: { a2aTaskId, state: "submitted", idempotencyKey, delegationContext }`
7. **Call via HTTP**: Use `GatewayClient.chatCompletion(text, { attachments })` — HTTP POST to `/v1/chat/completions` on the gateway (no WebSocket needed for one-shot)
8. On success → update Trace status to `SUCCESS`, metadata state to `completed`
9. Build and return `A2ATask` object with artifacts (response text as `TextPart`)
10. On error → update Trace to `ERROR`, metadata state to `failed`, return error task

`messageStream(botInstanceId, params, requestId)`:
1. Same part validation as messageSend
2. Same routing check
3. Create Trace with state `"submitted"`
4. Register in A2aTaskStore (for cancel support)
5. Connect via GatewayClient (WebSocket), call `agent({ prompt: text, idempotencyKey, sessionId, attachments })`
6. Return an Observable<MessageEvent> for NestJS SSE support
7. **Event mapping from OpenClaw → A2A**:
   - `AgentEvent { runId, seq, stream, data }` where data contains text deltas → `TaskStatusUpdateEvent { state: "working", message: { parts: [TextPart(delta)] } }`
   - Track `seq` numbers; if gap detected, emit warning metadata but continue (no replay available)
   - Tool-call events in `data` → emit as `TaskStatusUpdateEvent` with metadata `{ toolCall: data }` (informational)
   - On completion → `TaskArtifactUpdateEvent { artifact: { parts: [TextPart(fullResponse)] } }` + final `TaskStatusUpdateEvent { state: "completed" }`
   - On error → `TaskStatusUpdateEvent { state: "failed", message: { parts: [TextPart(errorMessage)] } }`
8. Update Trace on completion/error
9. Cleanup: remove from A2aTaskStore

`tasksGet(params: TasksGetParams)`:
1. Look up Trace by ID (the traceId IS the A2A task ID)
2. Reconstruct `A2ATask` from Trace fields (status mapping: SUCCESS→completed, ERROR→failed, PENDING→working)
3. If Trace metadata contains `a2aTaskState: "canceled"` → state is `canceled` regardless of Trace status
4. Return task with history if `stateTransitionHistory` requested

`tasksCancel(params: TasksCancelParams)`:
1. Look up Trace by ID
2. **Active streaming task**: Check A2aTaskStore — if task has an active GatewayClient, disconnect it to force-stop the agent
3. If PENDING → mark Trace as ERROR with `{ a2aTaskState: "canceled" }` metadata
4. **Note**: Cancel is best-effort. For non-streaming (HTTP) calls already in-flight, the OpenClaw agent may complete even after Clawster marks the task as canceled. The Trace will reflect the cancel intent regardless.
5. Return updated task

### 2b. Create in-memory task store for active streaming tasks
**New file**: `apps/api/src/a2a/a2a-task.store.ts`

- `Map<taskId, { client: GatewayClient, subject: Subject<MessageEvent>, runId: string, lastSeq: number }>`
- Used by messageStream to track active SSE connections
- `cancel(taskId)` → disconnects the GatewayClient (sends SIGTERM-equivalent to agent)
- Cleanup on completion/cancel/timeout (configurable timeout, default 10 minutes)
- Periodic sweep for orphaned entries (every 60s)

---

## Phase 3: A2A Controller + Module (Depends on Phase 2)

### 3a. Create A2A controller
**New file**: `apps/api/src/a2a/a2a.controller.ts`

```
GET  /a2a/:botInstanceId/agent-card          → AgentCardService.generate() [@Public — no auth]
GET  /a2a/:botInstanceId/.well-known/agent    → Redirect to /agent-card (A2A spec discovery)
POST /a2a/:botInstanceId                      → JSON-RPC dispatch [A2aAuthGuard]
POST /a2a/:botInstanceId/api-key/generate     → Generate API key for external clients [JWT only]
```

JSON-RPC dispatch on `body.method`:
- `message/send` → `a2aService.messageSend()`
- `message/stream` → `a2aService.messageStream()` (SSE response)
- `tasks/get` → `a2aService.tasksGet()`
- `tasks/cancel` → `a2aService.tasksCancel()`
- Unknown method → JSON-RPC error `-32601 Method not found`

Validation:
- Check `body.jsonrpc === "2.0"`, `body.method` exists, `body.id` exists
- Return `-32600 Invalid Request` for malformed JSON-RPC
- Validate params with Zod schemas per method

### 3b. Create A2A module
**New file**: `apps/api/src/a2a/a2a.module.ts`

Imports: `BotInstancesModule` (forwardRef), `TracesModule`, `BotRoutingModule`
Providers: `A2aService`, `A2aAgentCardService`, `A2aTaskStore`, `A2aAuthGuard`
Controllers: `A2aController`
Exports: `A2aService`

### 3c. Register A2A module
**Modify**: `apps/api/src/app.module.ts`
- Add `A2aModule` to imports

---

## Phase 4: Wire Delegation Service to A2A (Depends on Phase 2+3)

### 4a. Update BotDelegationService
**Modify**: `apps/api/src/bot-routing/bot-delegation.service.ts`

- Inject `A2aService`
- Modify `attemptDelegation()` to use A2A protocol internally:
  - Instead of calling `BotInstancesService.chat()` directly, construct an A2A `message/send` call via `A2aService.messageSend(targetBotId, ...)`
  - The A2A service handles trace creation, so remove duplicate trace creation from delegation service
  - Map `A2ATask` result back to `DelegationResult` for backward compatibility with existing callers
- The `POST /bot-instances/:id/chat` endpoint remains unchanged — it still calls `attemptDelegation()`, which now internally uses A2A

### 4b. Update BotRoutingModule
**Modify**: `apps/api/src/bot-routing/bot-routing.module.ts`
- Add `A2aModule` (forwardRef) to imports so BotDelegationService can inject A2aService

---

## Phase 5: Frontend — Agent Card Display (Independent of Phase 2-4)

### 5a. Add Agent Card API method
**Modify**: `apps/web/src/lib/api.ts`
- Add `getAgentCard(botInstanceId: string): Promise<AgentCard>` method
- Add `generateA2aApiKey(botInstanceId: string): Promise<{ apiKey: string }>` method
- Add `AgentCard` type (matching API response)

### 5b. Display Agent Card on bot detail page
**Modify**: `apps/web/src/app/bots/[id]/bot-detail-client.tsx`
- Add an "A2A" tab or section in the bot detail page
- Show: Agent Card URL (copyable), agent name, skills, capabilities
- Show the A2A endpoint URL for external clients to use
- Show/generate API key for external access (with copy button, shown once)
- Show example `curl` command for `message/send`

---

## Files Summary

| File | Action | Phase |
|------|--------|-------|
| `packages/gateway-client/src/protocol.ts` | Modify — extend AgentRequest | 0a |
| `packages/gateway-client/src/client.ts` | Modify — idempotencyKey auto-gen + chatCompletion() | 0b, 0c |
| `apps/api/src/a2a/a2a.types.ts` | **New** | 1a |
| `apps/api/src/a2a/a2a-agent-card.service.ts` | **New** | 1b |
| `apps/api/src/a2a/a2a-auth.guard.ts` | **New** | 1c |
| `packages/database/prisma/schema.prisma` | Modify — add `a2aApiKey` to BotInstance | 1c |
| `apps/api/src/a2a/a2a.service.ts` | **New** | 2a |
| `apps/api/src/a2a/a2a-task.store.ts` | **New** | 2b |
| `apps/api/src/a2a/a2a.controller.ts` | **New** | 3a |
| `apps/api/src/a2a/a2a.module.ts` | **New** | 3b |
| `apps/api/src/app.module.ts` | Modify — add A2aModule | 3c |
| `apps/api/src/bot-routing/bot-delegation.service.ts` | Modify — use A2aService for delegation | 4a |
| `apps/api/src/bot-routing/bot-routing.module.ts` | Modify — import A2aModule | 4b |
| `apps/web/src/lib/api.ts` | Modify — add getAgentCard + generateApiKey | 5a |
| `apps/web/src/app/bots/[id]/bot-detail-client.tsx` | Modify — add A2A section | 5b |

## Parallelization

```
Phase 0 (prerequisite, independent of A2A app code):
├── 0a: Extend AgentRequest types
├── 0b: Add idempotencyKey auto-generation
└── 0c: Add chatCompletion() HTTP method

Phase 1 (after Phase 0, all three independent of each other):
├── 1a: A2A types
├── 1b: Agent Card service (needs types from 1a, but can start in parallel)
└── 1c: Auth guard + Prisma migration

Phase 2 (after Phase 1):
├── 2a: A2A service
└── 2b: Task store

Phase 3 (after Phase 2):
├── 3a: Controller
├── 3b: Module
└── 3c: Register in app.module

Phase 4 (after Phase 3):
├── 4a: Update delegation service
└── 4b: Update routing module

Phase 5 (independent, can run in parallel with Phase 2-4):
├── 5a: API client method
└── 5b: Bot detail UI
```

## Scoping Decisions (v1 vs Future)

| Decision | v1 (This Plan) | Future |
|----------|-----------------|--------|
| Agents per instance | Single default agent | Multi-agent with `agentId` targeting |
| Transport for send | HTTP `/v1/chat/completions` | Connection pooling, circuit breakers |
| Transport for stream | WebSocket via GatewayClient | HTTP SSE via `/v1/chat/completions?stream=true` as fallback |
| Part types | TextPart + FilePart (→attachment) | DataPart, structured output |
| External auth | Per-bot API key | OAuth2 client credentials, OIDC |
| Co-located bot optimization | Always route through A2A layer | Detect co-location, use OpenClaw native `sessions_send` |
| Task cancel | Best-effort (disconnect client) | Graceful cancel via future OpenClaw `agent.cancel` RPC |
| Agent Card skills | Hybrid (live config + SkillPacks) | Real-time skill sync, OpenClawHub registry |
| Discovery | Manual Agent Card URL | `.well-known/agent` auto-discovery, mDNS |

## Verification

1. `pnpm build` succeeds
2. `GET /a2a/:botId/agent-card` returns valid Agent Card JSON with skills from live config
3. `POST /a2a/:botId` with `message/send` JSON-RPC (JWT auth) → bot responds, Trace created with type `A2A_TASK`
4. `POST /a2a/:botId` with `message/send` JSON-RPC (API key auth) → same as above
5. `POST /a2a/:botId` with `message/send` containing FilePart → forwarded as OpenClaw attachment
6. `POST /a2a/:botId` with `message/send` containing DataPart → returns `-32002 UnsupportedPart` error
7. `POST /a2a/:botId` with `message/stream` → SSE events with seq-correlated deltas, completion artifact
8. `POST /a2a/:botId` with `tasks/get` → returns task state from Trace
9. `POST /a2a/:botId` with `tasks/cancel` on streaming task → client disconnected, task marked canceled
10. Bot-to-bot delegation via chat endpoint still works (backward compatibility)
11. Delegation now creates A2A-formatted traces with idempotency keys
12. Bot detail page shows A2A endpoint URL, Agent Card info, and API key generation
13. All existing tests pass
14. Prisma migration applies cleanly
