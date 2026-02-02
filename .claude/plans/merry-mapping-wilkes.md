# Bot Team Configuration — "Give Bots the Ability to Call Other Bots"

## Goal

Let users configure bot-to-bot relationships in Clawster's UI so that Bot A (team lead) can autonomously delegate tasks to Bot B (marketing expert), Bot C (DevOps), etc. during its reasoning. The bot itself decides when to delegate — not Clawster.

## How It Works (End-to-End)

```
1. User configures in Clawster UI:
   "Bot A can delegate to Bot B (Marketing Expert) and Bot C (DevOps)"

2. Clawster generates a delegation skill for Bot A:
   - SKILL.md with team member descriptions + delegation instructions
   - delegate.js script that calls Clawster's API

3. On next reconcile, Clawster writes these files to Bot A's workspace
   and updates Bot A's OpenClaw config to load the skill

4. Bot A now has team knowledge in its context + a delegation tool

5. User chats with Bot A: "Create a marketing campaign for our new product"
   → Bot A reasons: "This is a marketing task, I should delegate to Bot B"
   → Bot A runs: node delegate.js "Bot B" "Create a marketing campaign..."
   → delegate.js POSTs to Clawster API → A2aMessageService → Bot B
   → Bot B responds → response flows back to Bot A
   → Bot A incorporates the response and replies to user
```

---

## Architecture

### Why This Approach

- **Bot decides** — The LLM reasons about when to delegate (not regex pattern matching)
- **Uses existing A2A** — Delegation flows through `A2aMessageService` we already built
- **OpenClaw-native** — Uses OpenClaw's skill system (SKILL.md) + exec tools (group:runtime)
- **No MCP server needed** — A simple Node.js script handles the HTTP call to Clawster
- **Traceable** — Every delegation creates traces via the existing A2A trace hierarchy

### Components

1. **Database**: `BotTeamMember` model (who can delegate to whom + role metadata)
2. **API**: CRUD for team members + `POST /bot-delegation/invoke` endpoint for bots
3. **Delegation Skill Generator**: Creates SKILL.md + delegate.js per bot
4. **Config Injection**: Adds skill directory + enables runtime tools during reconciliation
5. **UI**: "Team" tab on bot detail page

---

## Files to Create/Modify

### 1. `packages/database/prisma/schema.prisma` (MODIFY)

Add new model:

```prisma
model BotTeamMember {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  // The bot that can delegate (the "team lead")
  ownerBotId  String
  ownerBot    BotInstance @relation("TeamOwner", fields: [ownerBotId], references: [id], onDelete: Cascade)

  // The bot that receives delegated tasks (the "team member")
  memberBotId String
  memberBot   BotInstance @relation("TeamMember", fields: [memberBotId], references: [id], onDelete: Cascade)

  // What this team member does
  role        String    // e.g. "Marketing Expert", "DevOps Engineer"
  description String    // e.g. "Handles marketing strategy, content creation, campaigns"

  enabled     Boolean   @default(true)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([ownerBotId, memberBotId])
  @@index([ownerBotId])
  @@index([memberBotId])
}
```

Add relations to `BotInstance`:
```prisma
  teamMembers    BotTeamMember[] @relation("TeamOwner")
  memberOfTeams  BotTeamMember[] @relation("TeamMember")
```

Add relation to `Workspace`:
```prisma
  teamMembers    BotTeamMember[]
```

### 2. `apps/api/src/bot-teams/bot-teams.service.ts` (NEW)

CRUD service for `BotTeamMember`:
- `create(ownerBotId, memberBotId, role, description)` — validates both bots exist and belong to same workspace
- `findByOwner(ownerBotId)` — list all team members for a bot
- `findByMember(memberBotId)` — list all teams a bot belongs to
- `update(id, { role?, description?, enabled? })`
- `remove(id)`

### 3. `apps/api/src/bot-teams/bot-teams.controller.ts` (NEW)

REST endpoints:
- `GET /bot-teams/:botId` — list team members
- `POST /bot-teams/:botId/members` — add team member
- `PATCH /bot-teams/members/:id` — update member
- `DELETE /bot-teams/members/:id` — remove member

### 4. `apps/api/src/bot-teams/bot-teams.module.ts` (NEW)

NestJS module importing `TracesModule`, `A2aModule`.

### 5. `apps/api/src/bot-teams/delegation-skill-generator.service.ts` (NEW)

Generates the delegation skill files for a bot based on its team members:

**`generateSkillFiles(bot, teamMembers, apiUrl, apiKey)`** returns:

- **`SKILL.md`** — Markdown file with YAML frontmatter:
  ```markdown
  ---
  name: clawster-delegation
  description: Delegate tasks to your team members
  ---

  ## Your Team

  You have the following team members who can help with specialized tasks:

  ### Bot B — Marketing Expert
  Handles marketing strategy, content creation, campaigns.

  ### Bot C — DevOps Engineer
  Handles infrastructure, deployments, monitoring.

  ## How to Delegate

  When a task falls outside your expertise or matches a team member's specialty,
  delegate it by running this command:

  ```bash
  node /path/to/skills/clawster-delegation/delegate.js "<team member name>" "<task description>"
  ```

  The command will send the task to the team member and return their response.
  Wait for the response before continuing.

  ## Guidelines
  - Delegate when a task clearly matches a team member's specialty
  - Provide clear, specific task descriptions
  - You can delegate to multiple team members for different parts of a complex task
  - Incorporate the team member's response into your own response to the user
  ```

- **`delegate.js`** — Node.js script (~50 lines):
  ```js
  // Reads target bot name + message from argv
  // POSTs to CLAWSTER_API_URL/bot-delegation/invoke
  // Uses CLAWSTER_API_KEY for auth
  // Prints the response text to stdout
  // Exits with error code on failure
  ```

### 6. `apps/api/src/bot-delegation/bot-delegation.controller.ts` (MODIFY existing or NEW)

Add the invoke endpoint that bots call:

```
POST /bot-delegation/invoke
Authorization: Bearer <api-key>
Body: { sourceBotId, targetBotName, message }
```

- Authenticates using the bot's A2A API key
- Looks up target bot by name within the workspace
- Validates the team relationship exists (owner → member)
- Calls `A2aMessageService.sendMessage()` to send to target bot
- Creates a delegation trace (parent) with A2A child trace
- Returns `{ success, response, traceId }`

### 7. `apps/api/src/reconciler/config-generator.service.ts` (MODIFY)

When generating config for a bot that has team members:

1. Query `BotTeamMember` records for the bot
2. If any exist, call `DelegationSkillGenerator.generateSkillFiles()`
3. Add `group:runtime` to `tools.allow` (needed for `exec` to run the delegate script)
4. Add the delegation skill directory to `skills.load.extraDirs`
5. Set env vars in the skill config: `CLAWSTER_API_URL`, `CLAWSTER_API_KEY`, `CLAWSTER_BOT_ID`

### 8. `apps/api/src/reconciler/lifecycle-manager.service.ts` (MODIFY)

During provision/update, write the delegation skill files to the bot's workspace:
- Create `<workspace>/skills/clawster-delegation/` directory
- Write `SKILL.md` and `delegate.js`
- These files are regenerated on every reconcile (so team changes take effect)

### 9. `apps/web/src/lib/api.ts` (MODIFY)

Add API methods:
```ts
listTeamMembers(botId: string): Promise<BotTeamMember[]>
addTeamMember(botId: string, data: { memberBotId, role, description }): Promise<BotTeamMember>
updateTeamMember(id: string, data: Partial<{ role, description, enabled }>): Promise<BotTeamMember>
removeTeamMember(id: string): Promise<void>
```

### 10. `apps/web/src/app/bots/[id]/bot-detail-client.tsx` (MODIFY)

Add a "Team" tab to the bot detail page:

- **Team Members List**: Cards showing each team member with role, description, enabled toggle
- **Add Member**: Button opens a form — select bot from dropdown, enter role + description
- **Edit**: Inline edit role/description
- **Remove**: Delete with confirmation
- **Empty State**: "No team members configured. Add bots to this team to enable delegation."

### 11. `apps/api/src/app.module.ts` (MODIFY)

Import `BotTeamsModule`.

---

## Implementation Steps

### Step 1: Database + API (backend)
1. Add `BotTeamMember` model to Prisma schema
2. Run migration
3. Create `bot-teams` module with service, controller, DTOs
4. Add delegation invoke endpoint
5. Wire into `app.module.ts`

### Step 2: Delegation Skill Generator (backend)
1. Create `DelegationSkillGeneratorService`
2. Generates SKILL.md content from team member data
3. Generates delegate.js script (hardcoded template with env var placeholders)

### Step 3: Config Injection (backend)
1. Modify `ConfigGeneratorService` to inject delegation skill config
2. Modify `LifecycleManagerService` to write skill files to workspace

### Step 4: Frontend (parallel with Steps 2-3)
1. Add API methods to `api.ts`
2. Add "Team" tab to bot detail page
3. CRUD UI for team members

### Step 5: Build + Verify
1. `pnpm build` passes
2. Add team member via UI
3. Verify delegation skill files are generated
4. Test delegation via bot chat

---

## Key Design Decisions

1. **New model, not routing rules** — `BotTeamMember` is conceptually different from `BotRoutingRule`. Routing rules are a switchboard (Clawster decides). Team members are tools (the bot decides). Keeping them separate avoids confusion.

2. **delegate.js script over MCP server** — A simple Node.js script that the agent runs via `exec` is far simpler than setting up a full MCP server. The agent calls `node delegate.js "Bot B" "do this task"` and gets the response on stdout. Can upgrade to MCP later if needed.

3. **Skill-based injection** — Using OpenClaw's native skill system (SKILL.md in a skills directory) is the cleanest integration point. The skill instructions become part of the agent's context, so it knows about its team without any custom tool UI.

4. **group:runtime required** — The agent needs `exec` tools to run the delegate script. This is automatically added to the config when team members are configured.

5. **Auth via A2A API key** — The delegate script authenticates to Clawster using the bot's existing A2A API key. No new auth mechanism needed.

---

## Verification

1. `pnpm build` passes
2. Create two bots (Bot A, Bot B) via the UI
3. On Bot A's detail page → "Team" tab → Add Bot B as "Marketing Expert"
4. Verify Bot A's OpenClaw config now includes:
   - `skills.load.extraDirs` pointing to delegation skill directory
   - `tools.allow` includes `group:runtime`
5. Check Bot A's workspace has `skills/clawster-delegation/SKILL.md` and `delegate.js`
6. Chat with Bot A about a marketing topic → Bot A delegates to Bot B → response comes back
7. Check traces → delegation trace with A2A child trace visible
8. Remove Bot B from team → verify skill files are cleaned up on next reconcile
