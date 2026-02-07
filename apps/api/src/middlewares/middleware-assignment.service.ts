import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { BotInstancesService } from "../bot-instances/bot-instances.service";
import { MiddlewareRegistryService } from "./middleware-registry.service";
import {
  AssignMiddlewareDto,
  UpdateMiddlewareAssignmentDto,
} from "./middlewares.dto";

export interface BotMiddlewareAssignment {
  package: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface MiddlewareConfig {
  middlewares: BotMiddlewareAssignment[];
}

@Injectable()
export class MiddlewareAssignmentService {
  constructor(
    private readonly botInstancesService: BotInstancesService,
    private readonly registryService: MiddlewareRegistryService,
  ) {}

  async getAssignments(instanceId: string): Promise<BotMiddlewareAssignment[]> {
    const instance = await this.botInstancesService.findOne(instanceId);
    const mwConfig = this.parseMiddlewareConfig(instance.metadata);
    return mwConfig.middlewares;
  }

  async assignMiddleware(
    instanceId: string,
    dto: AssignMiddlewareDto,
  ): Promise<BotMiddlewareAssignment[]> {
    this.registryService.findById(dto.package);

    const instance = await this.botInstancesService.findOne(instanceId);
    const metadata = this.parseMetadata(instance.metadata);
    const mwConfig = this.extractMiddlewareConfig(metadata);

    const existing = mwConfig.middlewares.find((m) => m.package === dto.package);
    if (existing) {
      throw new BadRequestException(
        `Middleware "${dto.package}" is already assigned to this bot`,
      );
    }

    const assignment: BotMiddlewareAssignment = {
      package: dto.package,
      enabled: dto.enabled ?? true,
      config: dto.config ?? {},
    };

    const updatedConfig: MiddlewareConfig = {
      middlewares: [...mwConfig.middlewares, assignment],
    };

    await this.saveMiddlewareConfig(instanceId, metadata, updatedConfig);
    return updatedConfig.middlewares;
  }

  async updateMiddleware(
    instanceId: string,
    packageName: string,
    dto: UpdateMiddlewareAssignmentDto,
  ): Promise<BotMiddlewareAssignment[]> {
    const instance = await this.botInstancesService.findOne(instanceId);
    const metadata = this.parseMetadata(instance.metadata);
    const mwConfig = this.extractMiddlewareConfig(metadata);

    const index = mwConfig.middlewares.findIndex(
      (m) => m.package === packageName,
    );
    if (index === -1) {
      throw new NotFoundException(
        `Middleware "${packageName}" is not assigned to this bot`,
      );
    }

    const updatedMiddlewares = mwConfig.middlewares.map((m, i) =>
      i === index
        ? {
            ...m,
            ...(dto.enabled !== undefined && { enabled: dto.enabled }),
            ...(dto.config !== undefined && { config: dto.config }),
          }
        : m,
    );

    const updatedConfig: MiddlewareConfig = { middlewares: updatedMiddlewares };
    await this.saveMiddlewareConfig(instanceId, metadata, updatedConfig);
    return updatedConfig.middlewares;
  }

  async removeMiddleware(
    instanceId: string,
    packageName: string,
  ): Promise<void> {
    const instance = await this.botInstancesService.findOne(instanceId);
    const metadata = this.parseMetadata(instance.metadata);
    const mwConfig = this.extractMiddlewareConfig(metadata);

    const filtered = mwConfig.middlewares.filter(
      (m) => m.package !== packageName,
    );
    if (filtered.length === mwConfig.middlewares.length) {
      throw new NotFoundException(
        `Middleware "${packageName}" is not assigned to this bot`,
      );
    }

    await this.saveMiddlewareConfig(instanceId, metadata, {
      middlewares: filtered,
    });
  }

  private parseMetadata(
    raw: string | Record<string, unknown>,
  ): Record<string, unknown> {
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return raw ?? {};
  }

  private parseMiddlewareConfig(
    raw: string | Record<string, unknown>,
  ): MiddlewareConfig {
    const metadata = this.parseMetadata(raw);
    return this.extractMiddlewareConfig(metadata);
  }

  private extractMiddlewareConfig(
    metadata: Record<string, unknown>,
  ): MiddlewareConfig {
    const mwConfig = metadata.middlewareConfig as
      | MiddlewareConfig
      | undefined;
    return { middlewares: mwConfig?.middlewares ?? [] };
  }

  private async saveMiddlewareConfig(
    instanceId: string,
    currentMetadata: Record<string, unknown>,
    config: MiddlewareConfig,
  ): Promise<void> {
    const mergedMetadata = {
      ...currentMetadata,
      middlewareConfig: config,
    };
    await this.botInstancesService.update(instanceId, {
      metadata: mergedMetadata,
    });
  }
}
