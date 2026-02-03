# Clawster

[![CI](https://github.com/tomer-shavit/clawster/actions/workflows/ci.yml/badge.svg)](https://github.com/tomer-shavit/clawster/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Open-source, self-hosted control plane for managing fleets of OpenClaw instances. Deploy, configure, monitor, and secure hundreds of bots from a single dashboard.

## Why Clawster?

- **Fleet-First**: Manage hundreds of OpenClaw instances as easily as one. Templates, profiles, and overlays eliminate configuration sprawl.
- **OpenClaw-Native**: Built around OpenClaw's real control surfaces -- Gateway protocol, config model, health checks, and diagnostics. Not a generic wrapper.
- **Secure by Default**: Policy Engine blocks unsafe configs. Secrets never stored in plaintext. Audit trail for every change. No public inbound by default.
- **Observable**: Fleet health dashboards, per-bot operational views, end-to-end trace visualization, and cost tracking -- all built in.

## When NOT to Use Clawster

- You only need a single OpenClaw instance and don't need fleet management.
- You want a fully managed SaaS (Clawster is self-hosted).
- You're not using OpenClaw (Clawster is purpose-built for OpenClaw, not a generic bot manager).

## Features

### Core Platform
- **Fleet Management**: Create, manage, and monitor multiple OpenClaw instances
- **Bot Instances**: Full lifecycle management with health tracking
- **Manifest-Driven**: Everything defined as versioned, auditable manifests
- **Template-Based**: Start quickly with built-in templates (Slack Bot, Webhook Bot, Minimal)
- **Configuration Layers**: Profiles for shared defaults, Overlays for per-bot overrides

### Operations & Observability
- **Fleet Health Dashboard**: Executive overview with real-time metrics
  - Total bots, message volume, latency percentiles (p50, p95, p99)
  - Failure rates, cost tracking
  - Health indicators and status cards
- **Per-Bot Operational Dashboard**: Instance detail view with:
  - Status, health, and uptime tracking
  - Deployment events timeline
  - Logs viewer integration
  - Metrics charts (throughput, model calls, tool calls)
- **Trace Viewer**: End-to-end message trace visualization
  - Tool call chains visualization
  - Latency breakdown per operation
  - Input/output inspection
- **Full Observability**: CloudWatch logs, deployment events, health status

### Change Management
- **Change Sets**: Track configuration changes with full history
- **Canary Rollouts**: Gradual rollout with percentage controls
  - ALL, PERCENTAGE, or CANARY strategies
  - Real-time progress tracking
  - Automatic rollback on failure
- **Preview Changes**: See diffs before applying
- **One-Click Rollback**: Revert to previous configuration

### Security & Compliance
- **Secrets Management**: Secrets in AWS Secrets Manager, no plaintext storage
- **Policy Engine**: Enforced rules for security compliance
  - Block unsafe configurations (public admin panels, plaintext secrets)
  - IAM least-privilege validation
- **Audit Logging**: Complete audit trail of all changes
  - Event timeline with filtering
  - Actor, resource, and time-based filters
  - Diff viewer for changes
- **Networking**: No public inbound by default. Optional webhook mode with token validation.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Web UI    │────▶│  NestJS API │────▶│   SQLite    │
│  (Next.js)  │     │             │     │   (Prisma)  │
│  + React    │     │             │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Reconciler │
                    │  Scheduler  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   AWS ECS   │
                    │     EC2     │
                    └─────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@clawster/api` | NestJS REST API -- fleet management, reconciler, audit, traces |
| `@clawster/web` | Next.js dashboard -- health views, config management, trace viewer |
| `@clawster/core` | Shared Zod schemas, TypeScript types, Policy Engine |
| `@clawster/database` | Prisma schema and SQLite client |
| `@clawster/adapters-aws` | AWS ECS, Secrets Manager, CloudWatch integrations |
| `@clawster/cloud-providers` | Multi-cloud deployment providers |
| `@clawster/gateway-client` | OpenClaw Gateway WebSocket client |
| `@clawster/cli` | CLI for bootstrap, auth, and dev workflows |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Docker (optional, for deploying OpenClaw instances)

### Setup

```bash
# Clone and install
git clone https://github.com/tomer-shavit/clawster.git
cd clawster
pnpm install

# Run the setup wizard
pnpm cli setup
```

The setup wizard will:
1. Check prerequisites
2. Create environment configuration (auto-generates JWT secret)
3. Initialize the database
4. Create an admin user
5. Start the development servers
6. Open your browser to http://localhost:3000

For non-interactive setup (CI/scripts):
```bash
pnpm cli setup --non-interactive -u admin -p yourpassword --skip-start --skip-open
```

### Manual Setup (Alternative)

If you prefer manual control:

```bash
# 1. Initialize database
pnpm db:generate
pnpm db:push

# 2. Start servers (in separate terminals)
pnpm --filter @clawster/api dev   # API: http://localhost:4000
pnpm --filter @clawster/web dev   # UI: http://localhost:3000

# Or both at once:
pnpm dev
```

### Bootstrap AWS Infrastructure (Optional)

For cloud deployments:

```bash
pnpm cli init --region us-east-1
```

Visit http://localhost:3000

## Web UI Dashboards

### Fleet Health Dashboard (`/`)
- Executive overview with key metrics
- Fleet status cards with health indicators
- Real-time charts for message volume, latency, error rates
- Fleet listing with quick actions

### Fleet Detail (`/fleets/:id`)
- Fleet overview and configuration
- Health breakdown with progress bars
- Bot instances table
- Throughput charts

### Bot Operational Dashboard (`/bots/:id`)
- Instance status and health
- Uptime, success rate, latency metrics
- Model calls and tool calls charts
- Traces, configuration, and change sets tabs
- Deployment events timeline

### Trace Viewer (`/traces`)
- List all traces with filtering
- Search by trace ID, status, type
- **Trace Detail** (`/traces/:id`):
  - Interactive trace tree visualization
  - Latency breakdown with progress bars
  - Input/output inspection
  - Metadata and tags

### Change Sets (`/changesets`)
- List all configuration changes
- **Change Set Detail** (`/changesets/:id`):
  - Canary rollout controls
  - Progress indicators
  - Diff viewer (before/after)
  - Rollback functionality

### Audit Log (`/audit`)
- Event timeline with date grouping
- Filter by actor, resource type, time range
- Diff summaries
- Direct links to affected resources

## API Endpoints

### Instances
| Endpoint | Description |
|----------|-------------|
| `GET /instances` | List all instances |
| `POST /instances` | Create new instance |
| `GET /instances/:id` | Get instance details |
| `POST /instances/:id/manifests` | Create manifest version |
| `POST /instances/:id/reconcile` | Trigger reconciliation |

### Fleets
| Endpoint | Description |
|----------|-------------|
| `GET /fleets` | List all fleets |
| `POST /fleets` | Create new fleet |
| `GET /fleets/:id` | Get fleet details |
| `GET /fleets/:id/health` | Get fleet health |
| `PATCH /fleets/:id/status` | Update fleet status |

### Bot Instances
| Endpoint | Description |
|----------|-------------|
| `GET /bot-instances` | List all bot instances |
| `GET /bot-instances/:id` | Get bot details |
| `GET /traces/stats/:id` | Get bot metrics |

### Change Sets
| Endpoint | Description |
|----------|-------------|
| `GET /change-sets` | List change sets |
| `POST /change-sets` | Create change set |
| `GET /change-sets/:id` | Get change set details |
| `GET /change-sets/:id/status` | Get rollout status |
| `POST /change-sets/:id/start` | Start rollout |
| `POST /change-sets/:id/rollback` | Rollback change |

### Traces
| Endpoint | Description |
|----------|-------------|
| `GET /traces` | List traces |
| `POST /traces` | Create trace |
| `GET /traces/:id` | Get trace |
| `GET /traces/by-trace-id/:traceId` | Get trace by trace ID |
| `GET /traces/by-trace-id/:traceId/tree` | Get trace tree |

### Audit
| Endpoint | Description |
|----------|-------------|
| `GET /audit` | Query audit events |

## Project Structure

```
clawster/
├── apps/
│   ├── api/                 # NestJS API
│   │   ├── src/
│   │   │   ├── fleets/      # Fleet management
│   │   │   ├── bot-instances/  # Bot lifecycle
│   │   │   ├── change-sets/    # Change management
│   │   │   ├── traces/         # Trace collection
│   │   │   ├── audit/          # Audit logging
│   │   │   └── reconciler/     # Drift detection & sync
│   │   └── ...
│   └── web/                 # Next.js Web UI
│       ├── src/
│       │   ├── app/         # App Router pages
│       │   │   ├── page.tsx            # Fleet Health Dashboard
│       │   │   ├── fleets/             # Fleet pages
│       │   │   ├── bots/               # Bot pages
│       │   │   ├── traces/             # Trace Viewer
│       │   │   ├── changesets/         # Change Set UI
│       │   │   └── audit/              # Audit Log UI
│       │   ├── components/
│       │   │   ├── ui/      # UI components (shadcn/ui style)
│       │   │   ├── dashboard/          # Dashboard components
│       │   │   ├── layout/             # Layout components
│       │   │   └── ...
│       │   └── lib/
│       │       ├── api.ts   # API client
│       │       └── utils.ts # Utilities
│       └── ...
├── packages/
│   ├── core/                # Types, schemas, policy engine
│   ├── database/            # Prisma schema and client
│   ├── adapters-aws/        # AWS ECS, Secrets Manager, CloudWatch
│   └── cli/                 # clawster CLI
└── docker-compose.yml       # Local development stack
```

## Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=file:./dev.db

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_ACCOUNT_ID=123456789

# ECS
ECS_CLUSTER_ARN=arn:aws:ecs:us-east-1:123456789:cluster/clawster
ECS_EXECUTION_ROLE_ARN=arn:aws:iam::123456789:role/ecsTaskExecutionRole
ECS_TASK_ROLE_ARN=arn:aws:iam::123456789:role/ecsTaskRole

# Networking
PRIVATE_SUBNET_IDS=subnet-xxx,subnet-yyy
SECURITY_GROUP_ID=sg-zzz

# Web UI
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Technology Stack

### Backend
- **Framework**: NestJS (Node.js)
- **Database**: SQLite with Prisma ORM
- **API**: REST with OpenAPI/Swagger docs
- **Scheduling**: Built-in cron for reconciliation

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Components**: Custom UI components (shadcn/ui pattern)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Date Handling**: date-fns

### Infrastructure
- **Container Orchestration**: AWS ECS EC2
- **Secrets**: AWS Secrets Manager
- **Logs**: AWS CloudWatch
- **Networking**: VPC with private subnets

## Security

- **Secrets**: Never stored in database, only references. Stored in AWS Secrets Manager.
- **Networking**: No public inbound by default. Optional webhook mode with token validation.
- **IAM**: Least-privilege roles per instance task.
- **Policies**: Block unsafe configurations (public admin panels, plaintext secrets, wildcard IAM).
- **Audit**: Complete audit trail of all changes with actor tracking.

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run specific package tests
pnpm --filter @clawster/core test
pnpm --filter @clawster/api test

# Run E2E tests
pnpm --filter @clawster/web test:e2e
```

### Test Structure

```
packages/core/           # Unit tests with Vitest
├── src/
│   ├── __tests__/       # Test utilities & fixtures
│   ├── *.test.ts        # Unit tests for each module
│   └── vitest.config.ts # Coverage configuration

apps/api/                # Integration tests with Jest
├── src/
│   ├── **/*.spec.ts     # Service unit tests
│   └── jest.config.js   # Jest configuration
├── test/
│   ├── *.e2e-spec.ts    # API integration tests
│   └── setup.ts         # Test setup

apps/web/                # E2E tests with Playwright
├── e2e/
│   ├── *.spec.ts        # E2E test files
│   └── playwright.config.ts
```

### Test Coverage

| Package | Lines | Functions | Branches |
|---------|-------|-----------|----------|
| @clawster/core | 85% | 88% | 78% |
| @clawster/api | 82% | 85% | 75% |
| **Total** | **83%** | **86%** | **76%** |

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to get started.

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to abide by its terms.

## Community

- [GitHub Issues](https://github.com/tomer-shavit/clawster/issues) -- Bug reports and feature requests
- [GitHub Discussions](https://github.com/tomer-shavit/clawster/discussions) -- Questions, ideas, show and tell

## License

MIT
