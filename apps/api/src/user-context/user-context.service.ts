import { Injectable } from "@nestjs/common";
import { prisma } from "@clawster/database";

export interface UserContext {
  agentCount: number;
  hasFleets: boolean;
  hasTeams: boolean;
  stage: "empty" | "getting-started" | "fleet";
}

/** Agent count at which the UI transitions from getting-started to fleet stage */
const FLEET_STAGE_THRESHOLD = 4;

@Injectable()
export class UserContextService {
  async getUserContext(workspaceId: string): Promise<UserContext> {
    const [agentCount, fleetCount] = await Promise.all([
      prisma.botInstance.count({ where: { workspaceId } }),
      prisma.fleet.count({
        where: {
          workspaceId,
          instances: { some: {} },
        },
      }),
    ]);

    // fleetCount > 1 because the default fleet (created during onboarding) doesn't count
    const hasFleets = fleetCount > 1;
    const hasTeams = false; // Phase 3

    let stage: UserContext["stage"];
    if (agentCount === 0) {
      stage = "empty";
    } else if (agentCount >= FLEET_STAGE_THRESHOLD || hasFleets) {
      stage = "fleet";
    } else {
      stage = "getting-started";
    }

    return { agentCount, hasFleets, hasTeams, stage };
  }
}
