/**
 * Bot team member types.
 */

export interface BotTeamMember {
  id: string;
  workspaceId: string;
  ownerBotId: string;
  memberBotId: string;
  role: string;
  description: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  ownerBot?: { id: string; name: string; status: string };
  memberBot?: { id: string; name: string; status: string };
}

export interface AddTeamMemberPayload {
  ownerBotId: string;
  memberBotId: string;
  role: string;
  description: string;
}

export interface UpdateTeamMemberPayload {
  role?: string;
  description?: string;
  enabled?: boolean;
}
