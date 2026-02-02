import { Injectable, Logger, NotFoundException, HttpException, HttpStatus } from "@nestjs/common";
import { prisma } from "@clawster/database";
import { GatewayManager } from "@clawster/gateway-client";
import type { GatewayConnectionOptions, GatewayClient, AgentOutputEvent } from "@clawster/gateway-client";
import { Subject, Observable } from "rxjs";
import { TracesService } from "../traces/traces.service";
import type { SendMessageParams, A2aTask, TextPart, A2aStreamEvent } from "./a2a.types";
import * as crypto from "crypto";

interface ActiveRun {
  subject: Subject<A2aStreamEvent>;
  taskId: string;
  contextId: string;
  traceId: string;
  accumulatedText: string;
  client: GatewayClient;
  cleanup: () => void;
}

@Injectable()
export class A2aStreamingService {
  private readonly logger = new Logger(A2aStreamingService.name);
  private readonly gatewayManager = new GatewayManager();
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(private readonly tracesService: TracesService) {}

  /**
   * Stream a message to the agent, returning an Observable of SSE events.
   */
  streamMessage(
    botInstanceId: string,
    params: SendMessageParams,
    jsonRpcId: string | number,
  ): Observable<A2aStreamEvent> {
    const subject = new Subject<A2aStreamEvent>();

    // Run async setup in background — the observable is returned immediately
    this.startStream(botInstanceId, params, jsonRpcId, subject).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Stream setup failed for ${botInstanceId}: ${message}`);
      subject.next(this.makeStatusEvent(jsonRpcId, "", "", "failed", message, true));
      subject.complete();
    });

    return subject.asObservable();
  }

  /**
   * Cancel an active streaming task.
   */
  async cancelTask(botInstanceId: string, taskId: string): Promise<A2aTask> {
    const run = this.activeRuns.get(taskId);
    if (!run) {
      // Check if it's a completed task
      const trace = await prisma.trace.findFirst({
        where: { traceId: taskId, botInstanceId },
      });
      if (!trace) {
        throw new NotFoundException(`Task ${taskId} not found`);
      }
      // Already completed — can't cancel
      throw new HttpException("Task is not active and cannot be canceled", HttpStatus.CONFLICT);
    }

    // Clean up and complete
    run.cleanup();
    run.subject.next(this.makeStatusEvent(0, run.taskId, run.contextId, "canceled", "Task canceled by client", true));
    run.subject.complete();
    this.activeRuns.delete(taskId);

    // Update trace
    await this.tracesService.fail(run.traceId, { error: "Canceled by client" });

    return {
      id: run.taskId,
      contextId: run.contextId,
      status: {
        state: "canceled",
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async startStream(
    botInstanceId: string,
    params: SendMessageParams,
    jsonRpcId: string | number,
    subject: Subject<A2aStreamEvent>,
  ): Promise<void> {
    // 1. Validate bot
    const bot = await prisma.botInstance.findUnique({
      where: { id: botInstanceId },
    });
    if (!bot) {
      throw new NotFoundException(`Bot instance ${botInstanceId} not found`);
    }

    // 2. Extract text
    const text = this.extractText(params);
    if (!text) {
      throw new HttpException("Message must contain at least one text part", HttpStatus.BAD_REQUEST);
    }

    // 3. Generate IDs
    const taskId = crypto.randomUUID();
    const contextId = params.message.contextId || crypto.randomUUID();

    // 4. Create trace
    const trace = await this.tracesService.create({
      botInstanceId,
      traceId: taskId,
      name: "a2a:message/stream",
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
        streaming: true,
      },
    });

    // 5. Emit initial "working" status
    subject.next(this.makeStatusEvent(jsonRpcId, taskId, contextId, "working", undefined, false));

    // 6. Connect to gateway
    const client = await this.getGatewayClient(botInstanceId);
    if (!client) {
      await this.tracesService.fail(trace.id, { error: "Gateway unavailable" });
      subject.next(this.makeStatusEvent(jsonRpcId, taskId, contextId, "failed", "Gateway connection unavailable", true));
      subject.complete();
      return;
    }

    // 7. Set up agentOutput listener for streaming chunks
    let chunkSeq = 0;
    const artifactId = `${taskId}-output`;
    let accumulatedText = "";

    const onAgentOutput = (event: AgentOutputEvent) => {
      // Only process chunks for this request
      if (event.requestId !== taskId) return;

      accumulatedText += event.chunk;
      chunkSeq++;

      subject.next({
        jsonrpc: "2.0",
        id: jsonRpcId,
        result: {
          artifactUpdate: {
            taskId,
            contextId,
            artifact: {
              artifactId,
              parts: [{ text: event.chunk }],
              append: chunkSeq > 1,
              lastChunk: false,
            },
          },
        },
      });
    };

    client.on("agentOutput", onAgentOutput);

    const cleanup = () => {
      client.off("agentOutput", onAgentOutput);
    };

    // Track active run
    const run: ActiveRun = {
      subject,
      taskId,
      contextId,
      traceId: trace.id,
      accumulatedText: "",
      client,
      cleanup,
    };
    this.activeRuns.set(taskId, run);

    // 8. Send to agent and wait for completion
    try {
      const result = await client.agent({
        message: text,
        idempotencyKey: taskId,
        agentId: "main",
        deliver: false,
        timeout: 60_000,
        _localTimeoutMs: 65_000,
      });

      cleanup();
      this.activeRuns.delete(taskId);

      if (result.completion.status === "completed" && result.completion.output) {
        // Send final artifact chunk (the full output, in case some chunks were missed)
        subject.next({
          jsonrpc: "2.0",
          id: jsonRpcId,
          result: {
            artifactUpdate: {
              taskId,
              contextId,
              artifact: {
                artifactId,
                parts: [{ text: result.completion.output }],
                append: false,
                lastChunk: true,
              },
            },
          },
        });

        // Send completed status
        subject.next(this.makeStatusEvent(jsonRpcId, taskId, contextId, "completed", undefined, true));

        await this.tracesService.complete(trace.id, {
          output: result.completion.output,
          status: "completed",
        });
      } else {
        const errorMsg = result.completion.error || "Agent returned no output";
        subject.next(this.makeStatusEvent(jsonRpcId, taskId, contextId, "failed", errorMsg, true));
        await this.tracesService.fail(trace.id, { error: errorMsg });
      }
    } catch (err) {
      cleanup();
      this.activeRuns.delete(taskId);

      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`A2A stream failed for ${botInstanceId}: ${errorMsg}`);
      subject.next(this.makeStatusEvent(jsonRpcId, taskId, contextId, "failed", errorMsg, true));
      await this.tracesService.fail(trace.id, { error: errorMsg });
    }

    subject.complete();
  }

  private makeStatusEvent(
    jsonRpcId: string | number,
    taskId: string,
    contextId: string,
    state: string,
    message: string | undefined,
    final: boolean,
  ): A2aStreamEvent {
    return {
      jsonrpc: "2.0",
      id: jsonRpcId,
      result: {
        statusUpdate: {
          taskId,
          contextId,
          status: {
            state: state as A2aStreamEvent["result"]["statusUpdate"] extends undefined ? never : string,
            timestamp: new Date().toISOString(),
            ...(message ? { message: { messageId: `${taskId}-status`, role: "agent" as const, parts: [{ text: message }] } } : {}),
          } as any,
          final,
        },
      },
    };
  }

  private extractText(params: SendMessageParams): string | null {
    const textParts = params.message.parts
      .filter((p): p is TextPart => "text" in p)
      .map((p) => p.text);
    return textParts.length > 0 ? textParts.join("\n") : null;
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
