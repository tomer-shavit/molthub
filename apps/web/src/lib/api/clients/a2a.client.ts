/**
 * A2A (Agent-to-Agent) domain client.
 * Handles agent cards, messaging, streaming, and API keys.
 */

import { BaseHttpClient, ApiError } from '../base-client';
import type {
  AgentCard,
  A2aJsonRpcResponse,
  A2aApiKeyInfo,
  A2aApiKeyCreateResponse,
  A2aTaskInfo,
  A2aStreamCallbacks,
} from '../types/a2a';

export class A2aClient extends BaseHttpClient {
  /**
   * Get the agent card for a bot instance.
   */
  getAgentCard(botInstanceId: string): Promise<AgentCard> {
    return this.get(`/a2a/${botInstanceId}/agent-card`);
  }

  /**
   * Send a message to a bot via A2A protocol.
   */
  sendMessage(botInstanceId: string, message: string, apiKey?: string): Promise<A2aJsonRpcResponse> {
    const ts = Date.now();
    const body = {
      jsonrpc: "2.0",
      id: `msg-${ts}`,
      method: "SendMessage",
      params: {
        message: {
          messageId: `msg-${ts}`,
          role: "user",
          parts: [{ text: message }],
        },
      },
    };

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    return this.request(`/a2a/${botInstanceId}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  /**
   * Stream a message to a bot via A2A protocol (SSE).
   * Returns an AbortController to cancel the stream.
   */
  streamMessage(
    botInstanceId: string,
    message: string,
    apiKey: string,
    callbacks: A2aStreamCallbacks,
  ): AbortController {
    const controller = new AbortController();
    const body = {
      jsonrpc: "2.0",
      id: `stream-${Date.now()}`,
      method: "message/stream",
      params: {
        message: {
          messageId: `msg-${Date.now()}`,
          role: "user",
          parts: [{ text: message }],
        },
      },
    };

    fetch(`${this.baseUrl}/a2a/${botInstanceId}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          callbacks.onError(`HTTP ${response.status}: ${response.statusText}`);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const event = JSON.parse(data);
              if (event.error) {
                callbacks.onError(event.error.message || "Unknown error");
                continue;
              }
              const result = event.result;
              if (result?.statusUpdate) {
                const su = result.statusUpdate;
                callbacks.onStatus(su.status?.state || su.state, su.taskId);
              }
              if (result?.artifactUpdate) {
                const au = result.artifactUpdate;
                const text = au.artifact?.parts
                  ?.map((p: { text?: string }) => p.text)
                  .filter(Boolean)
                  .join("");
                if (text) {
                  if (au.artifact.lastChunk && !au.artifact.append) {
                    // Final full output — don't append, it replaces accumulated chunks
                  } else {
                    callbacks.onChunk(text);
                  }
                }
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
        callbacks.onDone();
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          callbacks.onDone();
          return;
        }
        callbacks.onError(err instanceof Error ? err.message : String(err));
      });

    return controller;
  }

  /**
   * Cancel an A2A task.
   */
  async cancelTask(botInstanceId: string, taskId: string, apiKey: string): Promise<A2aJsonRpcResponse> {
    const body = {
      jsonrpc: "2.0",
      id: `cancel-${Date.now()}`,
      method: "tasks/cancel",
      params: { id: taskId },
    };

    const response = await fetch(`${this.baseUrl}/a2a/${botInstanceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ApiError(response.status, `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * List tasks for a bot instance.
   */
  listTasks(botInstanceId: string): Promise<A2aTaskInfo[]> {
    return this.get(`/a2a/${botInstanceId}/tasks`);
  }

  /**
   * Generate a new A2A API key for a bot instance.
   */
  generateApiKey(botInstanceId: string, label?: string): Promise<A2aApiKeyCreateResponse> {
    return this.post(`/a2a/${botInstanceId}/api-keys`, { label });
  }

  /**
   * List A2A API keys for a bot instance.
   */
  listApiKeys(botInstanceId: string): Promise<A2aApiKeyInfo[]> {
    return this.get(`/a2a/${botInstanceId}/api-keys`);
  }

  /**
   * Revoke an A2A API key.
   */
  revokeApiKey(botInstanceId: string, keyId: string): Promise<void> {
    return this.delete(`/a2a/${botInstanceId}/api-keys/${keyId}`);
  }
}

export const a2aClient = new A2aClient();
