import { Injectable } from "@nestjs/common";
import { AdapterRegistry } from "@clawster/cloud-providers";
import type { AdapterMetadataDto } from "./dto/adapter-metadata.dto";

@Injectable()
export class AdaptersService {
  /**
   * Get metadata for all registered deployment target adapters.
   * Returns capabilities, credential requirements, and tier specs for each adapter.
   */
  getAllAdapters(): AdapterMetadataDto[] {
    const registry = AdapterRegistry.getInstance();
    const metadata = registry.getAllMetadata();

    // Map to DTOs (strip provisioning steps which are internal details)
    return metadata.map((m) => ({
      type: m.type,
      displayName: m.displayName,
      icon: m.icon,
      description: m.description,
      status: m.status,
      capabilities: m.capabilities,
      credentials: m.credentials,
      tierSpecs: m.tierSpecs
        ? Object.fromEntries(
            Object.entries(m.tierSpecs).map(([tier, spec]) => [
              tier,
              {
                tier,
                cpu: spec.cpu,
                memory: spec.memory,
                dataDiskSizeGb: spec.dataDiskSizeGb,
                machineType: spec.machineType,
                vmSize: spec.vmSize,
              },
            ]),
          )
        : undefined,
    }));
  }
}
