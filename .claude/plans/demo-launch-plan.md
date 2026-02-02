# Launch Demo Plan: "Zero to Autonomous Agent Team"

## Goal
Build the missing features needed for a 3-4 minute launch video that demonstrates Clawster's full vision. The demo follows Sarah (a solo developer) from zero to running an autonomous agent team — deploying bots, seeing them evolve, watching them collaborate, and getting real-time alerts.

---

## Demo Script (3:30)

### Opening Hook (0:00 - 0:15)
*Empty browser, fresh Clawster URL*
> "What if you could deploy an autonomous AI agent — with its own personality, connected to your real messaging channels, secured by default — in under 2 minutes? And then deploy a second one, and have them work together?"

### Act 1: First Bot Deploy (0:15 - 1:15)
1. Fresh Clawster opens → full-screen wizard
2. Pick "Support Bot" template → toggle Telegram → name it → Deploy
3. Real-time terminal streams docker build, config writes, gateway startup
4. All steps go green → "Your OpenClaw agent is live!"
5. **Open built-in chat panel** → talk to the bot inside Clawster → bot responds
6. Quick cut to Telegram → same bot responds there too

### Act 2: The Dashboard Comes Alive (1:15 - 1:45)
1. Dashboard shows support-bot card: green health, Telegram connected, uptime ticking
2. Click into bot detail → Evolution tab → "This bot added 2 skills since deployment"
3. Setup checklist nudges: "Deploy another bot"

### Act 3: Second Bot, Same Speed (1:45 - 2:15)
1. "Deploy New Bot" → "DevOps Bot" template → Slack → Deploy
2. Terminal streams, all green
3. Dashboard: TWO bot cards, both healthy

### Act 4: Mind-Blow Features (2:15 - 3:15)
1. **Bot-to-bot delegation**: In the chat panel, ask support-bot about infrastructure. Support-bot routes to devops-bot. Response flows back. Sarah sees the delegation in the traces view.
2. **Slack alert on token spike**: devops-bot starts a heavy task. Token usage spikes. Sarah's Slack buzzes: "devops-bot token usage spiked 340%." She opens the cost dashboard — per-bot breakdown visible.
3. **Live config push**: Sarah edits support-bot's system prompt in a friendly UI. Hits Apply. Next chat message reflects the new personality. No restart.

### Closing (3:15 - 3:30)
*Dashboard view: two bots, healthy, active*
> "Two autonomous agents. Deployed in minutes. Talking to each other. Monitored. Secured. Evolving on their own. This is Clawster."

---

## Feature Build Plan

### Feature 1: Slack/Webhook Alert Notifications
**Effort**: Low | **Demo Impact**: High (phone buzzes during demo)

**What**: When an alert fires (health degraded, token spike, channel disconnected), send a notification to a configured Slack webhook, email, or arbitrary webhook URL.

**Current state**: AlertingService exists, fires alerts internally (stored in DB). No external notification delivery.

#### Tasks

**1a. API: Notification channel CRUD + DB model** (Independent)
- Add `NotificationChannel` model to Prisma schema:
  ```
  NotificationChannel {
    id, workspaceId, name, type (SLACK_WEBHOOK | WEBHOOK | EMAIL),
    config (JSON - url, headers, email addresses),
    enabled, createdAt, updatedAt
  }
  ```
- Add `AlertNotificationRule` model linking alert severity/types to notification channels
- Create `NotificationChannelsController` with CRUD endpoints
- Create `NotificationChannelsService`

**1b. API: Notification delivery service** (Depends on 1a)
- Create `NotificationDeliveryService` that:
  - Listens for new alerts from `AlertingService`
  - Looks up matching `AlertNotificationRule`s
  - Formats message per channel type (Slack Block Kit for Slack, JSON for webhook)
  - Sends via HTTP POST (Slack webhook URL / generic webhook)
  - Stores delivery status
- Wire into `AlertingService.createAlert()` to trigger delivery

**1c. Web: Notification settings UI** (Depends on 1a API being done)
- New page `/settings/notifications` (or section in `/alerts` page)
- Form to add Slack webhook URL with "Test" button
- List of notification rules: which alert types/severities → which channels
- Simple card-based UI

**Verification**: Configure a Slack webhook → trigger a test alert → Slack message arrives.

---

### Feature 2: Token Spike Detection Alert Rule
**Effort**: Low | **Demo Impact**: High (triggers the Slack notification)

**Current state**: `CostEvent` records exist with token counts per bot. AlertingService has cron-based evaluation. No cost-based alert rules.

#### Tasks

**2a. API: Cost spike detection in AlertingService** (Independent — can parallel with 1a)
- Add new alert rule type `token_spike` to `AlertingService.evaluateAlerts()`
- Query recent `CostEvent`s per bot instance (last 5 min vs previous 30 min baseline)
- If usage exceeds threshold (configurable, default 200% of baseline), fire alert with severity WARNING
- Alert payload includes: bot name, spike percentage, current burn rate, token counts

**2b. API: Budget threshold alerts** (Independent — can parallel with 2a)
- Add alert rule type `budget_threshold`
- When cumulative cost approaches budget limit (80%, 100%), fire alert
- Links to existing `BudgetConfig` model

**Verification**: Generate a burst of CostEvents for a bot → alert fires → if Feature 1 is done, Slack notification arrives.

---

### Feature 3: Built-in Chat UI
**Effort**: Medium | **Demo Impact**: Very High (demo is self-contained, no app switching)

**What**: A chat panel in Clawster's bot detail page where Sarah can talk to any bot directly. Uses the Gateway WebSocket `agent` RPC method.

**Current state**: `GatewayClient` already has `agent()` method that sends messages and streams responses. No UI for it.

#### Tasks

**3a. API: Chat relay endpoint** (Independent)
- Add `POST /bot-instances/:id/chat` endpoint to BotInstancesController
- Accepts `{ message: string, sessionId?: string }`
- Uses `GatewayClient.agent()` to send message to the bot's gateway
- Returns streamed response (SSE) or waits for completion and returns full response
- Stores `sessionId` for conversation continuity

**3b. Web: Chat panel component** (Can start in parallel with 3a using mock data)
- Create `apps/web/src/components/chat/bot-chat-panel.tsx`
  - Message list with user/bot message bubbles
  - Input field with send button
  - Streaming response indicator (typing dots → text appears)
  - Session management (new conversation / continue)
  - Collapsible/slideover panel (doesn't replace current page)
- Create `apps/web/src/hooks/use-bot-chat.ts`
  - Manages chat state, sends messages via API, handles SSE streaming

**3c. Web: Integrate chat into bot detail page** (Depends on 3a + 3b)
- Add "Chat" button to bot detail header
- Opens chat panel as a slide-over from the right
- Also accessible from bot cards on dashboard (quick chat icon)

**Verification**: Open bot detail → click Chat → type a message → bot responds in real-time with streaming text.

---

### Feature 4: Bot-to-Bot Delegation / Routing
**Effort**: High — split into smaller pieces | **Demo Impact**: Highest (the "holy shit" moment)

**What**: Define routing rules so Bot A can delegate questions to Bot B. When support-bot gets an infra question, it asks devops-bot and relays the answer.

**Current state**: OpenClaw has `bindings` for multi-agent routing within a single gateway. No cross-gateway delegation exists.

#### Sub-features (split for incremental verification):

**4a. API: Bot routing rules model + CRUD** (Independent)
- Add `BotRoutingRule` Prisma model:
  ```
  BotRoutingRule {
    id, workspaceId,
    sourceBotId (FK → BotInstance),
    targetBotId (FK → BotInstance),
    triggerPattern (string - regex or keyword match),
    description (string - "infrastructure questions"),
    priority (int),
    enabled (bool),
    createdAt, updatedAt
  }
  ```
- Create `BotRoutingController` + `BotRoutingService` with CRUD
- Endpoints: `GET/POST/PUT/DELETE /bot-routing-rules`

**4b. API: Delegation execution service** (Depends on 4a)
- Create `BotDelegationService`:
  - Receives a message + source bot context
  - Evaluates routing rules to find matching target bot
  - Sends message to target bot via its `GatewayClient.agent()` (reuses chat infrastructure from Feature 3a)
  - Returns target bot's response to the source bot
  - Creates a `Trace` record linking source → target for audit/visualization
- Wire into the chat relay endpoint: when a bot's response indicates delegation (or when routing rules match the user's input), trigger delegation

**4c. API: Delegation via OpenClaw tool/skill** (Depends on 4b)
- Create an MCP tool or OpenClaw skill that the source bot can call: `delegate_to_bot({ botName, message })`
- This tool calls back to Clawster API which executes the delegation
- The bot autonomously decides when to delegate based on its system prompt
- Alternative simpler approach: Clawster intercepts the user message, checks routing rules, and if matched, sends to target bot first, then feeds result as context to source bot

**4d. Web: Routing rules configuration UI** (Depends on 4a)
- New section in bot detail page or a dedicated `/routing` page
- Visual: "When [support-bot] receives [infrastructure questions] → delegate to [devops-bot]"
- Simple form: source bot (dropdown), pattern (text), target bot (dropdown)
- List of active rules with enable/disable toggle

**4e. Web: Delegation trace visualization** (Depends on 4b + existing traces UI)
- In the traces view, show delegation chains: User → support-bot → devops-bot → response
- Visual connector lines or nested trace entries
- Each step shows: who handled it, response time, token usage

**Verification (incremental)**:
- 4a: CRUD routing rules via API ✓
- 4b: Send a chat message that matches a rule → see delegation happen in logs ✓
- 4c: Bot autonomously delegates without explicit routing rule match ✓
- 4d: Configure rules via UI ✓
- 4e: See delegation chain in traces ✓

---

### Feature 5: Friendly Config Push UI
**Effort**: Medium | **Demo Impact**: Medium (live personality change)

**Current state**: Config editor exists as raw JSON editor. `config.patch` is implemented in gateway-client.

#### Tasks

**5a. Web: Structured config editor component** (Independent)
- Create `apps/web/src/components/openclaw/config-sections-editor.tsx`
- Sections with friendly forms:
  - **Identity**: Name, emoji, personality/system prompt (textarea)
  - **Tools**: Tool profile dropdown (minimal/coding/messaging/full), allow/deny lists
  - **Channels**: Per-channel settings (DM policy, group policy)
  - **Model**: Primary model picker, fallbacks
- Each section is a collapsible card with form fields
- "Apply Changes" button per section or global

**5b. API: Partial config update endpoint** (Independent)
- Add `PATCH /bot-instances/:id/config` endpoint
- Accepts partial config object (e.g., just `{ agents: { defaults: { identity: { name: "New Name" } } } }`)
- Uses `GatewayClient.configGet()` to get current hash
- Uses `GatewayClient.configPatch()` with the partial update + baseHash
- Returns success/failure with validation errors

**5c. Web: Wire editor to API** (Depends on 5a + 5b)
- Connect structured editor forms to the PATCH endpoint
- Show success toast: "Config applied — changes are live"
- Show validation errors inline if config is rejected

**Verification**: Edit system prompt in UI → Apply → send chat message → response reflects new personality.

---

## Parallelization Strategy

```
Week 1 (can all start simultaneously):
├── Feature 1a: Notification channel DB + CRUD          ──┐
├── Feature 2a: Token spike detection alert rule         │ (all independent)
├── Feature 3a: Chat relay API endpoint                  │
├── Feature 3b: Chat panel component (mock data)         │
├── Feature 4a: Bot routing rules DB + CRUD              │
├── Feature 5a: Structured config editor component       │
└── Feature 5b: Partial config update API endpoint      ──┘

Week 1.5 (after first batch):
├── Feature 1b: Notification delivery service     (needs 1a)
├── Feature 2b: Budget threshold alerts           (independent)
├── Feature 3c: Chat integration into bot detail  (needs 3a + 3b)
├── Feature 4d: Routing rules UI                  (needs 4a)
└── Feature 5c: Wire config editor to API         (needs 5a + 5b)

Week 2 (after second batch):
├── Feature 1c: Notification settings UI          (needs 1a + 1b)
├── Feature 4b: Delegation execution service      (needs 4a + 3a)
└── Feature 4e: Delegation trace visualization    (needs 4b)

Week 2.5 (after third batch):
└── Feature 4c: Delegation via OpenClaw tool      (needs 4b)

Integration testing + demo rehearsal
```

**Maximum parallelism in first batch**: 7 tasks can run simultaneously.

---

## Docs That Need Updating

After implementation, these docs must be updated to reflect the new features:

### 1. `.claude/docs/current-codebase-analysis.md`
- Add to Module Inventory table:
  - `notification-channels` module (CRUD + delivery)
  - `bot-routing` module (rules + delegation)
  - `bot-chat` endpoint in bot-instances
- Add to Web Pages table:
  - `/settings/notifications` — Notification channel config
  - Chat panel (slide-over, not a route)
  - Routing rules UI
- Add to Component Groups:
  - Chat: `bot-chat-panel`, `chat-message`, `chat-input`
  - Routing: `routing-rules-list`, `routing-rule-form`, `delegation-trace`
  - Config: `config-sections-editor`, `identity-editor`, `tools-editor`
- Add to Hooks:
  - `use-bot-chat` — Chat state + SSE streaming
- Update Database Models section:
  - Add `NotificationChannel`, `AlertNotificationRule`, `BotRoutingRule`
- Update "What Still Needs Work" section — remove items that are now done

### 2. `.claude/docs/clawster-vision.md`
- Update "What Clawster Does → Monitor Everything" section:
  - Add: "Alerts fire and notify via Slack, email, or webhook when health degrades, costs spike, or SLOs breach"
- Update "Organize Bots into Teams" section:
  - Add concrete detail about routing rules and delegation now that it exists
- Update "Success Metrics":
  - Add: "Bot-to-bot delegation is auditable and visible in traces"
  - Add: "External notifications (Slack/webhook) are configurable per alert type"

### 3. `.claude/docs/ux-dream.md`
- Update "The Journey: Screen by Screen" sections:
  - Stage 2 (Getting Started Dashboard): Add chat panel, routing rules
  - Stage 3 (Fleet Dashboard): Add notification settings, delegation traces
- Update "Core UX Principles → Actions Over Information":
  - Add chat panel as example of action-oriented design
  - Add Slack notification as example of proactive alerting
- Add new principle or update principle 11 (Bidirectional Awareness):
  - Chat panel enables direct interaction, not just observation
  - Delegation traces show inter-bot communication

### 4. `.claude/docs/dream-architecture.md`
- Add new section: "Bot-to-Bot Delegation Architecture"
  - Diagram showing: User → Bot A Gateway → Clawster Delegation Service → Bot B Gateway → response flows back
  - Explain routing rules, trace creation, autonomous vs rule-based delegation
- Add to "The Gateway WebSocket Protocol" section:
  - Mention `agent` method usage for chat relay
- Update "Clawster Internal Architecture → Monorepo Structure":
  - Add new modules/services
- Add new section: "External Notifications Architecture"
  - Alert → NotificationDeliveryService → Slack/Webhook/Email
  - Diagram showing flow

### 5. `.claude/docs/openclaw-reference.md`
- No changes needed (this documents OpenClaw itself, not Clawster features)

---

## Verification Checklist (End-to-End)

Before recording the demo video, ALL of these must pass:

- [ ] `pnpm build` succeeds
- [ ] All existing tests pass
- [ ] Deploy a bot via wizard → terminal streams live → bot goes green
- [ ] Open chat panel → talk to bot → bot responds with streaming
- [ ] Deploy second bot → dashboard shows both healthy
- [ ] Configure Slack webhook in notifications settings
- [ ] Token spike fires → Slack notification arrives within 60s
- [ ] Configure routing rule: support-bot → devops-bot for "infrastructure" queries
- [ ] Chat with support-bot about infrastructure → delegation happens → trace shows chain
- [ ] Edit bot personality via structured editor → Apply → chat reflects new personality
- [ ] Agent evolution tab shows skills the bot added on its own
- [ ] All docs updated and accurate
