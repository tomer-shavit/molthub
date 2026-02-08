---
description: "Mandatory development workflow for all Claude Code sessions in Clawster"
globs: []
alwaysApply: true
---

# Clawster Development Workflow

Mandatory workflow for every coding session. No code without completing these steps.

## Step 0: Context Loading

Docs auto-load via glob frontmatter when touching relevant files. Only read `.claude/docs/` manually when the task requires broad project context (e.g., new feature spanning multiple packages).

Key docs: `clawster-vision.md` (product goals), `current-codebase-analysis.md` (architecture), `openclaw-reference.md` (Gateway/config/channels), `aws-deployment-architecture.md` (ECS EC2).

## Step 1 + 1.5: Understand Codebase AND Research OpenClaw (PARALLEL)

Launch **in parallel** using concurrent Task tool calls:

**Step 1 — Codebase**: Use Explore agent on affected files/modules. Read existing code before proposing changes.

**Step 1.5 — OpenClaw Source** (`https://github.com/openclaw/openclaw`): Check how OpenClaw implements relevant functionality. Key paths: `src/gateway/` (WebSocket), `src/config/` (openclaw.json), `src/channels/` + `extensions/` (channels), `src/cli/` (commands), `docker-compose.yml`.

**Why**: Clawster is a management layer for OpenClaw. Features built without understanding the real implementation lead to broken integrations.

## Step 2: Plan Before Coding

1. `EnterPlanMode` to design implementation
2. Base plan on: user requirements + `.claude/docs/` + OpenClaw source findings
3. Break into steps with `TodoWrite`.
4. Get user approval before writing code

## Step 3: Implement (MAXIMIZE CONCURRENCY)

- Launch independent steps as parallel `Task` agents — never sequential when parallel is possible
- API + Web changes → separate concurrent agents
- Shared package first, then consuming apps in parallel
- Track with `TodoWrite`: `in_progress` → `completed`
- Follow existing conventions (NestJS, Next.js, Zod, Prisma). Follow SOLID principles.
- Do not over-engineer

### SOLID Principles (MANDATORY for every class/module/function)

- **S — Single Responsibility**: One reason to change per module. If a class does two things, split it.
- **O — Open/Closed**: Extend via composition/interfaces, not by modifying existing code.
- **L — Liskov Substitution**: Subtypes must be substitutable for their base types without breaking behavior.
- **I — Interface Segregation**: Small, focused interfaces. No god-interfaces forcing unused method implementations.
- **D — Dependency Inversion**: Depend on abstractions (interfaces), inject dependencies via constructor/module system.

### Dead Code Policy (ZERO TOLERANCE)

- Remove unused imports immediately after writing code
- Delete unused functions/variables — never comment them out
- No `// TODO` stubs without an implementation plan
- No commented-out code blocks — use git history instead
- Run `knip` before every PR to catch unused exports

## Step 4: Build

Build must succeed: `pnpm --filter <package> build`.

## Step 5: Code Review (AUTOMATIC)

Run code-reviewer agent automatically after build passes. Do NOT ask — just run it.
- Spawn `everything-claude-code:code-reviewer` with: original request, changed files, summary
- Instruct it to follow `.claude/commands/review.md` and check for dead code
- If SUGGEST/REQUEST CHANGES: fix all critical issues, remove dead code
- If APPROVE: proceed

**Dead code is a blocking issue.** Must be removed before PR.

## Step 5.5: Runtime Validation (MANDATORY)

After review passes, validate the code actually **works**:
1. `pnpm --filter <package> build` — must succeed
2. **Browser verification for UI/web changes** (MANDATORY):
   - Ask user to start the dev server (never run `pnpm dev` yourself)
   - Use **Computer Use** (built-in screenshot + click) to visually verify the affected area
   - Take a screenshot, inspect the rendered UI, click through the fixed/new feature
   - If something looks wrong, screenshot again after attempting to fix
   - For API changes, verify responses via `curl` or check the Network tab visually
3. For backend-only changes: `curl` endpoints or run CLI commands
4. Test the happy path end-to-end with realistic inputs
5. Test idempotent/re-run scenarios if applicable

**Prove it works in the browser.** Fix failures before proceeding.

## Step 6: Verify Against Docs

Re-read relevant docs. Verify alignment with OpenClaw reference, product vision, codebase patterns. Fix misalignment.

## Step 7: PR to Master

1. New branch → commit → `git push -u origin <branch>`
2. `gh pr create` — title <70 chars, body: summary + test plan
3. One PR per feature/fix

## Key Rules

- **Never skip docs** — read `.claude/docs/` for broad context tasks
- **Never skip OpenClaw research** — check the real source before planning
- **Never skip planning** — `EnterPlanMode` for non-trivial work
- **Never skip review** — runs automatically, not optional
- **Never skip runtime validation** — build, run, AND verify in browser with Computer Use
- **Never leave dead code** — reviewer flags it, you remove it
- **Always parallel** — concurrent agents for independent work
- **Track with TodoWrite** — mark progress as you go
- **Never run `pnpm dev`** — kill port 4000 and ask user to run it
- **One PR per feature/fix** to `master`

## Domain Knowledge (auto-loaded by globs when relevant)

- Gateway protocol details → `.claude/docs/gateway-protocol-lessons.md`
- Reconciler lifecycle → `.claude/docs/reconciler-lifecycle-lessons.md`
- Sandbox architecture → `.claude/docs/docker-sandbox-architecture.md`
- AWS ECS EC2 → `.claude/docs/aws-deployment-architecture.md`
- Cloud providers ops → `.claude/docs/cloud-providers.md`
- UX principles → `.claude/docs/ux-dream.md`

## Context Management

- When compacting, ALWAYS preserve: list of modified files, test commands used, current branch, and any error messages being debugged
- `/clear` between unrelated tasks — don't let irrelevant context accumulate
- `/compact Focus on [topic]` for targeted compaction when context is filling
- Use subagents for investigation — they explore in separate context, keeping main window clean
- `/effort max` for architecture decisions and complex debugging, `/effort low` for simple edits

## Self-Improvement Protocol (AUTOMATIC)

Hooks inject learning reminders automatically. When you detect any of these, **write immediately** — don't wait:

- **User correction** → Write to `memory/<topic>.md` with what was wrong and what's right
- **Debugging discovery** → Write to `.claude/docs/<topic>.md` if architectural, `memory/<topic>.md` if operational
- **Non-obvious workaround** → Write to `~/.claude/skills/learned/<topic>.md` as a reusable skill (YAML frontmatter: name, description with trigger conditions)
- **Pattern observed 3+ times** → Write to `~/.claude/instincts/personal/<pattern>.md` (trigger, action, evidence)
- **Configuration insight** → Update `memory/MEMORY.md` with the finding

**Quality gate**: Only capture knowledge that required actual discovery. Skip things that are obvious from reading docs or code.

**Instinct format** (`~/.claude/instincts/personal/<id>.md`):
```yaml
---
id: descriptive-kebab-case
trigger: "when <condition>"
confidence: 0.5
domain: code-style|testing|git|debugging|file-organization|tooling|communication
source: session-observation
date: YYYY-MM-DD
---
# Title
## Action
What to do.
## Evidence
- What was observed and when.
```

When 5+ instincts accumulate in the same domain, run `/evolve` to consolidate them into a skill.

## Maintenance

- Run `/docs` after learning something valuable to capture it for future sessions
- Run `/audit-docs` periodically to check for stale or redundant documentation
