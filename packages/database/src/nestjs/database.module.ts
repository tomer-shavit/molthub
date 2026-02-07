import { Module, Global, DynamicModule } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import {
  PRISMA_CLIENT,
  WORKSPACE_REPOSITORY,
  BOT_INSTANCE_REPOSITORY,
  FLEET_REPOSITORY,
  CONFIG_LAYER_REPOSITORY,
  CONNECTOR_REPOSITORY,
  CHANNEL_REPOSITORY,
  SKILL_PACK_REPOSITORY,
  TRACE_REPOSITORY,
  COST_REPOSITORY,
  SLO_REPOSITORY,
  ALERT_REPOSITORY,
  AUDIT_REPOSITORY,
  ROUTING_REPOSITORY,
} from "./tokens";
import {
  PrismaWorkspaceRepository,
  PrismaBotInstanceRepository,
  PrismaFleetRepository,
  PrismaConfigLayerRepository,
  PrismaConnectorRepository,
  PrismaChannelRepository,
  PrismaSkillPackRepository,
  PrismaTraceRepository,
  PrismaCostRepository,
  PrismaSloRepository,
  PrismaAlertRepository,
  PrismaAuditRepository,
  PrismaRoutingRepository,
} from "../repositories";
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

export interface DatabaseModuleOptions {
  /** Custom PrismaClient instance. If not provided, creates a new one. */
  client?: PrismaClient;
}

export interface MockRepositories {
  workspace?: Partial<IWorkspaceRepository>;
  botInstance?: Partial<IBotInstanceRepository>;
  fleet?: Partial<IFleetRepository>;
  configLayer?: Partial<IConfigLayerRepository>;
  connector?: Partial<IConnectorRepository>;
  channel?: Partial<IChannelRepository>;
  skillPack?: Partial<ISkillPackRepository>;
  trace?: Partial<ITraceRepository>;
  cost?: Partial<ICostRepository>;
  slo?: Partial<ISloRepository>;
  alert?: Partial<IAlertRepository>;
  audit?: Partial<IAuditRepository>;
  routing?: Partial<IRoutingRepository>;
}

/**
 * Creates a mock repository with all methods returning null/empty by default.
 * Useful for testing when you only need to mock specific methods.
 * Uses a Proxy to auto-generate mock functions for any method call.
 */
function createMockRepository(): Record<string, () => Promise<null>> {
  return new Proxy(
    {} as Record<string, () => Promise<null>>,
    {
      get: (_target, prop) => {
        if (typeof prop === "string") {
          // Return a function that resolves to null
          // Tests can override specific methods via MockRepositories
          return () => Promise.resolve(null);
        }
        return undefined;
      },
    }
  );
}

@Global()
@Module({})
export class DatabaseModule {
  private static prismaClient: PrismaClient | null = null;

  /**
   * Configure the database module for production use.
   * Creates real repository implementations backed by Prisma.
   */
  static forRoot(options?: DatabaseModuleOptions): DynamicModule {
    const client = options?.client ?? new PrismaClient();
    DatabaseModule.prismaClient = client;

    return {
      module: DatabaseModule,
      providers: [
        { provide: PRISMA_CLIENT, useValue: client },
        {
          provide: WORKSPACE_REPOSITORY,
          useFactory: () => new PrismaWorkspaceRepository(client),
        },
        {
          provide: BOT_INSTANCE_REPOSITORY,
          useFactory: () => new PrismaBotInstanceRepository(client),
        },
        {
          provide: FLEET_REPOSITORY,
          useFactory: () => new PrismaFleetRepository(client),
        },
        {
          provide: CONFIG_LAYER_REPOSITORY,
          useFactory: () => new PrismaConfigLayerRepository(client),
        },
        {
          provide: CONNECTOR_REPOSITORY,
          useFactory: () => new PrismaConnectorRepository(client),
        },
        {
          provide: CHANNEL_REPOSITORY,
          useFactory: () => new PrismaChannelRepository(client),
        },
        {
          provide: SKILL_PACK_REPOSITORY,
          useFactory: () => new PrismaSkillPackRepository(client),
        },
        {
          provide: TRACE_REPOSITORY,
          useFactory: () => new PrismaTraceRepository(client),
        },
        {
          provide: COST_REPOSITORY,
          useFactory: () => new PrismaCostRepository(client),
        },
        {
          provide: SLO_REPOSITORY,
          useFactory: () => new PrismaSloRepository(client),
        },
        {
          provide: ALERT_REPOSITORY,
          useFactory: () => new PrismaAlertRepository(client),
        },
        {
          provide: AUDIT_REPOSITORY,
          useFactory: () => new PrismaAuditRepository(client),
        },
        {
          provide: ROUTING_REPOSITORY,
          useFactory: () => new PrismaRoutingRepository(client),
        },
      ],
      exports: [
        PRISMA_CLIENT,
        WORKSPACE_REPOSITORY,
        BOT_INSTANCE_REPOSITORY,
        FLEET_REPOSITORY,
        CONFIG_LAYER_REPOSITORY,
        CONNECTOR_REPOSITORY,
        CHANNEL_REPOSITORY,
        SKILL_PACK_REPOSITORY,
        TRACE_REPOSITORY,
        COST_REPOSITORY,
        SLO_REPOSITORY,
        ALERT_REPOSITORY,
        AUDIT_REPOSITORY,
        ROUTING_REPOSITORY,
      ],
    };
  }

  /**
   * Configure the database module for testing.
   * Allows injecting mock repositories for unit tests.
   */
  static forTest(mocks: MockRepositories = {}): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: PRISMA_CLIENT,
          useValue: null, // No real Prisma in tests
        },
        {
          provide: WORKSPACE_REPOSITORY,
          useValue: mocks.workspace ?? createMockRepository(),
        },
        {
          provide: BOT_INSTANCE_REPOSITORY,
          useValue: mocks.botInstance ?? createMockRepository(),
        },
        {
          provide: FLEET_REPOSITORY,
          useValue: mocks.fleet ?? createMockRepository(),
        },
        {
          provide: CONFIG_LAYER_REPOSITORY,
          useValue: mocks.configLayer ?? createMockRepository(),
        },
        {
          provide: CONNECTOR_REPOSITORY,
          useValue: mocks.connector ?? createMockRepository(),
        },
        {
          provide: CHANNEL_REPOSITORY,
          useValue: mocks.channel ?? createMockRepository(),
        },
        {
          provide: SKILL_PACK_REPOSITORY,
          useValue: mocks.skillPack ?? createMockRepository(),
        },
        {
          provide: TRACE_REPOSITORY,
          useValue: mocks.trace ?? createMockRepository(),
        },
        {
          provide: COST_REPOSITORY,
          useValue: mocks.cost ?? createMockRepository(),
        },
        {
          provide: SLO_REPOSITORY,
          useValue: mocks.slo ?? createMockRepository(),
        },
        {
          provide: ALERT_REPOSITORY,
          useValue: mocks.alert ?? createMockRepository(),
        },
        {
          provide: AUDIT_REPOSITORY,
          useValue: mocks.audit ?? createMockRepository(),
        },
        {
          provide: ROUTING_REPOSITORY,
          useValue: mocks.routing ?? createMockRepository(),
        },
      ],
      exports: [
        PRISMA_CLIENT,
        WORKSPACE_REPOSITORY,
        BOT_INSTANCE_REPOSITORY,
        FLEET_REPOSITORY,
        CONFIG_LAYER_REPOSITORY,
        CONNECTOR_REPOSITORY,
        CHANNEL_REPOSITORY,
        SKILL_PACK_REPOSITORY,
        TRACE_REPOSITORY,
        COST_REPOSITORY,
        SLO_REPOSITORY,
        ALERT_REPOSITORY,
        AUDIT_REPOSITORY,
        ROUTING_REPOSITORY,
      ],
    };
  }

  /**
   * Gracefully disconnect from the database.
   * Call this in onModuleDestroy() or during app shutdown.
   */
  static async disconnect(): Promise<void> {
    if (DatabaseModule.prismaClient) {
      await DatabaseModule.prismaClient.$disconnect();
      DatabaseModule.prismaClient = null;
    }
  }
}
