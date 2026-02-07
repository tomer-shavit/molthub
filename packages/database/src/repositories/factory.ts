import { PrismaClient } from "@prisma/client";
import { PrismaWorkspaceRepository } from "./workspace.repository";
import { PrismaBotInstanceRepository } from "./bot-instance.repository";
import { PrismaFleetRepository } from "./fleet.repository";
import { PrismaConfigLayerRepository } from "./config-layer.repository";
import { PrismaConnectorRepository } from "./connector.repository";
import { PrismaChannelRepository } from "./channel.repository";
import { PrismaSkillPackRepository } from "./skill-pack.repository";
import { PrismaTraceRepository } from "./trace.repository";
import { PrismaCostRepository } from "./cost.repository";
import { PrismaSloRepository } from "./slo.repository";
import { PrismaAlertRepository } from "./alert.repository";
import { PrismaAuditRepository } from "./audit.repository";
import { PrismaRoutingRepository } from "./routing.repository";
import type {
  IWorkspaceRepository,
  IBotInstanceRepository,
  IFleetRepository,
  IConfigLayerRepository,
  IConnectorRepository,
  IChannelRepository,
  ISkillPackRepository,
  ITraceRepository,
  ICostRepository,
  ISloRepository,
  IAlertRepository,
  IAuditRepository,
  IRoutingRepository,
} from "../interfaces";

/**
 * All repository interfaces available in the database package.
 */
export interface RepositoryFactory {
  workspace: IWorkspaceRepository;
  botInstance: IBotInstanceRepository;
  fleet: IFleetRepository;
  configLayer: IConfigLayerRepository;
  connector: IConnectorRepository;
  channel: IChannelRepository;
  skillPack: ISkillPackRepository;
  trace: ITraceRepository;
  cost: ICostRepository;
  slo: ISloRepository;
  alert: IAlertRepository;
  audit: IAuditRepository;
  routing: IRoutingRepository;
}

/**
 * Creates all repository instances backed by a PrismaClient.
 * Use this for non-NestJS contexts (CLI, scripts, etc.).
 *
 * @example
 * ```typescript
 * import { PrismaClient } from "@prisma/client";
 * import { createRepositories } from "@clawster/database";
 *
 * const prisma = new PrismaClient();
 * const repos = createRepositories(prisma);
 *
 * const bots = await repos.botInstance.findByWorkspace("workspace-id");
 * ```
 */
export function createRepositories(prisma: PrismaClient): RepositoryFactory {
  return {
    workspace: new PrismaWorkspaceRepository(prisma),
    botInstance: new PrismaBotInstanceRepository(prisma),
    fleet: new PrismaFleetRepository(prisma),
    configLayer: new PrismaConfigLayerRepository(prisma),
    connector: new PrismaConnectorRepository(prisma),
    channel: new PrismaChannelRepository(prisma),
    skillPack: new PrismaSkillPackRepository(prisma),
    trace: new PrismaTraceRepository(prisma),
    cost: new PrismaCostRepository(prisma),
    slo: new PrismaSloRepository(prisma),
    alert: new PrismaAlertRepository(prisma),
    audit: new PrismaAuditRepository(prisma),
    routing: new PrismaRoutingRepository(prisma),
  };
}
