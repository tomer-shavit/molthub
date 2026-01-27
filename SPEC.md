# Molthub MVP Specification

## Product Goal
Molthub is a self-hosted control plane to create and operate multiple Moltbot instances in the cloud with a seamless UX.

**Seamless means:**
- You install Molthub
- You connect AWS creds
- You click "Create Moltbot"
- It provisions infra, deploys Moltbot securely, injects secrets, and gives you a working instance you can configure and operate from one place

## Non-goals for MVP
- No multi-cloud
- No Kubernetes
- No marketplace for skills
- No "agents that directly mutate AWS". Agents can propose changes to a manifest. The reconciler applies changes only after policy validation.

## Core Principles

1) **Manifest is the source of truth**
   - Every instance has a single typed "Instance Manifest"
   - The UI edits it
   - The API validates it
   - A reconciler applies it

2) **Batteries included, replaceable**
   - Ship one opinionated path that works: AWS + ECS Fargate + Secrets Manager + CloudWatch
   - Also define interfaces so people can later swap providers

3) **Secure defaults, explicit unsafe overrides**
   - Default posture should prevent the classic "public admin panel with secrets" failure mode
   - If the user chooses an insecure option, make it loud and deliberate

## MVP Capabilities

### A) Fleet management
- Create, list, rename, tag, pause, restart, delete Moltbot instances
- Group instances by workspace and environment (dev, staging, prod)

### B) Instance configuration
Configure per instance:
- Moltbot version or Docker image tag
- Model provider config (as secret references)
- Channel adapters config (Slack webhook, etc) as secret references
- Skills policy. Allowlist only. Remote skill install off by default
- Outbound network policy. Default "egress restricted" preset
- Template-based creation. "Slack bot template", "Webhook bot template"

### C) Secure deployment on AWS

**Default reference implementation:**
- Shared VPC + ECS cluster per workspace environment
- One ECS service per Moltbot instance
- Secrets stored in AWS Secrets Manager. Injected as env vars at runtime
- Logs to CloudWatch log group per instance
- IAM least privilege roles per instance task
- No public inbound by default

**Optional for MVP, but define clearly:**
- "Webhook enabled" mode that creates a public HTTPS endpoint for inbound events
- Put it behind ALB with TLS and strict routing
- Require a signed token header. Reject otherwise. Rate limit. Basic WAF optional

### D) Observability
- Instance health status. Running or degraded or down
- Recent logs viewer link. Prefer to deep link into CloudWatch
- Deployment events timeline. Reconciler actions, ECS rollouts, failures

### E) Audit and safety
- Audit log for all changes. Who changed what, when
- Idempotent API. Retry safe
- Drift detection. Compare desired manifest to actual deployed status

## Architecture

### Repo structure
Use a monorepo. Turborepo or pnpm workspaces.

```
apps/web - Next.js App Router UI. Tailwind. shadcn/ui
apps/api - NestJS API service
packages/core - Types, Zod schemas, manifest model, policy engine
packages/adapters-aws - AWS provider. CDK helpers. ECS deploy logic
packages/cli - molthub CLI. Bootstrap and diagnostics
packages/ui - Shared UI components. shadcn wrappers
infra/cdk - Optional. Base infra stacks
```

### Runtime components
- Web UI
- API
- Reconciler worker (Can run inside API process in MVP, but separate module)

### Persistence
- Postgres. Prisma
- Tables: workspaces, users, instances, manifests (versioned), deployments, audit_events, templates

### Auth
MVP options:
- Auth.js with GitHub OAuth plus "local admin" bootstrap mode
- Or Clerk for speed, but less OSS friendly

Minimum RBAC: OWNER, ADMIN, OPERATOR, VIEWER

### Data model

**Instance**
- id, workspace_id, name, environment, tags, created_at
- desired_manifest_id (latest)
- status: CREATING|RUNNING|DEGRADED|STOPPED|DELETING
- last_reconcile_at, last_error

**Manifest versioning**
- manifest_id, instance_id, version, content_json, created_by, created_at
- Always append-only. Never mutate old versions

**Audit event**
- actor, action, resource_type, resource_id, diff_summary, timestamp

### Instance Manifest schema (TypeScript + Zod)

Minimum fields:
```typescript
apiVersion: "molthub/v1"
kind: "MoltbotInstance"
metadata: {
  name, workspace, environment, labels
}
spec: {
  runtime: {
    image: "ghcr.io/.../moltbot:<tag>" or user override
    cpu, memory
    replicas: default 1
    command: optional
  }
  secrets: list of SecretRef objects (Name, provider, key path)
  channels: slack, telegram, webhook blocks. Each references secrets
  skills: {
    mode: "ALLOWLIST"
    allowlist: array of skill ids
  }
  network: {
    inbound: "NONE"|"WEBHOOK"
    egressPreset: "RESTRICTED"|"DEFAULT"
  }
  observability: {
    logLevel
    tracing: optional
  }
  policies: {
    forbidPublicAdmin: default true
    requireSecretManager: default true
  }
}
```

## AWS Reference Adapter

### Base infra
Created once per workspace environment via CLI:
- VPC with private subnets
- ECS cluster
- NAT gateway optional (run without if possible)
- IAM roles for Molthub reconciler to create ECS services, manage Secrets Manager, write logs

### Per instance resources
- ECS task definition
- ECS service
- Security group
- CloudWatch log group
- IAM task role with least privilege
- Secrets Manager entries created or linked

### Deployment strategy
- Rolling update with health checks
- Automatic rollback if new deployment fails

## API Surface (MVP)

### Instances
- POST /instances - Create from template + overrides
- GET /instances - List
- GET /instances/:id - Detail + status
- POST /instances/:id/actions/restart
- POST /instances/:id/actions/stop
- DELETE /instances/:id

### Manifests
- GET /instances/:id/manifests - Versions
- POST /instances/:id/manifests - Create new version. Validates with Zod and policy engine
- POST /instances/:id/reconcile - Trigger reconcile

### Templates
- GET /templates
- POST /templates - Admin only

### Audit
- GET /audit - Filter by instance, actor, time

## UI Pages (MVP)

### Instances list
- Status pill, last reconcile, environment, tags
- "Create instance" button

### Create wizard
1. Pick template
2. Name and environment
3. Channel setup step. Secrets are entered and stored in Secrets Manager
4. Review. Show generated manifest diff. Confirm

### Instance detail
- Overview: Status, image tag, last deploy
- Config: View manifest. Edit creates new version
- Actions: Restart, Stop, Delete
- Logs: Link to CloudWatch. Show last N lines via API optional
- Audit timeline

### Templates
- View templates and what they enable
- Import or export

## Security Requirements

### Default posture
- No public inbound endpoints
- Secrets never stored in Molthub DB. Only references
- Secrets only enter via: UI to API → Secrets Manager immediately. Or "bring existing secret ARN"

### Guardrails
- Block manifests that expose admin panels publicly
- Block plaintext secrets in manifest
- Block wildcard IAM in task roles

### Supply chain basics
- Pin Moltbot image tags. No "latest"
- Emit SBOM for Molthub images
- Document safe upgrade path

## Reconciler Behavior

1. Input: instance id
2. Load desired manifest
3. Validate again
4. Apply policy checks
5. Calculate plan: "Create/update ECS service", "Update task definition", "Ensure secrets exist"
6. Execute plan idempotently
7. Write deployment events and audit entries
8. Update instance status

## Build Order (Minimal Path That Ships)

1. Monorepo skeleton + core types + manifest Zod schema
2. API with auth + Postgres + Prisma models
3. Instances CRUD + manifest versioning + audit
4. AWS adapter. Base infra bootstrap via CLI
5. Reconciler that deploys one ECS service per instance
6. Web UI. List, create wizard, instance detail
7. Secrets Manager integration + strict guardrails
8. Logs deep links + health status
