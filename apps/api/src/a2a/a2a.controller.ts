import { Controller, Get, Post, Param, Body, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";
import { A2aAgentCardService } from "./a2a-agent-card.service";
import { A2aMessageService } from "./a2a-message.service";
import type { JsonRpcRequest, JsonRpcResponse, SendMessageParams } from "./a2a.types";

@ApiTags("a2a")
@Controller("a2a")
export class A2aController {
  private readonly logger = new Logger(A2aController.name);

  constructor(
    private readonly agentCardService: A2aAgentCardService,
    private readonly messageService: A2aMessageService,
  ) {}

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

  @Post(":botInstanceId")
  @Public()
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

      default:
        return {
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32601, message: `Method not found: ${body.method}` },
        };
    }
  }
}
