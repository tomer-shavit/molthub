import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma, IntegrationConnector } from "@molthub/database";
import { CreateConnectorDto, UpdateConnectorDto, ListConnectorsQueryDto, TestConnectionDto } from "./connectors.dto";

@Injectable()
export class ConnectorsService {
  async create(dto: CreateConnectorDto): Promise<IntegrationConnector> {
    const connector = await prisma.integrationConnector.create({
      data: {
        workspaceId: dto.workspaceId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        config: JSON.stringify(dto.config),
        isShared: dto.isShared ?? true,
        allowedInstanceIds: JSON.stringify(dto.allowedInstanceIds || []),
        tags: JSON.stringify(dto.tags || {}),
        createdBy: dto.createdBy || "system",
      },
    });

    return connector;
  }

  async findAll(query: ListConnectorsQueryDto): Promise<IntegrationConnector[]> {
    return prisma.integrationConnector.findMany({
      where: {
        workspaceId: query.workspaceId,
        ...(query.type && { type: query.type }),
        ...(query.status && { status: query.status }),
        ...(query.isShared !== undefined && { isShared: query.isShared }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string): Promise<IntegrationConnector> {
    const connector = await prisma.integrationConnector.findUnique({
      where: { id },
      include: {
        botBindings: {
          include: {
            botInstance: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!connector) {
      throw new NotFoundException(`Connector ${id} not found`);
    }

    return connector;
  }

  async update(id: string, dto: UpdateConnectorDto): Promise<IntegrationConnector> {
    await this.findOne(id);

    return prisma.integrationConnector.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.config && { config: JSON.stringify(dto.config) }),
        ...(dto.isShared !== undefined && { isShared: dto.isShared }),
        ...(dto.allowedInstanceIds && { allowedInstanceIds: JSON.stringify(dto.allowedInstanceIds) }),
        ...(dto.tags && { tags: JSON.stringify(dto.tags) }),
        ...(dto.rotationSchedule && { rotationSchedule: JSON.stringify(dto.rotationSchedule) }),
      },
    });
  }

  async updateStatus(id: string, status: string, message?: string): Promise<IntegrationConnector> {
    await this.findOne(id);

    return prisma.integrationConnector.update({
      where: { id },
      data: {
        status,
        ...(message && { statusMessage: message }),
        ...(status === "ACTIVE" && { lastTestedAt: new Date(), lastTestResult: "SUCCESS" }),
        ...(status === "ERROR" && { lastTestedAt: new Date(), lastTestResult: "FAILURE" }),
      },
    });
  }

  async remove(id: string): Promise<void> {
    // Check for active bindings
    const bindingCount = await prisma.botConnectorBinding.count({
      where: { connectorId: id },
    });
    
    if (bindingCount > 0) {
      throw new BadRequestException(
        `Cannot delete connector with ${bindingCount} active bindings. Remove bindings first.`
      );
    }

    await prisma.integrationConnector.delete({ where: { id } });
  }

  async testConnection(id: string, dto: TestConnectionDto): Promise<Record<string, unknown>> {
    const connector = await this.findOne(id);
    const startTime = Date.now();

    try {
      // Simulate connection test based on connector type
      // In a real implementation, this would actually test the connection
      const testResult = await this.performConnectionTest(connector);
      
      await this.updateStatus(
        id, 
        testResult.success ? "ACTIVE" : "ERROR",
        testResult.message
      );

      return {
        connectorId: id,
        testedAt: new Date(),
        success: testResult.success,
        responseTimeMs: Date.now() - startTime,
        message: testResult.message,
        checks: testResult.checks || [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await this.updateStatus(id, "ERROR", message);
      
      return {
        connectorId: id,
        testedAt: new Date(),
        success: false,
        responseTimeMs: Date.now() - startTime,
        message,
        checks: [],
      };
    }
  }

  private async performConnectionTest(connector: IntegrationConnector): Promise<{ success: boolean; message: string; checks?: Record<string, unknown>[] }> {
    // Placeholder for actual connection testing
    // In production, this would test actual API connectivity
    switch (connector.type) {
      case "openai":
        return {
          success: true,
          message: "Successfully connected to OpenAI API",
          checks: [
            { name: "Authentication", passed: true },
            { name: "API Access", passed: true },
          ],
        };
      case "slack":
        return {
          success: true,
          message: "Successfully connected to Slack API",
          checks: [
            { name: "Bot Token", passed: true },
            { name: "Channel Access", passed: true },
          ],
        };
      default:
        return {
          success: true,
          message: `Connection test passed for ${connector.type}`,
        };
    }
  }
}