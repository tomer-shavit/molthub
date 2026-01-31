import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma, Prisma, ManifestVersion } from "@molthub/database";
import { PolicyEngine, InstanceManifest } from "@molthub/core";
import { CreateManifestDto } from "./manifests.dto";

@Injectable()
export class ManifestsService {
  private readonly policyEngine = new PolicyEngine();

  async findAll(instanceId: string): Promise<ManifestVersion[]> {
    return prisma.manifestVersion.findMany({
      where: { instanceId },
      orderBy: { version: "desc" },
    });
  }

  async getLatest(instanceId: string): Promise<ManifestVersion> {
    const manifest = await prisma.manifestVersion.findFirst({
      where: { instanceId },
      orderBy: { version: "desc" },
    });

    if (!manifest) {
      throw new NotFoundException(`No manifests found for instance ${instanceId}`);
    }

    return manifest;
  }

  async create(instanceId: string, dto: CreateManifestDto): Promise<ManifestVersion> {
    // Validate instance exists
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new NotFoundException(`Instance ${instanceId} not found`);
    }

    // Validate manifest against schema and policies
    const policyResult = this.policyEngine.validate(dto.content);
    
    if (!policyResult.valid) {
      const errors = policyResult.violations
        .filter(v => v.severity === "ERROR")
        .map(v => `${v.code}: ${v.message}`)
        .join("; ");
      
      throw new BadRequestException(`Policy validation failed: ${errors}`);
    }

    // Get next version number
    const latest = await prisma.manifestVersion.findFirst({
      where: { instanceId },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latest?.version || 0) + 1;

    // Create manifest version
    const manifest = await prisma.manifestVersion.create({
      data: {
        instanceId,
        version: nextVersion,
        content: JSON.stringify(dto.content),
        createdBy: "system", // TODO: Get from auth context
      },
    });

    // Update instance to point to new manifest
    await prisma.instance.update({
      where: { id: instanceId },
      data: { 
        desiredManifestId: manifest.id,
        status: "CREATING",
      },
    });

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        actor: "system",
        action: "MANIFEST_CREATE",
        resourceType: "Instance",
        resourceId: instanceId,
        diffSummary: dto.description || `Created manifest version ${nextVersion}`,
        workspaceId: instance.workspaceId,
      },
    });

    return manifest;
  }

  async triggerReconcile(instanceId: string): Promise<void> {
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new NotFoundException(`Instance ${instanceId} not found`);
    }

    if (!instance.desiredManifestId) {
      throw new BadRequestException("No desired manifest set for instance");
    }

    // TODO: Queue reconcile job
    await prisma.instance.update({
      where: { id: instanceId },
      data: { 
        status: "CREATING",
        lastReconcileAt: new Date(),
      },
    });
  }
}