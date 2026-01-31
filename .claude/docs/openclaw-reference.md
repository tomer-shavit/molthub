---
description: "Technical reference for OpenClaw Gateway, config model, health, security, and channels"
globs: ["packages/gateway-client/**/*.ts", "apps/api/src/channels/**/*.ts", "apps/api/src/health/**/*.ts", "apps/api/src/reconciler/**/*.ts"]
alwaysApply: true
---

# OpenClaw Documentation Reference

Source: https://docs.openclaw.ai/

This document captures the key technical details from OpenClaw's official documentation that Molthub needs to integrate with.

---

## 1. Gateway Architecture

The Gateway is OpenClaw's always-on process managing messaging connections and the control/event plane. It runs continuously and exits with non-zero status on fatal errors to trigger supervisor restarts.

### WebSocket Protocol

**Default port**: 18789

**Connection flow**: Clients initiate with a structured request frame containing:
- Protocol version bounds
- Client metadata
- Capabilities
- Authentication (token or password)

Gateway responds with either success (snapshot of presence, health, state version) or error before closing.

**Request/Response pattern**: After handshake, Gateway processes method invocations:
- `health` — Health snapshots
- `status` — Status summaries
- `send` — Message sending via active channels
- `agent` — Agent execution (two-stage: ack then completion)
- `config.get` — Current config + hash
- `config.apply` — Validate, write, restart
- `config.patch` — JSON merge-patch
- Node control methods

**Event streaming**: Gateway pushes:
- Agent output (seq-tagged for gap detection)
- Presence deltas with state versions
- Periodic keepalive ticks
- Graceful shutdown notifications

**Error codes**: `NOT_LINKED`, `AGENT_TIMEOUT`, `INVALID_REQUEST`, `UNAVAILABLE`

### Lifecycle & Daemon Management

**Local execution**: `openclaw gateway --port 18789`
- `--verbose` for debug logging
- `--force` to terminate conflicting listeners

**Service installation**:
- macOS: `openclaw gateway install` creates LaunchAgent at `~/Library/LaunchAgents/bot.molt.gateway.plist`
- Linux/WSL2: systemd user service with `loginctl enable-linger`
- Windows: WSL2 with systemd

**Supervision**: launchd/systemd restart on failure
- SIGTERM: graceful shutdown
- SIGUSR1: in-process restart (hybrid reload mode, default)

### Port Configuration

Gateway binds WebSocket control plane + HTTP server to single port (default 18789). Optional Canvas file server on derived port (default 18793).

**Precedence**: CLI flag `--port` > env `OPENCLAW_GATEWAY_PORT` > config `gateway.port`

**Auth**: `gateway.auth.token` or password required. Clients include credentials in `connect.params`.

---

## 2. Multiple Gateways / Instance Isolation

Each Gateway instance requires:
- **Dedicated config file** via `OPENCLAW_CONFIG_PATH`
- **Isolated state directory** via `OPENCLAW_STATE_DIR`
- **Separate workspace root** via `agents.defaults.workspace`
- **Unique base port** via `gateway.port` or `--port`
- **Non-overlapping derived ports** (browser, canvas, CDP)

### Profile-Based Setup (Recommended)

```bash
openclaw --profile main gateway --port 18789
openclaw --profile rescue gateway --port 19001
```

`--profile` automatically scopes state directories and config paths while suffixing service names.

**Port spacing**: Space base ports at least 20 ports apart for derived port safety.
- Browser control = base + 2
- Canvas host = base + 4
- CDP ports = auto-allocated from base + 11 through base + 110

**Service names**:
- macOS: `bot.molt.<profile>`
- Linux: `openclaw-gateway-<profile>.service`

---

## 3. Configuration Model

### File & Format

- JSON5 config at `~/.openclaw/openclaw.json` (comments and trailing commas allowed)
- If missing, safe defaults apply
- Strict schema validation at startup — unknown keys, malformed types, or invalid values prevent startup
- When validation fails, only diagnostic commands work (`openclaw doctor`, `openclaw logs`, `openclaw health`)

### Config Sections

#### agents.defaults
- `workspace`: default `~/openclaw`
- `model.primary`: main LLM (`provider/model` format)
- `model.fallbacks`: backup models
- `thinkingDefault`: `"low" | "high" | "off"`
- `timeoutSeconds`: max run duration (default 600)
- `maxConcurrent`: parallel run limit
- `sandbox`: Docker isolation config

#### agents.list
- `id`: stable identifier (required)
- `default`: marks primary agent
- `workspace`, `agentDir`: per-agent paths
- `identity`: name, emoji, theme, avatar
- `model`: per-agent model override
- `sandbox`: per-agent sandbox config
- `tools`: per-agent tool restrictions

#### session
- `scope`: `"per-sender"` (default) | `"per-channel-peer"`
- `reset.mode`: `"daily"` | `"idle"`
- `resetTriggers`: command list (`"/new"`, `"/reset"`)

#### messages
- `responsePrefix`: template with `{model}`, `{provider}`, `{identity.name}`
- `ackReaction`: emoji for inbound acknowledgment
- `queue.mode`: `"steer" | "collect" | "followup" | "interrupt"`
- `tts`: text-to-speech config (elevenlabs, openai)

#### channels

**Common fields** across all channel types:
- `enabled`: bool
- `dmPolicy`: `"pairing"` (default) | `"allowlist"` | `"open"` | `"disabled"`
- `groupPolicy`: `"allowlist"` (default) | `"open"` | `"disabled"`
- `allowFrom`: sender allowlist
- `groupAllowFrom`: group allowlist
- `historyLimit`: context window size
- `mediaMaxMb`: attachment cap

**WhatsApp-specific**:
- `sendReadReceipts`: bool (default true)
- `chunkMode`: `"length"` | `"newline"`
- QR pairing via `openclaw channels login`
- **Node.js required** (Bun not supported)

**Telegram-specific**:
- `botToken` / `tokenFile`
- `linkPreview`: bool
- `streamMode`: `"off"` | `"partial"` | `"block"`
- `customCommands`: extra slash commands
- **Node.js required** (Bun not supported)

**Discord-specific**:
- `token`: bot token
- `allowBots`: bool (default false)
- `guilds.<id>.slug`: lowercase guild name
- `replyToMode`: `"off"` | `"first"` | `"all"`

**Slack-specific**:
- `botToken`, `appToken`: required for Socket Mode
- `slashCommand.enabled`, `slashCommand.name`
- `thread.historyScope`: `"thread"` | `"channel"`

**Other channels**: Signal, iMessage, Mattermost, Google Chat, MS Teams, LINE, Matrix — similar dmPolicy/groupPolicy patterns with provider-specific details.

#### tools
- `profile`: `"minimal"` | `"coding"` | `"messaging"` | `"full"`
- `allow`: tool names or groups (`"group:runtime"`, `"group:fs"`, `"group:sessions"`, `"group:memory"`, `"group:web"`, `"group:ui"`, `"group:automation"`, `"group:messaging"`, `"group:nodes"`, `"group:openclaw"`)
- `deny`: blocklist (deny wins)
- `elevated.enabled`: elevated host exec (default true)
- `elevated.allowFrom`: per-channel sender allowlists

#### tools.exec
- `backgroundMs`: auto-background delay (default 10000)
- `timeoutSec`: auto-kill timeout (default 1800)

#### sandbox (agents.defaults.sandbox)
- `mode`: `"off"` | `"non-main"` | `"all"`
- `scope`: `"session"` | `"agent"` (default) | `"shared"`
- `workspaceAccess`: `"none"` (default) | `"ro"` | `"rw"`
- `docker.image`, `docker.network`, `docker.memory`, `docker.cpus`

#### skills
- `allowBundled`: whitelist bundled skills
- `load.extraDirs`: custom skill directories
- `entries.<skillKey>`: per-skill config, `enabled`, `env`, `apiKey`

#### plugins
- `enabled`: master toggle
- `allow`, `deny`: allowlist/blocklist
- `entries.<pluginId>`: per-plugin config

#### gateway
- `port`: listening port (default 18789)
- `auth.token`: API auth secret
- `host`: bind address

#### logging
- `level`: log threshold (default `"info"`)
- `file`: stable log path
- `redactSensitive`: `"off"` | `"tools"` (default)

#### bindings (multi-agent routing)
- `agentId`: target agent
- `match.channel`: required (`"whatsapp"`, `"telegram"`, etc.)
- `match.peer`: `{ kind: "dm"|"group"|"channel", id }`

### Config RPC

**`config.get`**: Returns current config + hash (hash required for updates)

**`config.apply`**: Full config replacement
- `raw`: full JSON5 payload
- `baseHash`: from `config.get` (required, optimistic concurrency)
- `sessionKey`: last active session for wake-up ping
- `restartDelayMs`: delay before restart (default 2000)

**`config.patch`**: Partial update (JSON merge-patch)
- `null` deletes keys
- Objects merge recursively
- Arrays replace entirely
- Same hash/sessionKey flow

### $include Directive
- `"$include": "./agents.json5"` (replaces value)
- `"$include": ["./a.json5", "./b.json5"]` (deep merge)
- Up to 10 nesting levels, circular detection

### Environment Variable Substitution
- `${VAR_NAME}` in config strings resolves at load time
- Missing vars cause errors unless escaped as `$${VAR}`
- Load order: process env > `.env` in CWD > `~/.openclaw/.env` > inline `env` config

---

## 4. Health & Diagnostics

### CLI Commands

```bash
openclaw status              # Local overview
openclaw status --all        # Full diagnosis (safe to share)
openclaw status --deep       # Gateway health checks
openclaw status --json       # Machine-readable output
openclaw health              # Health snapshot
openclaw health --json       # Structured health snapshot
openclaw doctor              # Config validation, service audit, auth check
openclaw doctor --fix        # Auto-repair (never writes without opt-in)
openclaw logs --follow       # Live log streaming
openclaw security audit      # Security audit
openclaw security audit --deep --fix  # Deep audit with auto-fix
```

### Health Check via Gateway WS

- Send `health` method → returns structured snapshot with linked channels, `ok: true/false`
- Send `status` method → returns status summary
- `openclaw gateway status` probes Gateway RPC
  - `--deep`: system-level supervisor scans
  - `--no-probe`: skip RPC checks
  - `--json`: script-safe output

### Troubleshooting Categories

**Authentication**: Missing API keys, OAuth refresh failures, model availability
**Network/Gateway**: Control UI failures, "Gateway won't start", port conflicts
**Channels**: WhatsApp disconnections, Discord allowlist issues, Telegram streaming
**Runtime**: Agent timeouts (default 30min), high memory usage, session resumption

**Nuclear reset**: Stop gateway → remove state directory → re-pair channels

---

## 5. Security Model

Three-layer access control: **identity verification** → **operational scope** → **model capability**

### Gateway Auth
- Default: token-based auth for all WebSocket connections
- Modes: `token` (bearer) or `password` (env-based)
- Tailscale Serve identity headers supported

### DM Policies
- `pairing` (default): Unknown senders get one-hour expiration codes, max 3 pending
- `allowlist`: Blocks unknown senders
- `open`: Allows anyone (requires explicit `"*"`)
- `disabled`: Ignores inbound DMs

### File Permissions
- Config: `600` (user read/write only)
- State directory: `700` (user only)
- `openclaw security audit --fix` auto-corrects

### Tool Safety
- Sandbox Docker isolation for tool execution
- Elevated execution with `allowFrom` restrictions
- Tool allow/deny lists
- Model selection impacts injection resistance

### Credential Storage
- WhatsApp: `~/.openclaw/credentials/whatsapp/<accountId>/creds.json`
- Model auth: `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`
- Sessions: `~/.openclaw/agents/<agentId>/sessions/*.jsonl`

### Secure Baseline Config

```json5
{
  gateway: {
    mode: "local",
    bind: "loopback",
    port: 18789,
    auth: { mode: "token", token: "your-long-random-token" },
    trustedProxies: ["127.0.0.1"]
  },
  channels: {
    whatsapp: {
      dmPolicy: "pairing",
      groups: { "*": { requireMention: true } }
    }
  },
  logging: { redactSensitive: "tools" },
  discovery: { mdns: { mode: "minimal" } }
}
```

---

## 6. Installation & Updates

### Install Methods

```bash
# Fastest (Linux/macOS)
curl -fsSL https://openclaw.ai/install.sh | bash

# Windows
iwr -useb https://openclaw.ai/install.ps1 | iex

# npm/pnpm
npm install -g openclaw@latest
pnpm add -g openclaw@latest
```

### Onboarding Wizard

```bash
openclaw onboard --install-daemon
```

Configures: model auth, gateway settings, channels, DM pairing, workspace, skills, background service.

### Updates

```bash
# Re-run installer (detects existing, upgrades in place)
curl -fsSL https://openclaw.ai/install.sh | bash

# Channel switching
openclaw update --channel beta|dev|stable

# Post-update verification
openclaw doctor
openclaw gateway restart
openclaw health
```

### Version Pinning & Rollback

```bash
# Pin specific version
npm i -g openclaw@<version>

# Source rollback
git checkout "$(git rev-list -n 1 --before=\"2026-01-01\" origin/main)"
pnpm install && pnpm build
```

---

## 7. Discovery & Transports

### Bonjour/mDNS (LAN-only)
- Service type: `_openclaw-gw._tcp`
- TXT records: `lanHost`, `gatewayPort`, `gatewayTls`, `tailnetDns`
- Disable: `OPENCLAW_DISABLE_BONJOUR=1`

### Transport Priority
1. Paired direct endpoint
2. Bonjour LAN discovery
3. Tailnet DNS/IP
4. SSH fallback

### SSH Tunneling
```bash
ssh -N -L 18789:127.0.0.1:18789 user@host
```

---

## 8. Skills & Plugins

### Skills Config
```json5
{
  skills: {
    allowBundled: ["github", "jira"],
    load: { extraDirs: ["./my-skills"] },
    install: { preferBrew: true, nodeManager: "pnpm" },
    entries: {
      "my-skill": { enabled: true, env: { API_KEY: "${MY_KEY}" } }
    }
  }
}
```

Changes picked up on next agent turn when watcher enabled.

### Plugins
```json5
{
  plugins: {
    enabled: true,
    allow: ["my-plugin"],
    entries: {
      "my-plugin": { config: { key: "value" } }
    }
  }
}
```

Plugins run in-process (trusted code boundary). Pin exact versions.

---

## 9. RPC Adapters

### Pattern A: HTTP Daemon (e.g., signal-cli)
- JSON-RPC over HTTP
- `/api/v1/events` — Server-Sent Events
- `/api/v1/check` — Health probe
- Gateway owns lifecycle when `autoStart=true`

### Pattern B: stdio Child Process (e.g., imsg)
- Line-delimited JSON-RPC over stdin/stdout
- Methods: `watch.subscribe`, `watch.unsubscribe`, `send`, `chats.list`
- No daemon or TCP port needed

---

## 10. Documentation Site Map

Base URL: `https://docs.openclaw.ai`

### Start Here

| Path | Description |
|------|-------------|
| [/start/getting-started](https://docs.openclaw.ai/start/getting-started) | Zero-to-first-chat quickstart: install CLI, run onboarding wizard, pair a channel |
| [/start/wizard](https://docs.openclaw.ai/start/wizard) | Interactive & non-interactive onboarding wizard for Gateway, channels, skills, and daemon setup |
| [/start/pairing](https://docs.openclaw.ai/start/pairing) | DM sender approval via short codes and device node authorization for the gateway network |
| [/start/hubs](https://docs.openclaw.ai/start/hubs) | Documentation index — links to every section organized by category |
| [/start/openclaw](https://docs.openclaw.ai/start/openclaw) | Setting up a personal always-on WhatsApp assistant with two-phone architecture |

### Gateway

| Path | Description |
|------|-------------|
| [/gateway](https://docs.openclaw.ai/gateway) | Gateway runbook — always-on process owning messaging connections and the control/event plane |
| [/gateway/configuration](https://docs.openclaw.ai/gateway/configuration) | Full configuration reference: agents, channels, models, sessions, sandbox, tools, plugins (JSON5 schema) |
| [/gateway/configuration-examples](https://docs.openclaw.ai/gateway/configuration-examples) | Copy-paste config examples: minimal setup, OAuth failover, restricted bots, multi-platform deployments |
| [/gateway/multiple-gateways](https://docs.openclaw.ai/gateway/multiple-gateways) | Running multiple isolated Gateway instances on one host with profiles, port spacing, and rescue-bot patterns |
| [/gateway/tailscale](https://docs.openclaw.ai/gateway/tailscale) | Auto-configuring Tailscale Serve/Funnel for secure remote Gateway access with identity-based auth |
| [/gateway/remote](https://docs.openclaw.ai/gateway/remote) | Remote access via SSH tunnels, VPNs, and tailnets; always-on vs. laptop-based architectures |
| [/gateway/discovery](https://docs.openclaw.ai/gateway/discovery) | LAN discovery (Bonjour/mDNS), Tailscale cross-network, and SSH fallback transport resolution |
| [/gateway/security](https://docs.openclaw.ai/gateway/security) | Security guide: access control, DM pairing, tool sandboxing, credential management, prompt injection, incident response |
| [/gateway/troubleshooting](https://docs.openclaw.ai/gateway/troubleshooting) | Diagnostic commands, auth failures, connection issues, provider errors, platform-specific fixes |

### Concepts

| Path | Description |
|------|-------------|
| [/concepts/multi-agent](https://docs.openclaw.ai/concepts/multi-agent) | Multi-agent routing: multiple isolated agents per Gateway with per-channel/account bindings and sandbox rules |
| [/concepts/streaming](https://docs.openclaw.ai/concepts/streaming) | Block streaming and Telegram draft streaming: chunking algorithms, channel-specific progressive delivery |
| [/concepts/session](https://docs.openclaw.ai/concepts/session) | Session management: scoping (per-sender, per-channel-peer), reset policies (daily, idle), inspection tools |
| [/concepts/groups](https://docs.openclaw.ai/concepts/groups) | Group chat handling: group policies, mention gating, allowlists, per-group tool restrictions |
| [/concepts/group-messages](https://docs.openclaw.ai/concepts/group-messages) | WhatsApp group activation: mention/always modes, per-group sessions, context injection, sender surfacing |

### Channels

| Path | Description |
|------|-------------|
| [/channels/telegram](https://docs.openclaw.ai/channels/telegram) | Telegram setup: bot token, DM/group policies, inline buttons, sticker handling, draft streaming |
| [/channels/discord](https://docs.openclaw.ai/channels/discord) | Discord setup: bot creation, intents, permissions, allowlists, mention-gating, guild configuration |
| [/channels/mattermost](https://docs.openclaw.ai/channels/mattermost) | Mattermost plugin: installation, chat modes, access control, multi-account support |
| [/channels/imessage](https://docs.openclaw.ai/channels/imessage) | iMessage integration: macOS setup, SSH remote access, attachment handling, DM/group policies |

### Tools

| Path | Description |
|------|-------------|
| [/tools/slash-commands](https://docs.openclaw.ai/tools/slash-commands) | Slash commands and directives across platforms: model selection, debugging, admin functions |
| [/tools/skills](https://docs.openclaw.ai/tools/skills) | Skills system: YAML-defined tool packages, loading precedence, gating, OpenClawHub registry |
| [/tools/skills-config](https://docs.openclaw.ai/tools/skills-config) | Skills configuration: enable/disable, extra directories, install preferences, per-skill API keys and env vars |

### Platforms

| Path | Description |
|------|-------------|
| [/platforms/macos](https://docs.openclaw.ai/platforms/macos) | macOS Companion menu bar app: local gateway broker, TCC permissions, notifications, screen recording |
| [/platforms/ios](https://docs.openclaw.ai/platforms/ios) | iOS Node app (preview): WebSocket Gateway connection, Canvas, camera, voice, A2UI rendering |
| [/platforms/android](https://docs.openclaw.ai/platforms/android) | Android Node app: connection architecture, discovery, pairing, chat/canvas/camera commands |
| [/platforms/windows](https://docs.openclaw.ai/platforms/windows) | Windows via WSL2: installation, gateway service setup, LAN network configuration |
| [/platforms/linux](https://docs.openclaw.ai/platforms/linux) | Linux/VPS: quick-start, CLI service installation, systemd user unit setup |

### Web & Nodes

| Path | Description |
|------|-------------|
| [/web](https://docs.openclaw.ai/web) | Gateway web interface: Control UI access via loopback, Tailnet, or Funnel with auth options |
| [/web/webchat](https://docs.openclaw.ai/web/webchat) | WebChat: native browser chat via Gateway WebSocket, same sessions/routing as other channels |
| [/web/control-ui](https://docs.openclaw.ai/web/control-ui) | Control UI dashboard: chat management, channel admin, local/Tailnet/HTTP deployment, dev guidance |
| [/nodes](https://docs.openclaw.ai/nodes) | Nodes: companion devices exposing canvas, camera, and system commands over WebSocket |
| [/nodes/images](https://docs.openclaw.ai/nodes/images) | Media images: WhatsApp media handling, file types, size limits, send/receive processing pipelines |
| [/nodes/audio](https://docs.openclaw.ai/nodes/audio) | Audio transcription: voice note processing, provider support (OpenAI, Deepgram, local CLIs), 20MB cap |

### Automation

| Path | Description |
|------|-------------|
| [/automation/cron-jobs](https://docs.openclaw.ai/automation/cron-jobs) | Cron scheduler: at/every/cron schedules, isolated or main-session execution, channel delivery, CLI management |
| [/automation/webhook](https://docs.openclaw.ai/automation/webhook) | HTTP webhooks: `/hooks/wake` for notifications, `/hooks/agent` for isolated agent tasks, auth requirements |
| [/automation/gmail-pubsub](https://docs.openclaw.ai/automation/gmail-pubsub) | Gmail Pub/Sub: Google Cloud watch notifications integration, wizard-based automated wiring |

### Installation & Updates

| Path | Description |
|------|-------------|
| [/install/updating](https://docs.openclaw.ai/install/updating) | Update guide: upgrade paths (global, source, web installer), channel switching, rollback procedures |
| [/install/nix](https://docs.openclaw.ai/install/nix) | Nix installation: Home Manager module for macOS, launchd service, plugin system, packaging details |

### Reference

| Path | Description |
|------|-------------|
| [/reference/rpc](https://docs.openclaw.ai/reference/rpc) | RPC adapters: HTTP daemon (signal-cli) and stdio child process (imsg) JSON-RPC integration patterns |
| [/reference/templates/AGENTS](https://docs.openclaw.ai/reference/templates/AGENTS) | Workspace templates: agent operational guidelines, memory systems, safety protocols, communication patterns |
| [/help](https://docs.openclaw.ai/help) | Help hub: quick links for installation issues, gateway errors, FAQs, and conceptual guides |

### External Resources

| Link | Description |
|------|-------------|
| [llms.txt](https://docs.openclaw.ai/llms.txt) | Complete documentation index in machine-readable format |
| [GitHub](https://github.com/openclaw/openclaw) | Source repository |
| [Releases](https://github.com/openclaw/openclaw/releases) | Release notes and downloads |
| [OpenClaw](https://openclaw.ai) | OpenClaw assistant companion site |
