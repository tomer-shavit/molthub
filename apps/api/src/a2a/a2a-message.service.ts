import { Injectable, Logger, NotFoundException, HttpException, HttpStatus } from "@nestjs/common";
import { prisma } from "@clawster/database";
import { GatewayManager } from "@clawster/gateway-client";
import type { GatewayConnectionOptions, GatewayClient } from "@clawster/gateway-client";
import { TracesService } from "../traces/traces.service";
import type { SendMessageParams, A2aTask, A2aMessage, TextPart } from "./a2a.types";
import * as crypto from "crypto";

@Injectable()
export class A2aMessageService {
  private readonly logger = new Logger(A2aMessageService.name);
  private readonly gatewayManager = new GatewayManager();

  constructor(private readonly tracesService: TracesService) {}

  async sendMessage(
    botInstanceId: string,
    params: SendMessageParams,
    options?: { parentTraceId?: string },
  ): Promise<A2aTask> {
    // 1. Validate bot exists
    const bot = await prisma.botInstance.findUnique({
      where: { id: botInstanceId },
    });

    if (!bot) {
      throw new NotFoundException(`Bot instance ${botInstanceId} not found`);
    }

    // 2. Extract text from message parts
    const text = this.extractText(params.message);
    if (!text) {
      throw new HttpException("Message must contain at least one text part", HttpStatus.BAD_REQUEST);
    }

    // 3. Generate task and context IDs
    const taskId = crypto.randomUUID();
    const contextId = params.message.contextId || crypto.randomUUID();

    // 4. Create trace for observability
    const trace = await this.tracesService.create({
      botInstanceId,
      traceId: taskId,
      parentTraceId: options?.parentTraceId,
      name: "a2a:SendMessage",
      type: "TASK",
      status: "PENDING",
      input: {
        messageId: params.message.messageId,
        role: params.message.role,
        text,
        contextId,
      },
      metadata: {
        a2a: true,
        contextId,
        messageId: params.message.messageId,
      },
    });

    // 5. Connect to gateway
    const client = await this.getGatewayClient(botInstanceId);
    if (!client) {
      await this.tracesService.fail(trace.id, { error: "Gateway unavailable" });
      return this.buildTask(taskId, contextId, "failed", undefined, "Gateway connection unavailable for this bot instance");
    }

    // 6. Send to agent via gateway
    try {
      const result = await client.agent({
        message: text,
        idempotencyKey: taskId,
        agentId: "main",
        deliver: false,
        timeout: 60_000,
        _localTimeoutMs: 65_000,
      });

      if (result.completion.status === "completed" && result.completion.output) {
        await this.tracesService.complete(trace.id, {
          output: result.completion.output,
          status: "completed",
        });
        return this.buildTask(taskId, contextId, "completed", result.completion.output);
      } else {
        const errorMsg = result.completion.error || "Agent returned no output";
        await this.tracesService.fail(trace.id, { error: errorMsg });
        return this.buildTask(taskId, contextId, "failed", undefined, errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`A2A SendMessage failed for ${botInstanceId}: ${errorMsg}`);
      await this.tracesService.fail(trace.id, { error: errorMsg });
      return this.buildTask(taskId, contextId, "failed", undefined, errorMsg);
    }
  }

  private extractText(message: A2aMessage): string | null {
    const textParts = message.parts
      .filter((p): p is TextPart => "text" in p)
      .map((p) => p.text);
    return textParts.length > 0 ? textParts.join("\n") : null;
  }

  private buildTask(
    taskId: string,
    contextId: string,
    state: "completed" | "failed",
    output?: string,
    error?: string,
  ): A2aTask {
    const now = new Date().toISOString();
    const agentMessage: A2aMessage | undefined = output
      ? {
          messageId: `${taskId}-response`,
          role: "agent",
          parts: [{ text: output }],
        }
      : error
        ? {
            messageId: `${taskId}-error`,
            role: "agent",
            parts: [{ text: error }],
          }
        : undefined;

    return {
      id: taskId,
      contextId,
      status: {
        state,
        message: agentMessage,
        timestamp: now,
      },
    };
  }

  private async getGatewayClient(botInstanceId: string): Promise<GatewayClient | null> {
    try {
      const gwConn = await prisma.gatewayConnection.findUnique({
        where: { instanceId: botInstanceId },
      });

      if (!gwConn) {
        this.logger.debug(`No gateway connection for ${botInstanceId}`);
        return null;
      }

      const options: GatewayConnectionOptions = {
        host: gwConn.host,
        port: gwConn.port,
        auth: {
          mode: "token",
          token: gwConn.authToken || "clawster",
        },
        timeoutMs: 5_000,
      };

      return await this.gatewayManager.getClient(botInstanceId, options);
    } catch (err) {
      this.logger.debug(`Could not connect to gateway for ${botInstanceId}: ${(err as Error).message ?? err}`);
      return null;
    }
  }
}
