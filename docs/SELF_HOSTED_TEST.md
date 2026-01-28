# Self-Hosted End-to-End Test Guide

## What We're Testing

The self-hosted setup allows users to run Moltbots on their local machine using Docker, without needing AWS or any cloud provider.

## Test Scenario: First-Time User Setup

### Step 1: User runs `molthub init`

```bash
$ npx molthub init

🚀 Molthub Bootstrap
Set up cloud infrastructure for your Moltbot fleet

✓ Checking prerequisites...
  ✓ Node.js v20.11.0
  ✓ Docker 24.0.7
  ✓ Docker Compose v2.23.0
  ✓ pnpm 8.15.0

✓ All prerequisites passed

? Select cloud provider: (Use arrow keys)
❯ Amazon Web Services (ECS Fargate) ✓ Ready
  Self-Hosted (Docker) ✓ Ready
  Microsoft Azure (Container Apps) ○ Coming Soon
  Google Cloud (Cloud Run) ○ Coming Soon
  DigitalOcean (App Platform) ○ Coming Soon

# User selects "Self-Hosted (Docker)"

? Select region: (Use arrow keys)
❯ local

? Workspace name: (default) my-bots

? This will create local infrastructure. Continue? (Y/n) Y

✓ Creating data directories... done
✓ Creating docker-compose configuration... done
✓ Created docker-compose.yml

Configuration saved to:
  /home/user/.molthub/my-bots.json

Environment variables saved to:
  /home/user/.molthub/my-bots.env

Next steps:
  1. Source the environment: source /home/user/.molthub/my-bots.env
  2. Create admin user: molthub auth:create-user
  3. Start infrastructure: cd /home/user/.molthub/my-bots && docker-compose up -d
  4. Run migrations: molthub db:migrate
  5. Start the API: molthub dev:api
  6. Open http://localhost:3000
```

### Step 2: User creates admin account

```bash
$ molthub auth:create-user

👤 Create Molthub User

? Username: admin
? Password: [hidden]
? Role: (Use arrow keys)
  Admin - Full access to all resources
  Operator - Can manage bots, read-only on infrastructure
  Viewer - Read-only access

✓ User 'admin' created successfully

User ID: user_1706431200000_abc123
Role: admin

Note: For production, store users in the database instead of local file.
```

### Step 3: User logs in

```bash
$ molthub auth:login

🔐 Molthub Login

? Username: admin
? Password: [hidden]

✓ Login successful

JWT Token:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Use this token in the Authorization header:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Token saved to: /home/user/.molthub/token
```

### Step 4: User starts the infrastructure

```bash
$ cd ~/.molthub/my-bots
$ docker-compose up -d

[+] Running 4/4
 ✔ Network my-bots_default         Created
 ✔ Container my-bots-postgres-1    Started
 ✔ Container my-bots-redis-1       Started
 ✔ Container my-bots-molthub-1     Started
```

### Step 5: User opens the web UI

```bash
$ open http://localhost:3000
```

Web UI loads showing:
- Fleet Health Dashboard
- No bots yet
- Prompt to create first bot

### Step 6: User creates their first bot

Through web UI or API:

```bash
$ curl -X POST http://localhost:4000/api/v1/bot-instances \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-first-bot",
    "templateId": "minimal",
    "config": {
      "image": "ghcr.io/clawdbot/clawdbot:v0.1.0",
      "cpu": 0.5,
      "memory": 512
    }
  }'
```

Response:
```json
{
  "id": "bot_1706431300000_xyz789",
  "name": "my-first-bot",
  "status": "CREATING",
  "provider": "selfhosted",
  "endpoint": "http://localhost:3001"
}
```

### Step 7: Docker container starts

```bash
$ docker ps

CONTAINER ID   IMAGE                                STATUS          PORTS
abc123         ghcr.io/clawdbot/clawdbot:v0.1.0     Up 5 seconds    0.0.0.0:3001->3000/tcp
def456         postgres:16                          Up 10 minutes   5432/tcp
ghi789         redis:7                              Up 10 minutes   6379/tcp
```

### Step 8: User checks bot status

```bash
$ molthub status

🤖 Molthub Status - Workspace: my-bots

Provider: Self-Hosted (Docker)
Region: local
Data Directory: /home/user/.molthub/my-bots

Bots:
  ✓ my-first-bot (RUNNING)
    ID: bot_1706431300000_xyz789
    Endpoint: http://localhost:3001
    Health: HEALTHY
    Uptime: 2 minutes

Infrastructure:
  ✓ PostgreSQL (running)
  ✓ Redis (running)
  ✓ Molthub API (running)
```

### Step 9: User views logs

```bash
$ molthub logs my-first-bot

2024-01-28T09:30:00Z [INFO] Starting Moltbot v0.1.0
2024-01-28T09:30:01Z [INFO] Connected to database
2024-01-28T09:30:02Z [INFO] Server listening on port 3000
2024-01-28T09:30:05Z [INFO] Health check passed
```

### Step 10: User stops the bot

```bash
$ curl -X POST http://localhost:4000/api/v1/bot-instances/bot_1706431300000_xyz789/stop \
  -H "Authorization: Bearer $TOKEN"

✓ Bot 'my-first-bot' stopped
```

### Step 11: User deletes the bot

```bash
$ curl -X DELETE http://localhost:4000/api/v1/bot-instances/bot_1706431300000_xyz789 \
  -H "Authorization: Bearer $TOKEN"

✓ Bot 'my-first-bot' deleted
```

### Step 12: Clean up everything

```bash
$ cd ~/.molthub/my-bots
$ docker-compose down -v

[+] Running 4/4
 ✔ Container my-bots-molthub-1     Removed
 ✔ Container my-bots-postgres-1    Removed
 ✔ Container my-bots-redis-1       Removed
 ✔ Network my-bots_default         Removed
```

## What Gets Created

### Directory Structure
```
~/.molthub/
├── my-bots.json              # Configuration
├── my-bots.env               # Environment variables
├── token                     # JWT token (optional)
├── users.json                # Local users database
└── my-bots/                  # Workspace data
    ├── docker-compose.yml    # Infrastructure definition
    ├── .env                  # Compose environment
    ├── logs/                 # Container logs
    ├── data/                 # Persistent data
    └── secrets/              # Secrets storage
```

### Docker Services
- **postgres**: PostgreSQL database for Molthub
- **redis**: Redis cache
- **molthub**: Molthub API and web UI
- **[bot-name]**: Individual Moltbot containers (created dynamically)

## Key Features Tested

1. ✅ One-command setup (`molthub init`)
2. ✅ Interactive wizard
3. ✅ Prerequisites checking
4. ✅ User authentication
5. ✅ Infrastructure creation (docker-compose)
6. ✅ Bot deployment
7. ✅ Health monitoring
8. ✅ Log streaming
9. ✅ Clean shutdown

## Common Issues & Solutions

### Issue: Port already in use
**Error**: `bind: address already in use`
**Fix**: Change ports in `~/.molthub/my-bots/.env`:
```bash
PORT=4001
POSTGRES_PORT=5433
```

### Issue: Permission denied
**Error**: `Cannot write to data directory`
**Fix**: Fix permissions:
```bash
chmod 755 ~/.molthub/my-bots
```

### Issue: Out of disk space
**Error**: `no space left on device`
**Fix**: Clean up Docker:
```bash
docker system prune -a
```

## Success Criteria

- [ ] User can run `molthub init` without errors
- [ ] Configuration files are created
- [ ] User can create admin account
- [ ] User can login and get JWT token
- [ ] Docker containers start successfully
- [ ] Web UI is accessible at localhost:3000
- [ ] User can create, view, and delete bots
- [ ] Logs are accessible
- [ ] Everything can be cleaned up with `docker-compose down`

## Next Steps

After successful self-hosted test:
1. Test AWS provider (requires AWS account)
2. Add Azure provider implementation
3. Add GCP provider implementation
4. Add DigitalOcean provider implementation
