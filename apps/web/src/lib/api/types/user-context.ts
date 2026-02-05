/**
 * User context types.
 */

export type UserStage = 'empty' | 'getting-started' | 'fleet';

export interface UserContextResponse {
  agentCount: number;
  hasFleets: boolean;
  hasTeams: boolean;
  stage: UserStage;
}
