---
description: "Product vision for Clawster — the open-source control plane for autonomous OpenClaw agents"
globs: []
alwaysApply: false
---

# Clawster Vision

## One-Liner

Clawster is an open-source control plane that lets anyone — a solo founder, a small team, or an enterprise — deploy, configure, and orchestrate fleets of autonomous OpenClaw agents across any infrastructure, with security, observability, and inter-bot collaboration built in.

---

## The Problem

AI agents are powerful individually. But running them in production is hard: provisioning infrastructure, managing secrets, configuring channels, monitoring health, controlling costs, enforcing security — all of this is manual, fragile, and doesn't scale.

And when you want multiple agents working together — delegating tasks, sharing context, coordinating toward a goal — there's nothing. You're on your own stitching together scripts and hoping it holds.

We believe the future is autonomous agent teams that can run a company's operations. Clawster makes that possible.

---

## Who It's For

### Solo Operators
A single person who wants to run a one-person corporation. Deploy an OpenClaw that handles customer support, another that manages code reviews, another that monitors infrastructure — all coordinated, all secure, all monitored. Clawster makes "one-person company" real.

### Small Teams
A team of 3-10 people that wants agent leverage. Set up specialized bots for different functions, give them personalities and goals, let them collaborate. Clawster handles the infrastructure and orchestration so the team focuses on what the bots should do, not how to keep them running.

### Enterprises
Organizations that need hundreds of agents across departments, with governance, RBAC, audit trails, cost controls, and compliance. Clawster provides the fleet management, policy enforcement, and observability they require.

---

## Core Principles

### 1. Deploy Anywhere
OpenClaws should run wherever the user wants. Local machines, Docker, Kubernetes, AWS ECS, Azure, GCP — Clawster abstracts the infrastructure through deployment targets. Users bring their own stack. Clawster handles the lifecycle.

### 2. Secure by Default
Every OpenClaw deployed through Clawster starts secure: gateway auth tokens generated and stored properly, no plaintext secrets, policy packs enforcing guardrails, audit logs for every change. Security isn't an add-on — it's the baseline.

### 3. Autonomous Agents with Personality and Purpose
Each OpenClaw gets a personality, a system prompt, high-level goals, and specialized skills. They're not generic chatbots — they're autonomous agents with defined roles: "You are the DevOps lead. Your goal is zero-downtime deployments. You own the CI/CD pipeline."

### 4. Teams of Agents with Hierarchy
OpenClaws can be organized into teams with a lead and members. The lead delegates tasks, members execute, results flow back. Teams have roadmaps, goals, and shared context. Clawster orchestrates all inter-bot communication — bots never talk directly, everything is auditable and rule-governed.

### 5. Observable and Controllable
Health, communications, skills, tools, costs — everything is visible. Alerts fire when something degrades. Users can pause, restart, reconfigure, or destroy any bot at any time. Full control, full visibility.

### 6. Open Source First
Clawster is open source. Anyone can self-host it, extend it, contribute to it. The entire platform — provisioning, orchestration, monitoring, team coordination — is available to everyone.

### 7. Hosted Option for Those Who Want It
For users who don't want to manage infrastructure, a future hosted SaaS offering will provide the full Clawster experience as a managed service. Same capabilities, zero ops burden. But self-hosting is always an option — no vendor lock-in.

---

## What Clawster Does

### Deploy and Manage OpenClaws

- **One-click setup**: Select your deployment platform (Local/Docker, AWS, Azure, GCP), configure channels, name your bot, deploy. The whole selection becomes a reusable template. A non-technical user can get a production OpenClaw running through a guided wizard.
- **Lifecycle management**: Start, stop, restart, redeploy, destroy. All through the UI, API, or CLI.
- **Multi-cloud**: Deploy targets are pluggable. AWS today, Kubernetes tomorrow, Azure next week. Users choose their stack.
- **Bulk operations**: Restart 50 bots. Roll out a config change to a fleet. Pin versions across environments.

### Configure at Scale

- **Templates**: Pre-built configurations for common use cases — support bot, coding assistant, ops bot, messaging bot.
- **Profiles**: Shared defaults across bots. "Production baseline", "EU data residency", "high-security".
- **Overlays**: Small deltas applied per-bot or per-group without duplicating entire configs.
- **Connectors**: First-class integrations for Slack, Telegram, Discord, WhatsApp, and model providers. Attach once, rotate once, see blast radius.

### Give Bots Identity and Purpose

- **Personality**: Each bot has a system prompt defining who it is, how it communicates, what it cares about.
- **Goals**: High-level objectives like "reduce support ticket resolution time" or "keep CI green". Goals inform how the bot prioritizes and acts.
- **Skills and tools**: Each bot has a defined set of capabilities — which tools it can use, which APIs it can call, what actions it's authorized to take.
- **Specialization**: Bots are specialists, not generalists. A DevOps bot, a customer support bot, a data analysis bot — each excels at its domain.

### Organize Bots into Teams

- **Team hierarchy**: A team has a lead bot and member bots. The lead understands the team's goals and delegates work to the right specialist.
- **Goal-driven coordination**: Users set team-level goals and roadmaps. The lead breaks these into tasks and assigns them based on member capabilities.
- **Rule-governed communication**: All inter-bot communication flows through Clawster. Users define routing rules with pattern matching to control when Bot A delegates to Bot B. All delegations are traced and auditable. Users can configure who talks to whom, what context is shared, and what requires human approval.
- **Shared context**: Teams maintain shared context that members can read and contribute to, enabling coherent multi-agent workflows.
- **Auditable**: Every message, every delegation, every result is logged and traceable.

### Monitor Everything

- **Health dashboard**: Fleet-wide and per-bot health. Which bots are running, degraded, or down — and why.
- **Communication monitoring**: See what each bot is saying across channels. Track message volume, response times, error rates.
- **Skills and tools usage**: Which tools each bot is using, how often, success rates.
- **Cost tracking**: Token usage, API costs, infrastructure costs — per bot, per team, per channel.
- **SLOs**: Define targets (uptime, latency, error rate) and track compliance.
- **Alerts**: Get notified when health degrades, costs spike, SLOs breach, or bots need attention. Alerts fire and notify via Slack webhook, email, or arbitrary webhook URL. Token spike detection and budget threshold alerts are built in. Alerts include remediation suggestions.

### Enforce Security

- **Gateway auth**: Every bot gets secure auth tokens, stored in secret managers, never in plaintext.
- **Policy packs**: Configurable guardrails — no public admin endpoints, egress allowlists, skills allowlists, mandatory audit logs.
- **RBAC**: Control who can deploy, configure, or destroy bots.
- **Secrets management**: Centralized secret rotation with blast radius visibility.
- **Security audit**: Continuous scanning for misconfigurations and vulnerabilities.

---

## The Vision: One-Person Corporate

Imagine a solo founder who deploys:
- A **customer support bot** on Telegram and WhatsApp that handles inbound queries 24/7
- A **DevOps bot** that monitors infrastructure, handles deployments, and responds to incidents
- A **code review bot** that reviews PRs, suggests improvements, and enforces standards
- A **business operations bot** that tracks metrics, generates reports, and manages schedules
- A **team lead bot** that coordinates the others, delegates tasks, and escalates to the human when needed

All deployed through Clawster. All monitored. All secure. All communicating with each other through governed channels. The founder sets goals, reviews results, and intervenes when needed — but the bots handle the day-to-day.

That's a one-person corporate. That's what Clawster enables.

---

## Technical Foundation: Built on OpenClaw's Real Surfaces

Clawster is not a generic orchestrator. It integrates tightly with OpenClaw's actual control surfaces:

- **Gateway WebSocket protocol**: The canonical integration surface for control and telemetry. All bot communication flows through Gateway.
- **Config model**: Clawster generates and manages OpenClaw's JSON5 config, respecting its semantics (config.apply, restart requirements, validation).
- **Health and diagnostics**: `openclaw status`, `openclaw health --json`, `openclaw doctor` — Clawster wraps these for monitoring and automated repair.
- **Onboarding and daemon model**: Clawster replicates OpenClaw's onboarding outcomes (gateway auth, daemon installation, profile isolation) in a reproducible, cloud-native way.
- **Runtime constraints**: WhatsApp and Telegram require Node. Clawster enforces this in templates and validation.
- **Profile isolation**: Each bot instance gets isolated state via `OPENCLAW_PROFILE`, `OPENCLAW_STATE_DIR`, and `OPENCLAW_CONFIG_PATH`.

---

## Deployment Model

### Self-Hosted (Primary)
Users run Clawster on their own infrastructure. The control plane (NestJS API + Next.js dashboard + PostgreSQL) runs wherever they want. Bots deploy to their chosen targets.

### Hosted SaaS (Future)
A managed offering where Clawster handles everything — the control plane, the infrastructure, the monitoring. Same capabilities as self-hosted, zero ops burden. For users who want the power without the infrastructure management.

Both paths use the same codebase. No feature gates. No artificial limitations on self-hosted.

---

## Success Metrics

- A non-technical user can deploy their first production OpenClaw in under 5 minutes
- A solo operator can run a team of 5+ specialized bots with full monitoring
- An enterprise can manage 500+ bots across multiple clouds with governance and compliance
- All inter-bot communication is auditable and rule-governed
- Zero plaintext secrets in any deployment
- Bot-to-bot delegation is auditable and visible in traces
- External notifications (Slack/webhook) are configurable per alert type and severity
- Open-source community actively contributing deployment targets, templates, and integrations
