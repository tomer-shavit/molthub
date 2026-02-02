---
description: "UX dream and core design principles for Clawster — the experience we're building toward"
globs: ["apps/web/src/**/*.tsx", "apps/web/src/**/*.ts"]
alwaysApply: true
---

# Clawster UX Dream

## What OpenClaw Is — And Why It Shapes Everything

OpenClaw isn't a chatbot framework. It's an **autonomous agent runtime**. Each OpenClaw instance is an always-on agent with:

- **A Gateway** — the always-on process that owns messaging connections, the control plane, and the event stream. It runs continuously, survives crashes via supervisor restarts, and exposes a WebSocket protocol for real-time control.
- **Agents with identity** — each instance can run multiple agents, each with a name, personality, emoji, model preferences, workspace, and sandbox config. These aren't generic bots — they're autonomous entities with defined roles ("You are the DevOps lead").
- **Channels** — WhatsApp, Telegram, Discord, Slack, iMessage, Signal, and more. These are how agents interact with the world. Channels have DM policies (pairing, allowlist, open), group policies, and per-channel routing via bindings.
- **Skills and tools** — agents have capabilities. GitHub integration, Jira, custom skill directories, MCP servers. Tool profiles (minimal, coding, messaging, full) define what each agent can do. Sandboxing controls how safely they do it.
- **Security baked in** — three-layer access control (identity verification, operational scope, model capability). Gateway auth tokens, DM pairing codes, file permissions, tool allow/deny lists, sandbox isolation. Security isn't a feature — it's the architecture.
- **Profile isolation** — multiple instances coexist on the same host via dedicated config files, isolated state directories, separate workspaces, and non-overlapping port ranges (spaced 20+ apart).

### Agents Are Autonomous — They Evolve on Their Own

This is the most important thing to understand about OpenClaw: **agents are not static deployments.** An OpenClaw agent is an autonomous entity that acts on its own. It can:

- **Add skills** — an agent can discover, install, and load new skills during runtime. It might start with GitHub integration and later add Jira, or load custom skills from a directory.
- **Acquire tools** — agents gain new tool capabilities. An agent that started with a "minimal" tool profile might expand its capabilities based on what it needs to accomplish.
- **Register MCP servers** — agents connect to Model Context Protocol servers for additional capabilities. These connections can be established by the agent itself, not just by the user.
- **Change its own identity** — an agent can update its name, personality, emoji, system prompt, or goals as it evolves.
- **Modify its config** — through `config.apply` and `config.patch`, an agent can change its own configuration: session settings, message behavior, channel config, tool restrictions.

This means the relationship between Clawster and each OpenClaw agent is **bidirectional**:

- **Clawster → OpenClaw**: Clawster deploys agents, pushes config, sets up channels, configures security. This is the "control" direction.
- **OpenClaw → Clawster**: Agents evolve autonomously — they add skills, change tools, modify config, connect to MCP servers. Clawster must **observe and reflect** these changes back to the user. This is the "observe" direction.

Clawster is not just a deployment tool that fires and forgets. It's a **living dashboard** for autonomous entities. When Sarah opens Clawster and looks at her support bot, she should see what that agent has become — not just what she originally deployed. The skills it's learned, the tools it's using, the MCP servers it's connected to, the config it's modified — all of this should be visible and understandable.

### What This Means for the UX

Clawster is the **control plane** for all of this. It takes what `openclaw onboard --install-daemon` does on a single machine and makes it visual, repeatable, multi-instance, and observable across any infrastructure.

Understanding OpenClaw's nature is essential to the UX. We're not building a generic "deploy a container" UI — we're building the cockpit for autonomous agents that have personality, purpose, channels, skills, health, and security. These are living, running entities that evolve on their own. The UI must reflect both what you told them to be and what they've become.

---

## The Promise

Someone opens Clawster for the first time. Within 5 minutes they have an OpenClaw agent running — a Gateway spun up, an agent configured with a personality and purpose, channels ready to connect. They pick a template (support bot, DevOps bot, personal assistant), give it a name, and hit Deploy. The Gateway starts, auth tokens are generated, profile isolation is handled, and the agent is live.

Then they deploy another. A personal WhatsApp assistant. Then a code review bot on Slack. Each one takes 2 minutes because the flow is the same. They can see all their agents at a glance — which Gateways are healthy, which channels are connected, which agents need attention. Every bot is secure by default, properly isolated, and fully observable.

A week later, they open Clawster again. Their support bot has learned new skills — it added a Jira integration and connected to an MCP server on its own. Their DevOps bot changed its tool profile. Clawster shows all of this. Not as errors or drift — as the natural evolution of autonomous agents. Sarah can see what each agent has become, understand its current capabilities, and still push config changes when she wants to. The control flows both ways.

That's the bar. Clawster makes deploying, understanding, and managing autonomous OpenClaw agents feel seamless — whether you're running 1 or 20. The first agent is the hook. Seeing what your agents become keeps you coming back. The confidence to keep deploying more is the product.

---

## Who We're Designing For

### The Builder (Primary Persona)

Sarah is a developer — maybe solo, maybe on a small team. She wants autonomous agents handling different parts of her life and work: a support agent for her SaaS on Telegram with DM pairing for security, a personal WhatsApp assistant that handles her schedule, a code review agent on Discord watching her repos, a DevOps agent monitoring her infra via webhooks and cron jobs.

She's technical enough to understand what a Gateway is, but she doesn't want to manually configure `openclaw.json`, manage port spacing, generate auth tokens, or set up systemd services for each instance. She wants Clawster to handle the operational complexity while she focuses on what each agent should do.

**What Sarah needs:**
- Deploy her first OpenClaw agent fast — template, name, deploy. Gateway comes up, auth is configured, agent is ready.
- Deploy her second, third, fifth agent just as easily. Each gets its own isolated profile, ports, and config automatically.
- See all her agents at a glance — Gateway health, channel status, which agents are running, degraded, or need attention.
- **Understand what her agents are and what they have.** Her support bot might have started from a template, but over time it added skills, connected MCP servers, changed its tool profile. When Sarah opens Clawster, she should see the current reality of each agent — not a stale snapshot of what she originally deployed.
- Connect and manage channels (WhatsApp, Telegram, Discord, Slack) without editing JSON5 config files.
- Feel confident that security is handled — auth tokens generated, DM policies set, sandbox isolation configured, secrets stored properly. She shouldn't have to think about it.
- Configure agent identity, skills, and tools through the UI when she wants to — but also see when agents have configured themselves. The control is bidirectional.
- A clear path from "I have 1 agent" to "I have 10 agents" without the UI breaking down or becoming overwhelming.

**What Sarah doesn't need on day one:**
- Fleet management UI (she'll grow into it when she has enough agents to organize)
- SLO tracking (she'll need it when agents serve external customers)
- Cost breakdowns per agent (useful later, noise during setup)
- Audit logs and policy packs (important at scale, invisible at the start)
- Advanced config editing (profiles, overlays, bindings — power-user tools she'll discover when ready)

**The key insight:** Sarah's needs evolve. On day one she needs a fast wizard. On day seven she needs a clear dashboard for her 3 agents. On day thirty she might have 8 agents organized into teams and wants fleet tools. The UI grows with her — it never feels like too much or too little.

### The Small Team

A team of 3-8 people deploying 5-15 OpenClaw agents across different functions. They care about the same things Sarah does — easy deployment, clear health visibility, channel management — but they also start caring about organization (grouping agents into fleets or teams), shared configuration (profiles and overlays so they don't duplicate config across agents), cost awareness, and security governance. They're the bridge between individual use and fleet operations.

### The Enterprise Operator

Manages 100+ agents across departments. Needs everything: fleets, policies, RBAC, audit trails, SLOs, cost controls, change sets, rollout strategies. This persona is real and important, but they are not who we design the first impression for. Enterprise features exist behind progressive disclosure — available when needed, invisible when not.

---

## Core UX Principles

Every feature, every page, every component should be evaluated against these principles. If a design violates any of them, it needs to be rethought.

### 1. Progressive Disclosure — Show What Matters Now

The UI reveals complexity as the user's needs grow. A user with 2 agents should never see UI designed for 200 agents. But a user with 10 agents shouldn't be stuck in a "beginner" view either.

**In practice:**
- 0 agents: Full-screen wizard. No sidebar. No dashboard. Just "Let's get your first OpenClaw agent running."
- 1-3 agents, no fleets: Focused dashboard showing your agents, their Gateway health, channel status, and what to do next. Sidebar has 3-4 items max (Dashboard, Bots, Channels). "Deploy New Bot" is always one click away.
- 4+ agents or has fleets: Full fleet dashboard with operational tools. Sidebar expands to show Operations (Fleets, Alerts, SLOs, Costs), Configuration (Profiles, Overlays, Templates), and Advanced (Traces, Change Sets, Audit Log, Policies, Connectors).

**The rule:** If the user hasn't reached the stage where a feature is useful, that feature doesn't exist in their UI. No empty states showing "0 fleets" — just don't show the Fleets page at all until they have a reason to create one.

### 2. Deploying the Next Agent Should Be as Easy as the First

The wizard isn't just for onboarding — it's the deployment flow. Whether it's your first OpenClaw agent or your tenth, the path is the same: select your deployment platform (Local/Docker, AWS, Azure, GCP — cloud options grayed out until ready), pick your channels, name it, deploy. The whole configuration (platform + channels) is one template. Clawster handles profile isolation, port allocation, auth token generation, and Gateway startup automatically. The product should actively encourage deploying more agents.

**In practice:**
- "Deploy New Bot" is always visible — in the sidebar, on the dashboard, in the header. It's never more than 1 click away.
- After deploying agent #1, the dashboard suggests: "Deploy another OpenClaw agent for a different task."
- Each new deployment automatically gets isolated config, state, workspace, and ports. The user never has to think about port spacing or profile paths.
- Bot cards on the dashboard make it obvious that multiple agents coexist naturally — it's not a special case, it's the expected state.

**The rule:** The effort to deploy agent N+1 should be the same as deploying agent 1. No additional setup, no new concepts to learn, no UI mode switches. Clawster handles the isolation complexity.

### 3. Always Answer "What Should I Do Next?"

At every point in the user's journey, the UI should make the next step obvious. The user should never land on a page and think "now what?"

**In practice:**
- After first deploy: "Your OpenClaw agent is live! Now connect a channel so it can talk to people." (Link to channel setup — WhatsApp, Telegram, Discord, Slack.)
- After connecting a channel: "Channel connected! Send a test message to make sure it works."
- After verifying the agent works: "Looking good! Deploy another OpenClaw agent for a different task — or configure skills and tools for this one."
- Dashboard with healthy agents: Show a checklist of things they might want to do (add channels, configure skills, deploy another agent, organize into a fleet).
- Dashboard with a degraded agent: Show the problem, what caused it, and how to fix it — right there, not behind 3 clicks. Link to `openclaw doctor`-equivalent diagnostics.

**The rule:** Empty states are opportunities, not dead ends. Every "you have nothing here" state should include a clear action to change that.

### 4. Time to First Value < 5 Minutes

The entire onboarding flow — from opening Clawster for the first time to having a running OpenClaw agent with a live Gateway — must complete in under 5 minutes. This mirrors the CLI experience: `openclaw onboard --install-daemon` gets you running fast. Clawster should be even faster because the UI makes decisions for you.

**In practice:**
- The wizard has 3 decision points: Pick your deployment platform (Local/Docker is the only active option — AWS, Azure, GCP are visible but grayed out), pick your channels, name your bot and deploy. Channels are optional (can add later). The whole selection (platform + channels) becomes a reusable template.
- Smart defaults everywhere. Local/Docker is the only enabled platform. Auth tokens are auto-generated. Port allocation is automatic.
- No required fields that the user can't answer immediately. Don't ask for AWS credentials during onboarding. Don't require a channel before deploying. Don't make them configure skills before seeing the Gateway come up.
- "Skip" is always available. Every optional step (channels, advanced config) can be skipped with a single click, with a clear message about what they're skipping and how to set it up later.

**The rule:** Count the clicks from landing page to running Gateway. If it's more than 10, something needs to be cut.

### 5. Security Is Invisible Infrastructure, Confidence Is Visible

OpenClaw's security model is comprehensive — three-layer access control, Gateway auth tokens, DM pairing codes, file permissions (600/700), sandbox isolation, tool allow/deny lists. Clawster should make all of this happen automatically. The user doesn't configure security — they see the result of it.

**In practice:**
- Every agent deploys with secure defaults: Gateway auth token generated and stored in secret management, profile isolation enabled, DM policy set to "pairing" (the safe default), sandbox configured per template.
- The dashboard shows security status as a simple indicator — a green badge means "Gateway authenticated, channels secured, sandbox active." Not a config form.
- Security details are available on demand (click to see auth mode, DM policy, sandbox settings, tool restrictions) but never required during setup.
- Security configuration (policies, RBAC, audit) appears in the sidebar only when the user has enough agents or team members to need governance.
- Error messages about security issues are actionable: "Auth token expired — click to regenerate" not "SECURITY_ERROR_401."

**The rule:** Security should make the user feel confident, not anxious. Every OpenClaw agent deployed through Clawster should be as secure as the "Secure Baseline Config" from the OpenClaw docs — without the user having to write a single line of JSON5.

### 6. Respect the User's Context

The UI should feel right for a user with 2 agents and right for a user with 20 agents — not because we dumb it down or cram it full, but because the information they need is genuinely different at each stage.

**In practice:**
- A user with 1-3 agents sees their agents as the heroes of the page. Big status cards showing Gateway health, connected channels, agent identity, uptime, and quick actions — all focused on those specific agents.
- A user with 10+ agents sees an overview. Aggregated Gateway health, agents that need attention surfaced first, fleet-wide metrics that help them manage at scale.
- The sidebar adapts. The page layout adapts. The data density adapts. But the design language stays consistent — it always feels like the same product.

**The rule:** Ask "does a user at this stage actually need this information?" If not, don't show it.

### 7. Actions Over Information

Dashboards are useful, but only if they lead to action. Showing a metric is pointless unless the user knows what to do about it.

**In practice:**
- Gateway status shows "Disconnected" → include a "Restart Gateway" button right there, not buried 3 clicks away.
- Health card shows "Degraded" → show which health check failed and link to diagnostics (the equivalent of `openclaw doctor`).
- Channel card shows "WhatsApp disconnected" → link to re-pairing flow.
- Cost card shows spending increased → link directly to the agent or channel causing the spike.
- Chat panel lets you talk to any bot directly — the ultimate action-oriented design.
- Slack/webhook notifications proactively alert you when something needs attention, even when you're not looking at the dashboard.
- Every metric panel should answer: "So what? What do I do with this number?"

**The rule:** If a piece of information doesn't lead to an action, question whether it belongs on that page.

### 8. No Fake Data, No Empty Theater

Never show fake metrics, simulated charts, or placeholder data to make the UI look "full." An empty state is honest. Fake data is confusing.

**In practice:**
- If there are 0 messages processed, don't show a chart with a flat line — show "No messages yet. Connect a channel to start."
- If there are 0 fleets, don't show a "Fleet Health" card with all zeros — don't show the card at all.
- If a Gateway just started, don't show "Uptime: 0%" with a red badge — show "Just deployed, waiting for first health check."
- Trend percentages ("5% vs last hour") are only shown when there's enough historical data to make them meaningful (at least 2 data points spanning the comparison window).

**The rule:** Every number on screen must come from real data. If there's no data, say so clearly and tell the user how to generate it.

### 9. The Wizard Is the Product's Front Door

The onboarding wizard isn't a side feature — it's the most important page in the entire product. It's the first thing every user sees. It determines whether they stay or leave. And it's the same flow they return to every time they deploy a new agent.

The wizard is Clawster's visual equivalent of `openclaw onboard --install-daemon`. It should feel just as fast and opinionated, but with the added benefit of a visual interface that makes choices obvious.

**In practice:**
- The wizard gets its own full-screen layout. No sidebar, no navigation chrome, no distractions. Just the task at hand.
- Each step is visually clear: what step you're on, what's coming next, what you've already done.
- Templates are the starting point. Each template encodes an OpenClaw role — support agent, DevOps agent, personal assistant, code review agent — with pre-configured agent identity, suggested channels, appropriate tool profile, and sandbox settings.
- The wizard should feel opinionated. It picks Docker as the deployment target, generates auth tokens, configures profile isolation, and sets secure defaults. The user can override later if they want.
- After the wizard completes: "Your OpenClaw agent is live!" with Gateway status, a celebration moment, and clear next steps ("Add a Channel" or "Go to Dashboard").

**The rule:** The wizard is the product's first impression and the repeating deployment flow. Treat it like a landing page, not an admin form.

### 10. Surface OpenClaw's Nature, Not Generic Infrastructure

Clawster's UI should reflect that these are OpenClaw agents — not generic containers or serverless functions. The concepts in the UI should map to OpenClaw's real surfaces.

**In practice:**
- Show "Gateway Status" not "Container Status." The Gateway is the always-on process — its health is what matters.
- Show "Channels" (WhatsApp, Telegram, Discord, Slack) not "Integrations." Channels are how agents interact with the world — they're first-class, not plugins.
- Show "Agent Identity" (name, personality, emoji) not "Instance Metadata." Agents have character.
- Show "Skills & Tools" not "Plugins." Skills are how agents gain capabilities. Tool profiles (minimal, coding, messaging, full) are meaningful OpenClaw concepts.
- Show "DM Policy" and "Group Policy" in channel config — these are core OpenClaw security concepts that users should understand.
- Use "Health" the way OpenClaw does — based on Gateway health checks (`openclaw health --json`), not generic container liveness.
- When something goes wrong, offer OpenClaw-native diagnostics — the equivalent of `openclaw doctor`, not generic "check your logs."

**The rule:** If you catch yourself building a generic "container management" UI, step back. This is OpenClaw. The UI should speak OpenClaw's language.

### 11. Bidirectional Awareness — Observe What Agents Become

Clawster deploys agents, but agents don't stay as deployed. They're autonomous. They add skills, install tools, connect MCP servers, modify their config, and evolve their capabilities. Clawster must reflect this reality — it's not just a deployment tool, it's a living window into what each agent is right now.

**In practice:**
- The bot detail page shows the **current state** of the agent — not just the original template config. If the agent added a GitHub skill, that skill shows up. If it connected to an MCP server, that connection is visible. If it changed its tool profile from "minimal" to "coding," the UI reflects it.
- Clawster reads agent state via the Gateway WebSocket protocol (`config.get`, `health`, `status`). This is how it stays in sync. The Gateway is the source of truth for what an agent currently is.
- When an agent's current state differs from what Clawster originally deployed, the UI should surface this clearly — not as an error, but as information. "This agent has evolved since deployment: 3 new skills, 1 MCP server, updated tool profile." The user should be able to explore these changes.
- Clawster can push config changes to agents (`config.apply`, `config.patch`), and agents can change their own config. The UI should make both directions visible: "You set this" vs "The agent changed this."
- Skills, tools, and MCP servers should be browsable per agent. "What can this agent do?" is a fundamental question the dashboard must answer at all times — and the answer may have changed since yesterday.
- When Sarah hasn't checked on an agent for a week, Clawster should show her what's changed: "Your DevOps bot added 2 skills and connected to a new MCP server since your last visit." This makes the dashboard worth coming back to.

- Chat panel enables direct two-way interaction with agents — not just observation, but conversation.
- Delegation traces show how bots communicate with each other, making inter-bot collaboration visible.

**The rule:** Clawster is not fire-and-forget. Every agent page should answer two questions: "What did I deploy?" and "What has this agent become?" If those diverge, the user should understand why and feel in control.

### 12. Consistent Mental Model

The user should build a simple mental model of the system that stays true whether they have 1 agent or 50:

```
Templates → deploy → OpenClaw agents (Gateway + Agents)
                        → connect → Channels (WhatsApp, Telegram, Discord, Slack...)
                        → configure → Skills & Tools
                        → organize into → Fleets / Teams
                        → monitor with → Dashboard (health, channels, costs)

                   OpenClaw agents evolve autonomously:
                        ← report back → Skills they've added
                        ← report back → Tools they're using
                        ← report back → MCP servers they've connected
                        ← report back → Config they've changed
                        ← report back → Current health & state
```

Every navigation path, every page title, every breadcrumb should reinforce this model.

**In practice:**
- Navigation follows the mental model: Bots are the center. Channels attach to bots. Fleets group bots. Everything else supports bots.
- Don't introduce concepts before the user needs them. "Profiles" and "Overlays" are power-user config concepts — they appear when the user has enough agents to benefit from shared config. "Bindings" (multi-agent routing) appear when a user has multiple agents per Gateway.
- Terminology is consistent everywhere. A "bot" is always a "bot" (not "instance" in one place and "agent" in another). A "channel" is always a "channel" (not "integration" or "connector").

**The rule:** A user should be able to explain Clawster to someone in one sentence: "You deploy OpenClaw agents from templates, connect them to messaging channels, and monitor everything from a dashboard."

---

## The Journey: Screen by Screen

### Stage 0: First Visit (0 agents)

**URL:** `/` redirects to `/setup`

**What the user sees:**
- Full-screen welcome page. Centered layout. No sidebar.
- Clawster logo + "Welcome to Clawster" heading.
- Subtitle: "Deploy your first OpenClaw agent in minutes."
- The wizard begins immediately — no landing page before the wizard.

**Feeling:** "This is simple. I know exactly what to do."

### Stage 1: The Wizard (first agent and every agent after)

**Steps:**
1. **Platform** — Pick where your agent runs. Four cards: Local/Docker (active), AWS (grayed out), Azure (grayed out), Google Cloud (grayed out). Cloud options become available as integrations are hardened. Platform-specific config appears below when selected (Local needs nothing extra; cloud providers will show credentials, region, etc.).
2. **Channels** — Below the platform selection, pick which channels to connect: WhatsApp, Telegram, Discord, Slack, etc. Or skip and add later. "Skip, deploy with defaults" is prominent.
3. **Bot Name + Deploy** — Name your bot. Review summary of platform + channels. One-click deploy button. The entire selection (platform + channels) becomes a reusable template.
4. **Deploying** — Live progress indicator showing real steps: provisioning infrastructure, starting Gateway, configuring auth, setting up agent. Then: "Your OpenClaw agent is live!" with Gateway status and clear next steps ("Add a Channel" or "Go to Dashboard").

**Feeling:** "That was fast. My agent is actually running. Let me set up another one."

### Stage 2: Getting Started Dashboard (1-3 agents, no fleets)

**URL:** `/`

**What the user sees:**
- Simplified sidebar (Dashboard, Bots, Channels + prominent "Deploy New Bot" button)
- Agent cards showing: name, status, Gateway health (connected/disconnected), connected channels with status, uptime, agent identity (emoji + personality snippet). Each agent is a first-class citizen on the page.
- **Live agent state**: each card reflects what the agent currently is — including skills it's added, tools it's using, and MCP servers it's connected to since deployment. If the agent has evolved, a subtle indicator shows "2 new skills since deploy" or similar.
- Setup checklist: what they've done, what they could do next (connect channels, verify health, configure skills, deploy another agent)
- **Built-in chat panel**: Click any bot card to open a slide-over chat panel and talk to the bot directly inside Clawster — no need to switch to Telegram or Slack.
- **Routing rules**: Configure which bots can delegate to others via simple pattern-based rules.
- Quick actions: Add Channel, View Health, Edit Config, Deploy Another Bot

**Feeling:** "I can see all my agents are healthy, I know what they're doing, and adding another one is right there."

### Stage 3: Fleet Dashboard (4+ agents or has fleets)

**URL:** `/`

**What the user sees:**
- Full sidebar with Operations, Configuration, and Advanced sections
- Fleet-wide metrics: total agents, Gateway health breakdown (healthy/degraded/down), channel connectivity, cost estimate
- Charts (only when real data exists — messages processed, health over time, cost trends)
- Agents that need attention surfaced first (degraded health, disconnected channels, errors)
- Notification settings for Slack/webhook alerts when bots need attention
- Delegation traces showing inter-bot communication chains
- "Deploy New Bot" always accessible

**Feeling:** "I'm running a fleet of agents and I have full visibility. I can still deploy a new one in 2 minutes if I need one."

---

## Anti-Patterns to Avoid

These are things that break the UX dream. If you find yourself doing any of these, stop and reconsider.

### 1. "Dashboard-First" Thinking
Don't design a dashboard and then try to figure out what data to put in it. Design around the user's task and show the data that helps them complete it.

### 2. Enterprise-First UI
Don't build the UI for the 100-agent operator and then try to simplify it for everyday users. Build for the person deploying their first few agents and progressively enhance for scale.

### 3. Making the Nth Agent Harder Than the First
If deploying agent #5 requires more steps, more context, or more navigation than agent #1, something is wrong. Clawster handles profile isolation, port allocation, and auth automatically. The deployment flow should be consistent regardless of how many agents you already have.

### 4. Generic Container UI
Clawster is not Portainer or Kubernetes Dashboard. Don't show "container status" when you mean "Gateway health." Don't show "environment variables" when you mean "agent config." Speak OpenClaw's language — Gateway, channels, agents, skills, tools, DM policies, health checks.

### 5. Feature Parity as a Goal
Not every backend capability needs a UI surface. The API might support 20 OpenClaw config sections, but the UI should expose the ones that matter for the current user's stage and let power users use the API, CLI, or direct config editing for the rest.

### 6. Empty States as Afterthoughts
Empty states are the first thing many users see. They should be designed with the same care as the populated states. An empty state with no guidance is a dead end.

### 7. Metric Vanity
Don't show a metric just because you can compute it. Every number on screen should help the user make a decision. If it doesn't, it's visual noise.

### 8. Modal Overload
Prefer inline actions over modals. Prefer page navigation over modals. Modals should be reserved for confirmations ("Are you sure you want to stop this Gateway?") and quick inputs that don't justify a full page.

### 9. Jargon Without Context
Terms like "reconciler," "overlay," "manifest," "binding," or "SLO" are meaningful to power users but opaque to someone deploying their first agent. When these concepts appear in the UI, they should include tooltips, descriptions, or learn-more links.

### 10. Security as Friction
Don't make security something the user has to configure before they can deploy. OpenClaw's secure baseline (Gateway auth, DM pairing, file permissions, sandbox isolation) should just work by default. Security configuration surfaces are for users who want to customize their posture, not a gate that blocks getting started.

### 11. Treating Agents as Static Deployments
An OpenClaw agent is not a container you deploy and forget. It's an autonomous entity that evolves — adding skills, connecting MCP servers, modifying its config, changing its tool profile. If Clawster only shows what was originally deployed and never syncs with the agent's current state, the dashboard becomes a lie. Always reflect the agent's live state via Gateway communication, not a stale deployment snapshot.

---

## Measuring Success

The UX dream is achieved when:

1. **Time to First Agent**: A new user deploys their first OpenClaw agent with a live Gateway in under 5 minutes without reading docs.
2. **Time to Nth Agent**: Deploying the 5th agent takes the same effort as the 1st. Profile isolation, ports, and auth are automatic.
3. **Zero Dead Ends**: No page in the app leaves the user without a clear next action.
4. **Stage Appropriateness**: The UI matches the user's current scale — never too much, never too little.
5. **OpenClaw-Native**: The UI speaks OpenClaw's language. Gateway health, not container status. Channels, not integrations. Agent identity, not instance metadata.
6. **Live State Awareness**: Every agent's page reflects its current reality — skills, tools, MCP servers, config — not a stale deployment snapshot. When an agent evolves, Clawster shows it.
7. **Action Density**: Every visible metric or status indicator is within 1 click of a relevant action.
8. **No Fake Data**: Every number, chart, and percentage is computed from real Gateway health checks and real telemetry.
9. **Secure by Default**: Every agent deployed through Clawster matches OpenClaw's secure baseline config without the user touching security settings.
10. **Bidirectional Control**: Users can push config to agents and see what agents have done on their own. Both directions are visible, understandable, and actionable.
11. **Confidence**: Users feel their agents are autonomous, secure, and properly isolated. They understand what each agent is and what it can do. They trust the system enough to deploy more.
12. **Return Rate**: Users come back to see what their agents have been doing, check on changes, deploy new ones, and connect new channels. The dashboard is a living window, not a static report.

---

## How to Use This Document

When implementing any UI feature:

1. **Read this first.** Before writing a component, understand which stage it belongs to and which persona it serves.
2. **Check against the principles.** Does your feature respect progressive disclosure? Does it answer "what should I do next?" Does it make deploying the next agent easier or harder? Does it speak OpenClaw's language or generic infrastructure language?
3. **Think about the bidirectional relationship.** Does your feature only show what was deployed, or does it reflect the agent's current live state? Is the user seeing what the agent has become, or a stale snapshot? Can the user both observe and control?
4. **Think about the journey.** Where does the user come from before this page? Where do they go after? Is the transition smooth? Does the user feel encouraged to keep building?
5. **Validate with the anti-patterns.** Are you building dashboard-first? Are you showing metrics without actions? Are you building a generic container UI instead of an OpenClaw-native one? Are you treating agents as static deployments?
6. **Ask the core question:** "Does this help someone deploy, understand, and manage autonomous OpenClaw agents with confidence — whether they have 1 or 15?"

If the feature only makes sense at fleet scale (50+ agents), it belongs behind progressive disclosure. If it makes every user's experience better regardless of scale, it belongs front and center. And if it shows agent state, make sure it's the live state — not a deployment-time snapshot.
