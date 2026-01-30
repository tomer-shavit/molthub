---
description: "Mandatory development workflow for all Claude Code sessions in Molthub"
globs: []
alwaysApply: true
---

# Molthub Development Workflow

This document defines the **mandatory workflow** that Claude Code must follow for every coding session in this project. No code may be written without completing these steps in order.

---

## Step 0: Read the Docs (MANDATORY — Do This First)

Before writing ANY code, you MUST read all documentation files in `.claude/docs/`:

1. `.claude/docs/molthub-vision.md` — Product vision and platform goals
2. `.claude/docs/molthub-transformation-spec.md` — 10 work-package transformation spec
3. `.claude/docs/current-codebase-analysis.md` — Current architecture and module inventory
4. `.claude/docs/moltbot-reference.md` — Moltbot Gateway, config model, channels, health, security

**Do not skip any doc.** Every feature and bug fix must be informed by these references.

---

## Step 1: Understand the Codebase

After reading docs, explore the relevant parts of the codebase before making changes:

- Use the Explore agent to understand the files and modules related to the task
- Read existing code in the affected areas — never propose changes to code you haven't read
- Identify existing patterns, conventions, and dependencies

---

## Step 2: Plan Before Coding

For every feature or bug fix:

1. Enter plan mode (`EnterPlanMode`) to design the implementation
2. Base the plan on:
   - The feature requirements provided by the user
   - The docs in `.claude/docs/` (especially `moltbot-reference.md` and `molthub-transformation-spec.md`)
   - The existing codebase patterns discovered in Step 1
3. Break the plan into concrete, actionable steps using `TodoWrite`
4. Present the plan to the user for approval before writing any code
5. The plan MUST include an end-to-end testing step — no plan is complete without it

---

## Step 3: Implement Using Parallel Agents

Once the plan is approved:

- Use the `Task` tool with parallel agents to implement independent parts of the plan concurrently
- Track progress with `TodoWrite`, marking each step as `in_progress` → `completed`
- Follow existing codebase conventions (NestJS patterns for API, Next.js for web, Zod for schemas, Prisma for DB)
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

## Step 5: Verify Against Docs and Spec

After implementation and tests pass:

1. Re-read the relevant docs in `.claude/docs/`
2. Re-read the original feature requirements
3. Verify that ALL changes align with:
   - The Moltbot reference documentation (config model, Gateway protocol, channel behavior, security model)
   - The transformation spec (correct work package, correct file locations, correct exports)
   - The product vision (Moltbot-native, not cloud-generic)
4. If any misalignment is found, fix it before proceeding

---

## Step 6: Create PR to Master

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
- **Never skip planning.** Use `EnterPlanMode` for non-trivial work.
- **Never skip tests.** E2E tests are required for completion.
- **Never skip verification.** Re-read docs after implementation.
- **Use parallel agents** when implementing independent plan steps.
- **One PR per feature/fix** pushed to `master` via `gh pr create`.
- **Track everything** with `TodoWrite` for visibility.

---

## Project Structure Reference

```
molthub/
├── apps/
│   ├── api/          # NestJS backend (port 4000)
│   └── web/          # Next.js frontend (port 3000)
├── packages/
│   ├── core/         # Zod schemas, types, PolicyEngine
│   ├── database/     # Prisma + PostgreSQL
│   ├── adapters-aws/ # AWS SDK integrations
│   ├── cloud-providers/ # Deployment providers
│   └── cli/          # CLI tool
└── .claude/
    └── docs/         # Project documentation (READ FIRST)
```

## Tech Stack

- **Backend**: NestJS 10.3, TypeScript, Prisma 5.8, PostgreSQL
- **Frontend**: Next.js 14, Tailwind CSS, shadcn/ui, Recharts
- **Schemas**: Zod for validation
- **Monorepo**: pnpm + Turborepo
- **Auth**: JWT + bcrypt
- **Testing**: Jest (unit/integration), Playwright (E2E)
