---
description: "Mandatory development workflow for all Claude Code sessions in Clawster"
globs: []
alwaysApply: true
---

# Clawster Development Workflow

This document defines the **mandatory workflow** that Claude Code must follow for every coding session in this project. No code may be written without completing these steps in order.

---

## Step 0: Read the Docs (MANDATORY — Do This First)

Before writing ANY code, you MUST read all documentation files in `.claude/docs/`. **Read all three docs in parallel** using concurrent tool calls:

1. `.claude/docs/clawster-vision.md` — Product vision and platform goals
2. `.claude/docs/current-codebase-analysis.md` — Current architecture and module inventory
3. `.claude/docs/openclaw-reference.md` — OpenClaw Gateway, config model, channels, health, security

**Do not skip any doc.** Every feature and bug fix must be informed by these references.

---

## Step 1 + 1.5: Understand the Codebase AND Research OpenClaw (RUN IN PARALLEL)

These two steps are **independent** and MUST be launched **in parallel** using concurrent Task tool calls in a single message:

### Step 1: Understand the Codebase

- Use the Explore agent to understand the files and modules related to the task
- Read existing code in the affected areas — never propose changes to code you haven't read
- Identify existing patterns, conventions, and dependencies

### Step 1.5: Research the OpenClaw Source (MANDATORY)

Clawster integrates with **OpenClaw** (`https://github.com/openclaw/openclaw`), an open-source personal AI assistant. Before planning any feature or fix, you MUST check how OpenClaw itself implements the relevant functionality:

1. Use `WebFetch` or `gh api` to browse the OpenClaw repo at `https://github.com/openclaw/openclaw`
2. Key areas to check depending on the task:
   - **Gateway/WebSocket protocol**: `src/gateway/` — server implementation, auth, config reload, health, RPC methods
   - **Config model**: `src/config/` — how `openclaw.json` is structured, validated, and reloaded
   - **Channels**: `src/channels/`, `extensions/` — how channels (WhatsApp, Telegram, Discord, etc.) are implemented
   - **CLI commands**: `src/cli/`, `src/commands/` — how `openclaw onboard`, `openclaw gateway`, etc. work
   - **Docker setup**: `docker-compose.yml`, `Dockerfile` — how OpenClaw runs in containers
   - **Protocol types**: `src/gateway/protocol/` — the WebSocket message schema
3. Understand how the real OpenClaw works **before** designing how Clawster should integrate with it
4. If the task involves Gateway communication, config management, deployment, or health monitoring — this step is especially critical

**Why**: Clawster is a management layer for OpenClaw. Building features without understanding the real OpenClaw implementation leads to wrong assumptions, broken integrations, and wasted effort.

---

## Step 2: Plan Before Coding

For every feature or bug fix:

1. Enter plan mode (`EnterPlanMode`) to design the implementation
2. Base the plan on:
   - The feature requirements provided by the user
   - The docs in `.claude/docs/` (especially `openclaw-reference.md`)
   - The existing codebase patterns discovered in Step 1
   - **The real OpenClaw implementation** discovered in Step 1.5
3. Break the plan into concrete, actionable steps using `TodoWrite`
4. Present the plan to the user for approval before writing any code
5. The plan MUST include an end-to-end testing step — no plan is complete without it

---

## Step 3: Implement Using Parallel Agents (MAXIMIZE CONCURRENCY)

Once the plan is approved:

- **Always prefer parallel execution.** Identify which plan steps are independent and launch them ALL concurrently using multiple `Task` tool calls in a single message. Only sequence steps that have true data dependencies.
- For each independent step, spawn a separate agent using the `Task` tool — do NOT implement sequentially when parallel is possible
- When a step touches both API and Web, launch separate agents for each app concurrently
- When a step requires changes to a shared package AND consuming apps, implement the package first, then launch app-level agents in parallel
- Track progress with `TodoWrite`, marking each step as `in_progress` → `completed`
- Follow existing codebase conventions (NestJS patterns for API, Next.js for web, Zod for schemas, Prisma for DB)
- **ALWAYS follow SOLID principles** when adding new code:
  - **S**ingle Responsibility: Each class/module has one reason to change
  - **O**pen/Closed: Open for extension, closed for modification
  - **L**iskov Substitution: Subtypes must be substitutable for their base types
  - **I**nterface Segregation: Many specific interfaces over one general-purpose interface
  - **D**ependency Inversion: Depend on abstractions, not concretions
- Do not over-engineer — only implement what the plan specifies

---

## Step 4: End-to-End Tests (MANDATORY — Not Done Until Tests Pass)

A feature is **NOT complete** until:

1. End-to-end tests are written that verify the feature works as specified
2. All new tests pass
3. All existing tests still pass
4. The build succeeds (`pnpm build`)

Use the E2E testing agent or write tests directly. No PR may be created without passing tests.

---

## Step 5: Automated Code Review (MANDATORY — Runs Automatically)

After tests pass and before creating a PR, you MUST run the code review agent. **Do not skip this step. Do not ask the user whether to run it — just run it.**

1. Use the `Task` tool to spawn a review agent:
   - `subagent_type`: `"everything-claude-code:code-reviewer"`
   - In the prompt, include:
     a. The **original user request** (copy it verbatim from the start of the conversation)
     b. The **list of all files changed or created** during this session
     c. A brief summary of what was implemented
     d. Instruct the agent to follow the review process defined in `.claude/commands/review.md`
     e. **Instruct the agent to check for dead code** — unused functions, variables, imports, types, and unreachable code paths
2. Read the review agent's response carefully
3. If the review returns **SUGGEST CHANGES** or **REQUEST CHANGES**:
   - Implement ALL critical issues immediately
   - **Remove ALL dead code identified by the reviewer** — this is mandatory, not optional
   - Implement suggested improvements unless they contradict the approved plan
   - Re-run affected tests after making changes
4. If the review returns **APPROVE**, proceed to Step 6
5. After addressing review feedback, re-run the review agent ONE more time to confirm fixes

**Dead code is a blocking issue.** The reviewer MUST flag unused code, and it MUST be removed before the PR is created. No exceptions.

This step is automatic — the implementing agent triggers it as part of the normal workflow. The user does not need to request it.

---

## Step 5.5: Runtime Validation (MANDATORY)

**After code review passes and BEFORE marking the feature complete**, you MUST validate that the code actually works:

1. **Build the affected packages:**
   ```bash
   pnpm --filter <package-name> build
   ```
   The build must succeed with no errors.

2. **Run the code in a realistic scenario:**
   - For CLI commands: Execute the command with real arguments and verify output
   - For API endpoints: Start the server and test with curl or a real HTTP request
   - For frontend components: Verify the build completes and the component renders
   - For library code: Write and run a quick integration test or use an existing test

3. **Verify the happy path works end-to-end:**
   - Don't just verify "it compiles" — verify "it works"
   - Test with realistic inputs, not just edge cases
   - If the feature has multiple steps, test the full flow

4. **Test idempotent/re-run scenarios if applicable:**
   - Can the command be run twice without errors?
   - Does it handle "already exists" cases gracefully?

5. **If validation fails:**
   - Fix the issue immediately
   - Re-run the validation
   - Do NOT proceed until the feature works correctly

**Why this step is mandatory:** Code that compiles but doesn't run correctly wastes time and damages trust. A feature is not "done" until it has been validated to work in the actual runtime environment.

---

## Step 6: Verify Against Docs and Spec

After implementation, tests, code review, and **runtime validation** pass:

1. Re-read the relevant docs in `.claude/docs/`
2. Re-read the original feature requirements
3. Verify that ALL changes align with:
   - The OpenClaw reference documentation (config model, Gateway protocol, channel behavior, security model)
   - The transformation spec (correct work package, correct file locations, correct exports)
   - The product vision (OpenClaw-native, not cloud-generic)
4. If any misalignment is found, fix it before proceeding

---

## Step 7: Create PR to Master

Once everything passes verification:

1. Create a new branch for the feature/fix
2. Commit all changes with a descriptive commit message
3. Push to remote using `git push -u origin <branch>`
4. Create a PR to `master` using `gh pr create`
5. PR title should be concise (<70 chars), body should include:
   - Summary of changes
   - Which work package(s) this relates to (if applicable)
   - Test plan
6. Each feature or bug fix gets its own PR — do not batch unrelated changes

---

## Key Rules

- **Never skip the docs.** Every session starts by reading `.claude/docs/`.
- **Never skip OpenClaw research.** Before planning, check `https://github.com/openclaw/openclaw` for the real implementation of relevant features.
- **Never skip planning.** Use `EnterPlanMode` for non-trivial work.
- **Never skip tests.** E2E tests are required for completion.
- **Never skip code review.** The review agent runs automatically after tests pass — do not skip it or ask the user first.
- **Never skip runtime validation.** Build AND run the code to verify it works — "it compiles" is not enough. Test with realistic inputs and verify the happy path end-to-end.
- **Never skip verification.** Re-read docs after implementation.
- **ALWAYS follow SOLID principles.** Every new class, module, and function must adhere to Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion.
- **Never leave dead code.** Unused functions, variables, imports, types, and unreachable code paths must be removed immediately. The code reviewer will flag dead code as a blocking issue.
- **ALWAYS prefer parallel execution.** This is a core principle. When multiple tool calls, agents, file reads, or searches are independent, launch them ALL concurrently in a single message. Never do sequentially what can be done in parallel. This applies to every step: reading docs, exploring code, researching OpenClaw, implementing features, running tests, and spawning review agents.
- **One PR per feature/fix** pushed to `master` via `gh pr create`.
- **Track everything** with `TodoWrite` for visibility.
- **Never run `pnpm dev` yourself.** If you make changes that affect the API server (port 4000), kill any existing process on port 4000 (`lsof -ti:4000 | xargs -r kill -9`) and ask the user to run `pnpm dev` in their console.

---

## Project Structure Reference

```
clawster/
├── apps/
│   ├── api/          # NestJS backend (port 4000)
│   └── web/          # Next.js frontend (port 3000)
├── packages/
│   ├── core/         # Zod schemas, types, PolicyEngine
│   ├── database/     # Prisma + SQLite
│   ├── adapters-aws/ # AWS SDK integrations
│   ├── cloud-providers/ # Deployment providers
│   └── cli/          # CLI tool
└── .claude/
    └── docs/         # Project documentation (READ FIRST)
```

## Tech Stack

- **Backend**: NestJS 10.3, TypeScript, Prisma 5.8, SQLite
- **Frontend**: Next.js 14, Tailwind CSS, shadcn/ui, Recharts
- **Schemas**: Zod for validation
- **Monorepo**: pnpm + Turborepo
- **Auth**: JWT + bcrypt
- **Testing**: Jest (unit/integration), Playwright (E2E)

---

## OpenClaw Gateway Protocol — Hard-Won Lessons

These are protocol details discovered through debugging real gateway interactions. **Do not guess protocol shapes — always verify against the OpenClaw source at `src/gateway/protocol/schema/`.**

### RPC Parameter Validation is Strict

OpenClaw uses TypeBox schemas with `additionalProperties: false`. Any unknown property in an RPC request causes an `INVALID_REQUEST` error. Always check the exact schema in `src/gateway/protocol/schema/` before adding or renaming fields.

### The `agent` RPC

The `agent` method has specific requirements that differ from what you might assume:

- **Required fields**: `message` (not `prompt`), `idempotencyKey` (not optional)
- **Timeout field**: `timeout` (not `timeoutMs`) — integer in milliseconds
- **Session targeting**: The gateway requires at least one of `agentId`, `to`, or `sessionId` to route the request. Without this, you get `UNAVAILABLE: Pass --to <E.164>, --session-id, or --agent to choose a session`. For targeting the default agent, use `agentId: "main"`.
- **Delivery control**: Set `deliver: false` to prevent the agent from trying to deliver the response to a channel (useful for internal probes).
- **Full schema reference**: `src/gateway/protocol/schema/agent.ts` → `AgentParamsSchema`

### Two-Phase Agent Response Pattern

The `agent` RPC uses a **two `res` frames with the same `id`** pattern:

1. **Ack (immediate)**: `{ type: "res", id: "<req-id>", ok: true, payload: { runId: "<idempotencyKey>", status: "accepted", acceptedAt: <timestamp> } }`
2. **Completion (after LLM finishes)**: `{ type: "res", id: "<same-req-id>", ok: true, payload: { runId: "...", status: "ok", summary: "completed", result: { payloads: [{ text: "...", mediaUrl: null }], meta: {...} } } }`

The `runId` in the ack is always equal to the `idempotencyKey` you sent. If the completion is an error, `status` is `"error"` and `summary` contains the error message.

**Critical: `summary` is NOT the agent output.** `summary` is a status string (e.g., `"completed"`). The actual agent text response is in `result.payloads[0].text`. Each payload has `{ text, mediaUrl }`. Multiple payloads can exist for multi-part responses. Do NOT use `summary` or `result` directly as the output string.

**Critical client implementation detail**: After the first `res` frame resolves the pending WebSocket handler, you must **re-register on the same message `id`** to catch the second `res` frame. If you delete the pending entry after the ack (as is normal for single-response RPCs), the completion frame will be silently dropped.

### The `agent.identity.get` RPC

Returns `{ agentId, name, avatar }`. Resolves through: config overrides → agents section → IDENTITY.md → defaults. In practice, often returns the default `{ name: "Assistant", avatar: "A" }` because IDENTITY.md workspace resolution may not work for all setups. The bot's identity IS available in its chat context (IDENTITY.md is loaded for conversations), so probing via the `agent` RPC is more reliable for getting the real identity.

### Debugging Gateway Issues

When gateway communication fails:
1. **Always check Docker logs**: `docker logs <container-name> --tail 50` — the gateway logs every RPC request/response with method, timing, and error details
2. **Container naming**: OpenClaw containers are named `openclaw-<bot-name>` (e.g., `openclaw-test-l-1`)
3. **Gateway error format**: `⇄ res ✗ <method> errorCode=<CODE> errorMessage=<msg>` — this shows the exact rejection reason
4. **Don't assume protocol shapes** — even if the TypeScript types compile, the gateway validates at runtime with strict schemas. A build passing does NOT mean the wire protocol is correct.

---

## Reconciler & Instance Lifecycle — Hard-Won Lessons

### Bot Status Semantics — Do NOT Overload

Bot instance statuses have **specific meanings** in the reconciler. Misusing them causes cascading failures:

- **CREATING**: Brand new instance, never provisioned. Reconciler does **full provision** (install infra + configure + start + connect gateway).
- **PENDING**: Needs reconciliation. Could be new OR existing. The reconciler checks `lastReconcileAt`/`configHash` to decide provision vs update.
- **RUNNING / DEGRADED**: Normal operational states. Drift detection runs on these.
- **RECONCILING**: Actively being reconciled. Stuck detector catches these after 10 minutes.
- **ERROR**: Failed. User can retry via "Reconcile" button.
- **STOPPED**: Intentionally stopped. Resume sets to PENDING.

**Critical rule**: When changing a bot's status to trigger re-reconciliation (e.g., fleet promotion, config change), set it to **PENDING**, NOT CREATING. The reconciler uses `isNewInstance()` to decide between full provisioning and config update. Full provisioning on an existing ECS instance tries to create infrastructure that already exists, causing hangs or failures.

### Deployment Target Differences Matter

Not all deployment targets behave the same during reconciliation:

| Operation | Docker | ECS EC2 |
|-----------|--------|-------------|
| **Provision (new)** | Creates container (fast, idempotent) | Creates CloudFormation stack (slow, 5-10 min) |
| **Config update** | Gateway WS `config.apply` + write to disk | Gateway WS `config.apply` + update Secrets Manager |
| **Re-provision (existing)** | Replaces container (works) | Must update stack, not create (create fails with AlreadyExistsException) |
| **Credentials** | None needed | AWS creds required; empty creds cause SDK to probe IMDS (hangs on non-AWS machines) |

**Always test reconciliation changes against ALL deployment types**, not just Docker. ECS has timeouts (CloudFormation: 10min, endpoint resolution: 5min) that can exceed the stuck detector threshold.

### Config Persistence Across Restarts

When pushing config via Gateway WS (`config.apply`), the config is only in the gateway's memory and local disk. For deployment targets with external config stores (ECS uses Secrets Manager), you MUST also persist the config to the backing store. Otherwise, when the container/task restarts, it reverts to the old config.

### The Reconciler Must Be Self-Healing

Every error path in the reconciler must:
1. **Record the error** in `lastError` on the BotInstance — silent failures are unacceptable
2. **Set status to ERROR** so the user can see and retry from the dashboard
3. **Not hang indefinitely** — use timeouts, and ensure the stuck detector can catch anything that slips through
4. **Be retryable** — clicking "Reconcile" from the dashboard must work without needing CLI access

The user should NEVER need to open a terminal to fix a bot. Everything must be fixable from the web dashboard.

---

## OpenClaw Sandbox Mode — Security Architecture

### The Core Threat: Prompt Injection

The threat model for a personal assistant isn't "malicious LLM" — it's **"LLM tricked by malicious input."**

OpenClaw processes untrusted content: documents, emails, web pages, messages from contacts. An attacker can embed hidden instructions that trick the LLM into executing commands with your permissions. Sandbox mode isolates agent code execution, limiting the blast radius of a successful injection.

### How OpenClaw Sandbox Works

OpenClaw sandbox spawns **nested Docker containers** for each agent task. The sandbox container has:
- Limited filesystem access (only the workspace)
- Network isolation (`network: none` blocks exfiltration)
- No access to environment variables (API keys stay in parent)
- Ephemeral lifecycle (destroyed after task)

**The DinD Problem**: Standard Docker containers cannot spawn nested containers — no daemon, no CLI, no socket access. Error: `spawn docker ENOENT`.

### Three Options for Enabling Sandbox

| Option | Security | Why |
|--------|----------|-----|
| **Socket mount** (`-v /var/run/docker.sock:...`) | ❌ Bad | Container gets root-equivalent host access |
| **--privileged** | ❌ Worse | Container has nearly all host capabilities |
| **Sysbox runtime** (`--runtime=sysbox-runc`) | ✅ Good | True VM-like isolation via UID mapping |

**Sysbox** enables Docker-in-Docker without compromising security. Container root maps to unprivileged host UID. The container *thinks* it has root but cannot touch the host.

### Key Security Principles

1. **Sandbox + network: none** = prompt injection can't exfiltrate data
2. **Sysbox** = nested containers without --privileged
3. **dmPolicy: pairing** = approval codes for channel access (prevents unauthorized conversations)
4. **Defense in depth** = VPC isolation, security groups, IMDSv2, encrypted storage all layer on top

### Current State

- **Local Docker**: `sandbox.mode: "off"` (DinD unavailable) — set in `onboarding.service.ts`
- **EC2 with Sysbox**: Enable `sandbox.mode: "all"` with `docker.network: "none"` for prompt injection protection
