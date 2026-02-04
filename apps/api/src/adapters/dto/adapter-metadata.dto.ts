/**
 * DTOs for adapter metadata API responses.
 * These mirror the AdapterMetadata interfaces from @clawster/cloud-providers
 * but are structured as DTOs for API responses.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CredentialRequirementDto {
  @ApiProperty({ description: "Unique key identifier for the credential field" })
  key: string;

  @ApiProperty({ description: "Human-readable display name for the field" })
  displayName: string;

  @ApiProperty({ description: "Help text describing what this credential is for" })
  description: string;

  @ApiProperty({ description: "Whether this credential is required" })
  required: boolean;

  @ApiProperty({ description: "Whether this is a sensitive value (should be masked in UI)" })
  sensitive: boolean;

  @ApiPropertyOptional({ description: "Optional regex pattern for validation" })
  pattern?: string;
}

export class AdapterCapabilitiesDto {
  @ApiProperty({ description: "Supports updateResources() for CPU/memory scaling" })
  scaling: boolean;

  @ApiProperty({ description: "Supports Docker-in-Docker sandbox mode" })
  sandbox: boolean;

  @ApiProperty({ description: "Has persistent storage for WhatsApp sessions, etc." })
  persistentStorage: boolean;

  @ApiProperty({ description: "Provides HTTPS endpoint (via load balancer, etc.)" })
  httpsEndpoint: boolean;

  @ApiProperty({ description: "Supports real-time log streaming" })
  logStreaming: boolean;
}

export class TierSpecDto {
  @ApiProperty({ description: "Tier identifier (light, standard, performance)" })
  tier: string;

  @ApiProperty({ description: "CPU allocation in provider units" })
  cpu: number;

  @ApiProperty({ description: "Memory allocation in MiB" })
  memory: number;

  @ApiProperty({ description: "Data disk size in GB" })
  dataDiskSizeGb: number;

  @ApiPropertyOptional({ description: "GCE machine type (e.g., e2-medium)" })
  machineType?: string;

  @ApiPropertyOptional({ description: "Azure VM size (e.g., Standard_B2s)" })
  vmSize?: string;
}

export class AdapterMetadataDto {
  @ApiProperty({ description: "Unique type identifier (e.g., docker, ecs-ec2)" })
  type: string;

  @ApiProperty({ description: "Display name for UI (e.g., AWS ECS EC2)" })
  displayName: string;

  @ApiProperty({ description: "Icon identifier for UI (e.g., aws, docker)" })
  icon: string;

  @ApiProperty({ description: "Short description for UI" })
  description: string;

  @ApiProperty({
    enum: ["ready", "beta", "coming_soon"],
    description: "Current implementation status",
  })
  status: "ready" | "beta" | "coming_soon";

  @ApiProperty({ type: AdapterCapabilitiesDto, description: "Capabilities supported by this adapter" })
  capabilities: AdapterCapabilitiesDto;

  @ApiProperty({ type: [CredentialRequirementDto], description: "Credentials required to use this adapter" })
  credentials: CredentialRequirementDto[];

  @ApiPropertyOptional({
    description: "Resource tier specifications (light, standard, performance)",
    type: "object",
    additionalProperties: { $ref: "#/components/schemas/TierSpecDto" },
  })
  tierSpecs?: Record<string, TierSpecDto>;
}
