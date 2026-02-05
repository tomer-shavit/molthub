/**
 * Bot teams domain client.
 * Handles team member management.
 */

import { BaseHttpClient } from '../base-client';
import type {
  BotTeamMember,
  AddTeamMemberPayload,
  UpdateTeamMemberPayload,
} from '../types/teams';

export class TeamsClient extends BaseHttpClient {
  /**
   * List team members for an owner bot.
   */
  listMembers(ownerBotId: string): Promise<BotTeamMember[]> {
    return this.get('/bot-teams', { ownerBotId });
  }

  /**
   * List teams that a bot is a member of.
   */
  listMemberOf(memberBotId: string): Promise<BotTeamMember[]> {
    return this.get('/bot-teams', { memberBotId });
  }

  /**
   * Add a team member.
   */
  add(data: AddTeamMemberPayload): Promise<BotTeamMember> {
    return this.post('/bot-teams', data);
  }

  /**
   * Update a team member.
   */
  update(id: string, data: UpdateTeamMemberPayload): Promise<BotTeamMember> {
    return this.patch(`/bot-teams/${id}`, data);
  }

  /**
   * Remove a team member.
   */
  remove(id: string): Promise<void> {
    return this.delete(`/bot-teams/${id}`);
  }
}

export const teamsClient = new TeamsClient();
