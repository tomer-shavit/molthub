import { BaseHttpClient } from "../base-client";
import type {
  MiddlewareRegistryEntry,
  BotMiddlewareAssignment,
  AssignMiddlewarePayload,
  UpdateMiddlewareAssignmentPayload,
} from "../types/middlewares";

export class MiddlewaresClient extends BaseHttpClient {
  list(): Promise<MiddlewareRegistryEntry[]> {
    return this.get("/middlewares");
  }

  getById(id: string): Promise<MiddlewareRegistryEntry> {
    return this.get(`/middlewares/${encodeURIComponent(id)}`);
  }

  getBotMiddlewares(instanceId: string): Promise<BotMiddlewareAssignment[]> {
    return this.get(`/bot-instances/${instanceId}/middlewares`);
  }

  assignToBot(
    instanceId: string,
    payload: AssignMiddlewarePayload,
  ): Promise<BotMiddlewareAssignment[]> {
    return this.post(`/bot-instances/${instanceId}/middlewares`, payload);
  }

  updateAssignment(
    instanceId: string,
    packageName: string,
    patch: UpdateMiddlewareAssignmentPayload,
  ): Promise<BotMiddlewareAssignment[]> {
    return this.patch(
      `/bot-instances/${instanceId}/middlewares/${encodeURIComponent(packageName)}`,
      patch,
    );
  }

  removeFromBot(instanceId: string, packageName: string): Promise<void> {
    return this.delete(
      `/bot-instances/${instanceId}/middlewares/${encodeURIComponent(packageName)}`,
    );
  }
}

export const middlewaresClient = new MiddlewaresClient();
