/**
 * Bot chat types.
 */

export interface ChatWithBotPayload {
  message: string;
  sessionId?: string;
}

export interface ChatWithBotResult {
  response: string;
  sessionId: string;
  status: string;
}
