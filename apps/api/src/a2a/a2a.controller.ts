import { Controller, Get, Post, Delete, Param, Body, Logger, UseGuards, NotFoundException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";
import { A2aAgentCardService } from "./a2a-agent-card.service";
import { A2aMessageService } from "./a2a-message.service";
import { A2aApiKeyService } from "./a2a-api-key.service";
import { A2aTaskService } from "./a2a-task.service";
import { A2aApiKeyGuard } from "./a2a-api-key.guard";
import type { JsonRpcRequest, JsonRpcResponse, SendMessageParams, TaskGetParams } from "./a2a.types";

@ApiTags("a2a")
@Controller("a2a")
export class A2aController {
  private readonly logger = new Logger(A2aController.name);

  constructor(
    private readonly agentCardService: A2aAgentCardService,
    private readonly messageService: A2aMessageService,
    private readonly apiKeyService: A2aApiKeyService,
    private readonly taskService: A2aTaskService,
  ) {}

  // ---- Public discovery endpoints (no auth) ----

  @Get(":botInstanceId/agent-card")
  @Public()
  @ApiOperation({ summary: "Get A2A Agent Card for a bot instance" })
  @ApiParam({ name: "botInstanceId", description: "Bot instance ID" })
  async getAgentCard(@Param("botInstanceId") botInstanceId: string) {
    return this.agentCardService.generate(botInstanceId);
  }

  @Get(":botInstanceId/.well-known/agent")
  @Public()
  @ApiOperation({ summary: "A2A spec discovery endpoint (alias for agent-card)" })
  @ApiParam({ name: "botInstanceId", description: "Bot instance ID" })
  async getWellKnownAgent(@Param("botInstanceId") botInstanceId: string) {
    return this.agentCardService.generate(botInstanceId);
  }

  // ---- A2A JSON-RPC endpoint (requires API key) ----

  @Post(":botInstanceId")
  @Public()
  @UseGuards(A2aApiKeyGuard)
  @ApiOperation({ summary: "A2A JSON-RPC 2.0 endpoint" })
  @ApiParam({ name: "botInstanceId", description: "Bot instance ID" })
  async handleJsonRpc(
    @Param("botInstanceId") botInstanceId: string,
    @Body() body: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    // Validate JSON-RPC envelope
    if (body.jsonrpc !== "2.0" || !body.method || body.id === undefined) {
      return {
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: { code: -32600, message: "Invalid Request: missing jsonrpc, method, or id" },
      };
    }

    this.logger.log(`A2A JSON-RPC: ${body.method} for bot ${botInstanceId}`);

    switch (body.method) {
      case "SendMessage": {
        const params = body.params as SendMessageParams | undefined;
        if (
          !params?.message?.parts ||
          !Array.isArray(params.message.parts) ||
          !params.message.messageId ||
          !params.message.role
        ) {
          return {
            jsonrpc: "2.0",
            id: body.id,
            error: {
              code: -32602,
              message: "Invalid params: message with messageId, role, and parts[] is required",
            },
          };
        }
        try {
          const result = await this.messageService.sendMessage(
            botInstanceId,
            params,
          );
          return { jsonrpc: "2.0", id: body.id, result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32000, message },
          };
        }
      }

      case "tasks/get": {
        const params = body.params as TaskGetParams | undefined;
        if (!params?.id) {
          return {
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32602, message: "Invalid params: id is required" },
          };
        }
        try {
          const task = await this.taskService.getTask(botInstanceId, params.id, params.historyLength);
          return { jsonrpc: "2.0", id: body.id, result: task };
        } catch (err) {
          if (err instanceof NotFoundException) {
            return { jsonrpc: "2.0", id: body.id, error: { code: -32001, message: "Task not found" } };
          }
          const message = err instanceof Error ? err.message : String(err);
          return { jsonrpc: "2.0", id: body.id, error: { code: -32000, message } };
        }
      }

      default:
        return {
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32601, message: `Method not found: ${body.method}` },
        };
    }
  }

  // ---- Task listing (requires user JWT auth) ----

  @Get(":botInstanceId/tasks")
  @ApiOperation({ summary: "List A2A tasks for a bot instance" })
  @ApiParam({ name: "botInstanceId", description: "Bot instance ID" })
  async listTasks(@Param("botInstanceId") botInstanceId: string) {
    return this.taskService.listTasks(botInstanceId);
  }

  // ---- API key management (requires user JWT auth) ----

  @Post(":botInstanceId/api-keys")
  @ApiOperation({ summary: "Generate a new A2A API key for a bot instance" })
  @ApiParam({ name: "botInstanceId", description: "Bot instance ID" })
  async generateApiKey(
    @Param("botInstanceId") botInstanceId: string,
    @Body() body: { label?: string },
  ) {
    return this.apiKeyService.generate(botInstanceId, body?.label);
  }

  @Get(":botInstanceId/api-keys")
  @ApiOperation({ summary: "List A2A API keys for a bot instance" })
  @ApiParam({ name: "botInstanceId", description: "Bot instance ID" })
  async listApiKeys(@Param("botInstanceId") botInstanceId: string) {
    return this.apiKeyService.list(botInstanceId);
  }

  @Delete(":botInstanceId/api-keys/:keyId")
  @ApiOperation({ summary: "Revoke an A2A API key" })
  @ApiParam({ name: "botInstanceId", description: "Bot instance ID" })
  @ApiParam({ name: "keyId", description: "API key ID to revoke" })
  async revokeApiKey(@Param("keyId") keyId: string) {
    await this.apiKeyService.revoke(keyId);
    return { success: true };
  }
}
