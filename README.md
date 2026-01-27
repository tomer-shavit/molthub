# Molthub

Self-hosted control plane for Moltbot instances. Deploy and manage multiple Moltbot instances on AWS ECS Fargate with a seamless web UI.

## Features

- **Fleet Management**: Create, manage, and monitor multiple Moltbot instances
- **Manifest-Driven**: Everything defined as versioned, auditable manifests
- **Secure by Default**: Secrets in AWS Secrets Manager, no public admin panels, least-privilege IAM
- **Template-Based**: Start quickly with built-in templates (Slack Bot, Webhook Bot, Minimal)
- **Full Observability**: CloudWatch logs, deployment events, health status
- **Audit Trail**: Complete audit log of all changes

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Web UI    │────▶│  NestJS API │────▶│  PostgreSQL │
│  (Next.js)  │     │             │     │   (Prisma)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Reconciler │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   AWS ECS   │
                    │   Fargate   │
                    └─────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- AWS CLI configured
- Docker (for local development)

### 1. Clone and Install

```bash
git clone https://github.com/tomer-shavit/molthub.git
cd molthub
pnpm install
```

### 2. Set up Database

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Run migrations
pnpm db:push
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your AWS credentials and settings
```

### 4. Bootstrap AWS Infrastructure

```bash
pnpm cli bootstrap --region us-east-1
```

### 5. Start Development

```bash
# Start API and Web UI
pnpm dev
```

Visit http://localhost:3000

## Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/molthub

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_ACCOUNT_ID=123456789

# ECS
ECS_CLUSTER_ARN=arn:aws:ecs:us-east-1:123456789:cluster/molthub
ECS_EXECUTION_ROLE_ARN=arn:aws:iam::123456789:role/ecsTaskExecutionRole
ECS_TASK_ROLE_ARN=arn:aws:iam::123456789:role/ecsTaskRole

# Networking
PRIVATE_SUBNET_IDS=subnet-xxx,subnet-yyy
SECURITY_GROUP_ID=sg-zzz
```

## Project Structure

```
molthub/
├── apps/
│   ├── api/              # NestJS API
│   └── web/              # Next.js Web UI
├── packages/
│   ├── core/             # Types, schemas, policy engine
│   ├── database/         # Prisma schema and client
│   ├── adapters-aws/     # AWS ECS, Secrets Manager, CloudWatch
│   └── cli/              # molthub CLI
└── docker-compose.yml    # Local development stack
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /instances` | List all instances |
| `POST /instances` | Create new instance |
| `GET /instances/:id` | Get instance details |
| `POST /instances/:id/manifests` | Create manifest version |
| `POST /instances/:id/reconcile` | Trigger reconciliation |
| `GET /templates` | List templates |
| `GET /audit` | Query audit events |

## Security

- **Secrets**: Never stored in database, only references. Stored in AWS Secrets Manager.
- **Networking**: No public inbound by default. Optional webhook mode with token validation.
- **IAM**: Least-privilege roles per instance task.
- **Policies**: Block unsafe configurations (public admin panels, plaintext secrets, wildcard IAM).

## License

MIT
