import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma, Instance, InstanceStatus } from "@molthub/database";
import { PolicyEngine, validateManifest } from "@molthub/core";
import { CreateInstanceDto, ListInstancesQueryDto } from "./instances.dto";

@Injectable()
export class InstancesService {
  private readonly policyEngine = new PolicyEngine();

  async create(dto: CreateInstanceDto): Promise<Instance> {
    // Check for duplicate name in workspace
    const existing = await prisma.instance.findFirst({
      where: { 
        workspaceId: "default", // TODO: Get from auth context
        name: dto.name 
      },
    });

    if (existing) {
      throw new BadRequestException(`Instance with name '${dto.name}' already exists`);
    }

    // Create instance record
    const instance = await prisma.instance.create({
      data: {
        workspaceId: "default", // TODO: Get from auth context
        name: dto.name,
        environment: dto.environment,
        tags: dto.tags || {},
        status: InstanceStatus.CREATING,
      },
    });

    return instance;
  }

  async findAll(query: ListInstancesQueryDto): Promise<Instance[]> {
    return prisma.instance.findMany({
      where: {
        workspaceId: query.workspaceId || "default",
        ...(query.environment && { environment: query.environment }),
        ...(query.status && { status: query.status }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string): Promise<Instance> {
    const instance = await prisma.instance.findUnique({
      where: { id },
      include: {
        manifests: {
          orderBy: { version: "desc" },
          take: 5,
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(`Instance ${id} not found`);
    }

    return instance;
  }

  async restart(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.instance.update({
      where: { id },
      data: { 
        status: InstanceStatus.CREATING,
        lastReconcileAt: null,
      },
    });

    // TODO: Trigger reconciler
  }

  async stop(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.instance.update({
      where: { id },
      data: { status: InstanceStatus.STOPPED },
    });

    // TODO: Trigger reconciler to scale down
  }

  async remove(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.instance.update({
      where: { id },
      data: { status: InstanceStatus.DELETING },
    });

    // TODO: Trigger reconciler for cleanup
  }
}