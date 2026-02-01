# Chunk 2: A2A SendMessage — JSON-RPC Endpoint, Message Service & Test Form UI

## Goal
Add the A2A `SendMessage` JSON-RPC endpoint per the A2A protocol spec. External agents can POST a JSON-RPC request to `POST /a2a/:botInstanceId` to send a message and get a Task response. The bot detail A2A tab gets a "Test Message" form to try it from the UI.

## What You'll Be Able to Test
- `POST /a2a/:botId` with a JSON-RPC `SendMessage` request → bot processes it, returns a Task with the response
- The A2A tab on the bot detail page has a form where you type a message and send it → see the response
- Each message creates a Trace for observability

---

## Architecture

### JSON-RPC Layer
The A2A spec uses JSON-RPC 2.0 over HTTPS. A single POST endpoint handles all methods. For Chunk 2, we only implement `SendMessage`. The controller parses the JSON-RPC envelope, dispatches to the right service method, and wraps the response in JSON-RPC format.

### Task Model
Per A2A spec, `SendMessage` returns a `Task` object with a `status` containing the agent's response. Since our bot calls are synchronous (blocking until the agent completes), we return the task in `completed` state immediately. The task is also stored as a Trace in the DB for later retrieval (Chunk 4).

### Flow
```
Client → POST /a2a/:botId (JSON-RPC)
       → A2aController.handleJsonRpc()
       → A2aMessageService.sendMessage()
       → creates Trace (PENDING)
       → connects to gateway via GatewayManager
       → client.agent({ message, ... })
       → waits for completion
       → updates Trace (SUCCESS/ERROR)
       → returns A2A Task object
```

---

## Files to Create/Modify

### 1. `apps/api/src/a2a/a2a.types.ts` (MODIFY)
Add A2A JSON-RPC and Task types alongside existing Agent Card types:

```ts
// --- JSON-RPC 2.0 ---
interface JsonRpcRequest { jsonrpc: "2.0"; id: string | number; method: string; params?: unknown }
interface JsonRpcResponse { jsonrpc: "2.0"; id: string | number; result?: unknown; error?: JsonRpcError }
interface JsonRpcError { code: number; message: string; data?: unknown }

// --- A2A Message Types ---
interface TextPart { text: string; mediaType?: string }
interface FilePart { url: string; mediaType?: string; filename?: string }
interface DataPart { data: Record<string, unknown>; mediaType?: string }
type Part = TextPart | FilePart | DataPart

interface Message { messageId: string; role: "user" | "agent"; parts: Part[]; contextId?: string; taskId?: string; metadata?: Record<string, unknown> }

interface SendMessageParams { message: Message; configuration?: { acceptedOutputModes?: string[]; blocking?: boolean; historyLength?: number }; metadata?: Record<string, unknown> }

// --- A2A Task Types ---
type TaskState = "submitted" | "working" | "input_required" | "completed" | "failed" | "canceled" | "rejected"
interface TaskStatus { state: TaskState; message?: Message; timestamp?: string }
interface Artifact { artifactId: string; name?: string; parts: Part[]; metadata?: Record<string, unknown> }
interface Task { id: string; contextId: string; status: TaskStatus; artifacts?: Artifact[]; history?: Message[]; metadata?: Record<string, unknown> }
```

### 2. `apps/api/src/a2a/a2a-message.service.ts` (NEW)
New `@Injectable()` service for handling `SendMessage`:

- `sendMessage(botInstanceId: string, params: SendMessageParams): Promise<Task>`
  1. Validate bot exists in DB
  2. Extract text from `params.message.parts` (concatenate TextParts)
  3. Generate `taskId = crypto.randomUUID()`, use `contextId` from message or generate one
  4. Create a Trace: `{ botInstanceId, traceId: taskId, name: "a2a:SendMessage", type: "TASK", status: "PENDING", input: params.message }`
  5. Connect to gateway via `GatewayManager.getClient()`
  6. Call `client.agent({ message: text, idempotencyKey: taskId, agentId: "main", deliver: false, timeout: 60_000, _localTimeoutMs: 65_000 })`
  7. On success: complete Trace, return Task `{ id: taskId, contextId, status: { state: "completed", message: { role: "agent", parts: [{ text: output }] } } }`
  8. On failure: fail Trace, return Task with `state: "failed"`
  9. Disconnect client in finally block

- Uses same gateway connection pattern as `A2aAgentCardService` (GatewayManager pool)
- Injects `TracesService` for trace creation/completion

### 3. `apps/api/src/a2a/a2a.controller.ts` (MODIFY)
Add the JSON-RPC POST endpoint:

```ts
@Post(":botInstanceId")
@Public()  // A2A endpoints are public per spec (auth added in Chunk 3)
async handleJsonRpc(@Param("botInstanceId") botInstanceId: string, @Body() body: JsonRpcRequest) {
  // Validate JSON-RPC envelope
  if (body.jsonrpc !== "2.0" || !body.method || !body.id) {
    return { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  switch (body.method) {
    case "SendMessage":
      const result = await this.messageService.sendMessage(botInstanceId, body.params as SendMessageParams);
      return { jsonrpc: "2.0", id: body.id, result };
    default:
      return { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `Method not found: ${body.method}` } };
  }
}
```

### 4. `apps/api/src/a2a/a2a.module.ts` (MODIFY)
- Add `A2aMessageService` to providers
- Import `TracesModule` (forwardRef if needed)

### 5. `apps/api/src/traces/traces.module.ts` (MODIFY if needed)
- Ensure `TracesService` is exported so `A2aModule` can import it

### 6. `apps/web/src/lib/api.ts` (MODIFY)
Add types and method:

```ts
interface A2aTask { id: string; contextId: string; status: { state: string; message?: { role: string; parts: { text?: string }[] }; timestamp?: string }; artifacts?: unknown[] }
interface A2aSendResult { jsonrpc: "2.0"; id: string; result?: A2aTask; error?: { code: number; message: string } }

async sendA2aMessage(botInstanceId: string, message: string): Promise<A2aSendResult>
```

### 7. `apps/web/src/app/bots/[id]/bot-detail-client.tsx` (MODIFY)
Add a "Test Message" card below existing Agent Card display in A2A tab:
- Text input + Send button
- On send: calls `api.sendA2aMessage(bot.id, message)`
- Shows loading spinner while waiting
- Displays the response (task state, agent message, task ID)
- Shows error if failed

---

## Parallelism Plan

**Wave 1** (fully parallel — no dependencies):
1. **Agent A**: `a2a.types.ts` — add all JSON-RPC + Task types
2. **Agent B**: `a2a-message.service.ts` — create the new service
3. **Agent C**: `apps/web/src/lib/api.ts` + `bot-detail-client.tsx` — frontend types + test form UI

**Wave 2** (depends on Wave 1):
4. **Agent D**: `a2a.controller.ts` + `a2a.module.ts` + `traces.module.ts` — wire everything together

**Wave 3**: Build + test

---

## Verification
1. `pnpm build` passes
2. `curl -X POST http://localhost:4000/a2a/<bot-id> -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":"1","method":"SendMessage","params":{"message":{"messageId":"test-1","role":"user","parts":[{"text":"Hello, who are you?"}]}}}'` → returns JSON-RPC response with Task
3. Bot detail → A2A tab → type message → send → see response
4. Traces page shows the A2A task trace
5. Invalid method → returns JSON-RPC error `-32601`
6. Missing bot → returns JSON-RPC error with appropriate message
