# SkillPacks - Reusable Skill/MCP Configurations

## Overview

SkillPacks allow you to define a set of **skills** and **MCP servers** once, and apply them to **multiple Moltbots** seamlessly.

## Use Cases

### 1. Standard Development Stack
Define once, use everywhere:
```json
{
  "name": "Standard Dev Stack",
  "skills": ["git", "docker", "postgres"],
  "mcps": [
    {
      "name": "github",
      "command": "npx -y @modelcontextprotocol/server-github"
    },
    {
      "name": "postgres",
      "command": "npx -y @modelcontextprotocol/server-postgres"
    }
  ],
  "envVars": {
    "GITHUB_TOKEN": "${secrets.github_token}",
    "DATABASE_URL": "${secrets.database_url}"
  }
}
```

Attach to 50 bots instantly. Update the pack → all 50 bots get the update.

### 2. Team-Specific Tooling
```json
{
  "name": "Platform Team Stack",
  "skills": ["kubernetes", "terraform", "aws"],
  "mcps": [
    {
      "name": "kubernetes",
      "command": "npx -y @modelcontextprotocol/server-kubernetes"
    }
  ]
}
```

### 3. Environment-Specific Packs
- `production-monitoring` (Datadog, PagerDuty MCPs)
- `security-scanning` (SonarQube, Snyk skills)
- `analytics-stack` (Segment, Mixpanel MCPs)

## API Endpoints

### Create a SkillPack
```bash
POST /api/v1/skill-packs
{
  "name": "Standard Dev Stack",
  "description": "Git, Docker, Postgres with MCPs",
  "skills": ["git", "docker", "postgres"],
  "mcps": [
    {
      "name": "github",
      "command": "npx -y @modelcontextprotocol/server-github"
    }
  ],
  "envVars": {
    "GITHUB_TOKEN": "${secrets.github_token}"
  }
}
```

### Attach to Single Bot
```bash
POST /api/v1/skill-packs/:id/attach
{
  "botInstanceId": "bot-123",
  "envOverrides": {
    "GITHUB_TOKEN": "bot-specific-token"
  }
}
```

### Bulk Attach to Multiple Bots
```bash
POST /api/v1/skill-packs/:id/attach-bulk
{
  "botInstanceIds": ["bot-1", "bot-2", "bot-3", "bot-4", "bot-5"],
  "envOverrides": {}
}
```

Response:
```json
{
  "successful": ["bot-1", "bot-2", "bot-3"],
  "failed": [
    { "botId": "bot-4", "error": "Already attached" },
    { "botId": "bot-5", "error": "Bot not found" }
  ]
}
```

### Sync Pack to All Attached Bots
```bash
POST /api/v1/skill-packs/:id/sync
```

Triggers configuration update for all bots using this pack.

### Get All Bots with Pack
```bash
GET /api/v1/skill-packs/:id/bots
```

Returns list of bots with their attachment metadata.

## Data Model

### SkillPack
```typescript
{
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  
  // Configuration
  skills: Array<{
    name: string;
    version?: string;
    config?: object;
  }>;
  
  mcps: Array<{
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
  
  envVars: Record<string, string>;
  
  // Metadata
  isBuiltin: boolean;
  version: number;  // Incremented on each update
  createdAt: Date;
  updatedAt: Date;
}
```

### BotInstanceSkillPack (Junction)
```typescript
{
  id: string;
  botInstanceId: string;
  skillPackId: string;
  envOverrides: Record<string, string>;  // Bot-specific overrides
  attachedAt: Date;
}
```

## Configuration Resolution

When a bot starts, configurations are resolved in this order:

1. **SkillPack defaults** (lowest priority)
2. **Profile configuration**
3. **Overlay overrides**
4. **Bot-specific envOverrides** (highest priority)

Example:
```javascript
// SkillPack defines:
{ "envVars": { "LOG_LEVEL": "info", "API_KEY": "default" } }

// Bot attachment overrides:
{ "envOverrides": { "LOG_LEVEL": "debug" } }

// Final config:
{ "LOG_LEVEL": "debug", "API_KEY": "default" }
```

## CLI Commands (Future)

```bash
# Create a SkillPack
molthub skill-packs create --name "Dev Stack" --skills git,docker

# Attach to bot
molthub skill-packs attach <pack-id> --bot <bot-id>

# Attach to multiple bots
molthub skill-packs attach <pack-id> --bots bot-1,bot-2,bot-3

# Sync updates to all bots
molthub skill-packs sync <pack-id>

# List bots using a pack
molthub skill-packs bots <pack-id>

# Detach from bot
molthub skill-packs detach <pack-id> --bot <bot-id>
```

## Best Practices

1. **Version Control**: SkillPacks version automatically on update. Bots track which version they're using.

2. **Secrets**: Store sensitive values as `${secrets.XXX}` and let bots resolve from their secret store.

3. **Environment Overrides**: Use `envOverrides` for bot-specific values (e.g., different GitHub tokens per bot).

4. **Built-in Packs**: Molthub can provide built-in packs (e.g., `standard-dev`, `security-scanning`).

5. **Testing**: Create a `test-skill-pack` with mock MCPs for testing before production.

## Example Workflow

1. **Create Pack**:
   ```bash
   curl -X POST /skill-packs \
     -d '{"name": "Production Monitoring", "mcps": [...]}'
   ```

2. **Attach to Fleet**:
   ```bash
   # Get all bots in fleet
   curl /fleets/prod/bots
   
   # Attach pack to all
   curl -X POST /skill-packs/:id/attach-bulk \
     -d '{"botInstanceIds": ["bot-1", "bot-2", ...]}'
   ```

3. **Update Pack**:
   ```bash
   curl -X PATCH /skill-packs/:id \
     -d '{"mcps": [...updated...]}'
   ```

4. **Sync to All Bots**:
   ```bash
   curl -X POST /skill-packs/:id/sync
   ```

5. **Verify**:
   ```bash
   curl /skill-packs/:id/bots
   ```

## Migration from Direct Configuration

If bots currently have skills/MCPs defined directly in their manifest:

1. Create a SkillPack with those configurations
2. Attach the pack to the bots
3. Remove direct configuration from manifests
4. Future updates go through the pack

## Future Enhancements

- [ ] Pack inheritance (base pack + extensions)
- [ ] Conditional packs (apply based on labels/tags)
- [ ] Pack marketplace (share community packs)
- [ ] Pack templates (quick-start configurations)
- [ ] Drift detection (alert when bot config differs from pack)
