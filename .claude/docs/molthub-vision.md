---
description: "Product vision for Molthub as a control plane for Moltbot swarms"
globs: []
alwaysApply: false
---

# Molthub Vision Document

## What Molthub Is

Molthub is an open source, self hosted control plane for running and operating a swarm of Moltbots. It gives you one place to provision many Moltbot instances, configure them consistently, attach channels and integrations, enforce security guardrails, roll out changes safely, and get fleet level visibility into health, logs, traces, cost, and quality. It is designed to integrate tightly with Moltbot's real control surfaces. The CLI, the Gateway WebSocket protocol, the config model, and the onboarding and doctor workflows.

## What We Know About Moltbot That Molthub Should Build On

### Gateway-Centric Architecture
The Gateway WebSocket protocol is the single control plane transport that all clients connect to (CLI, web UI, apps, nodes). Molthub should treat this as the canonical integration surface for control and telemetry.

### First-Class Onboarding and Background Service Model
The recommended setup is `moltbot onboard --install-daemon`, which configures local vs remote gateway, auth, channels, and installs a background service via systemd/launchd.

### Strongly Opinionated About Runtime
Node is the recommended runtime. It is explicitly required for WhatsApp and Telegram. Bun is not recommended due to bugs for those channels. Molthub should encode this into templates and validation.

### Scriptable and Machine-Friendly
Gateway lifecycle commands support `--json` for scripting. Gateway status reports config path mismatches between CLI and service. This is perfect for Molthub's reconciler and diagnostics.

### Explicit Health and Diagnostics
`moltbot status` and `moltbot health --json` provide structured health snapshots, plus recommended repair flows for common failures like WhatsApp relinking. Molthub can surface these as first class UI health panels and alerts.

`moltbot doctor` can generate gateway auth tokens, run health checks, and audit or repair supervisor configs. Molthub can invoke this logic during provisioning or drift repair.

### Multiple Isolated Profiles and State Dirs
Moltbot docs describe using `CLAWDBOT_PROFILE`, `CLAWDBOT_STATE_DIR`, and `CLAWDBOT_CONFIG_PATH` to isolate state. Warns about config mismatches when the daemon is running a different config than the CLI. Molthub should treat "isolation per instance" as mandatory.

### RPC-Style Config Apply
The FAQ describes an RPC style `config.apply` that validates, writes full config, and restarts the Gateway. Molthub should model "apply" as a safe, validated transaction.

### Supply Chain Risk
There is a recent GitHub issue claiming the moltbot package on npm is not owned by the project. Molthub should prefer pinned, verifiable install methods and document safe install paths.

---

## What Molthub Is, In Platform Terms

Molthub is not "another bot". It is an operator layer for Moltbot.

### 1. Fleet Provisioning and Lifecycle

Molthub's job is to make "I need 200 Moltbots" feel like "I need 200 services".

- **One click create**: Name it, tag it, choose template. Molthub provisions compute, deploys Moltbot, and runs health checks using Moltbot's own health surfaces.
- **Lifecycle actions**: Start, stop, restart, redeploy, destroy. Implemented via cloud adapter plus Moltbot gateway lifecycle semantics.
- **Bulk operations**: Restart 50 bots. Roll out a version pin to a whole fleet. Freeze rollouts.

### 2. Configuration at Scale, Without Config Sprawl

Core primitives:
- **Template**: "Slack support bot", "Ops bot", "Personal assistant"
- **Profile**: Shared defaults. "Prod baseline", "EU residency baseline"
- **Overlay**: Small deltas applied to a group or single bot

**Golden rule**: Molthub should not invent a competing Moltbot configuration universe. It should generate and manage Moltbot's config consistently, isolate state per instance, and apply changes respecting Moltbot's restart requirements and tooling.

### 3. Connectors, Not Duplicated Secrets

First class Connectors:
- Slack connector with token reference and scopes
- Telegram connector with bot token reference
- Model provider connector with API keys or OAuth references

Bots attach to connectors. Rotate once. See blast radius.

### 4. Policy Packs and Guardrails

Examples:
- No public admin endpoints by default
- No plaintext secrets, only secret store references
- Egress allowlist required in prod
- Skills allowlist, version pinning
- Mandatory audit logs for changes

This is the difference between "I can run 200 bots" and "I can run 200 bots safely".

### 5. Operations and Observability Built Around Moltbot's Reality

- **Fleet health**: How many bots are degraded, why, and since when
- **Per bot health**: Using Moltbot status and health --json surfaces, plus infra health
- **Repair actions**: "Relink WhatsApp", "Restart gateway", "Fix daemon config mismatch"
- **Traceability**: From inbound message, to model call, to tool call, to response

---

## What "Seamless Integration" Specifically Means

### Provisioning Should Mimic Moltbot Onboarding, But Cloud-Native
Moltbot onboarding wizard configures gateway mode and installs a daemon. Molthub should replicate the outcomes in a reproducible, per-instance way. Must generate and store gateway auth tokens securely.

### Configuration Apply Should Use Moltbot's Semantics
`config.apply` validates, writes config, and restarts the gateway. Molthub should implement "Apply" as a transaction with validation, diff preview, and explicit restart implications. Should detect and prevent "CLI config path vs service config path mismatch" issues.

### Diagnostics Should Wrap Moltbot's Own Tools
"Show me what's wrong" should expose the same deep diagnosis as `moltbot status --deep` and `moltbot health --json`. "Repair" should leverage doctor-style checks.

### Runtime Constraints Should Be Enforced
If a user selects WhatsApp or Telegram, Molthub should force Node runtime and block Bun.

### Plugin and Extension Model Should Be First Class
Plugins under `plugins.entries.<id>.config` pattern with version pinning and rollout controls.

---

## Metrics and Dashboards That Matter for a Swarm

### Reliability
- Bots running, degraded, down
- Message throughput by channel
- End to end latency percentiles
- Error taxonomy: provider errors, channel auth failures, tool failures

### Security Posture
- Bots with risky exposure settings
- Overly broad tool permissions
- Secrets nearing expiry, rotated, or missing
- Config drift: "Service is not using the intended config path"

### Cost and Efficiency
- Cost per bot, per tenant, per channel
- Token in/out, retries, fallback rate
- Cache hit rate

### Quality
- Success rate by scenario
- Escalation rate
- Golden test replay score after rollout

---

## The Dream State

A platform where managing 500 Moltbots is normal. You would expect:
- Templates, profiles, overlays, connectors, policy packs
- Change sets with canary rollouts and rollback gates
- Fleet dashboards showing health, cost, and quality regressions
- Deep message traces and a replay sandbox
- Strong governance: audit logs, RBAC, secrets scoping, egress controls
