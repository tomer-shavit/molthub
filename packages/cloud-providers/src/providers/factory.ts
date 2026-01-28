import {
  CloudProvider,
  CloudProviderConfig,
  CloudProviderType,
} from "../interface/provider";
import { AWSProvider, AWSProviderConfig } from "./aws/aws-provider";
import { AzureProvider, AzureConfig } from "./azure/azure-provider";
import { GCPProvider, GCPConfig } from "./gcp/gcp-provider";
import { DigitalOceanProvider, DigitalOceanConfig } from "./digitalocean/digitalocean-provider";
import { SelfHostedProvider, SelfHostedConfig } from "./selfhosted/selfhosted-provider";
import { SimulatedProvider, SimulatedConfig } from "./simulated/simulated-provider";

export type ProviderConfig =
  | AWSProviderConfig
  | AzureConfig
  | GCPConfig
  | DigitalOceanConfig
  | SelfHostedConfig
  | SimulatedConfig;

export class CloudProviderFactory {
  static createProvider(type: CloudProviderType | "simulated"): CloudProvider {
    switch (type) {
      case "aws":
        return new AWSProvider();
      case "azure":
        return new AzureProvider();
      case "gcp":
        return new GCPProvider();
      case "digitalocean":
        return new DigitalOceanProvider();
      case "selfhosted":
        return new SelfHostedProvider();
      case "simulated":
        return new SimulatedProvider();
      default:
        throw new Error(`Unknown cloud provider type: ${type}`);
    }
  }

  static async createAndInitialize(
    type: CloudProviderType,
    config: CloudProviderConfig
  ): Promise<CloudProvider> {
    const provider = this.createProvider(type);
    await provider.initialize(config);
    return provider;
  }

  static getAvailableProviders(): { type: CloudProviderType | "simulated"; name: string; status: "ready" | "beta" | "coming_soon" }[] {
    return [
      { type: "aws", name: "Amazon Web Services (ECS Fargate)", status: "ready" },
      { type: "selfhosted", name: "Self-Hosted (Docker)", status: "ready" },
      { type: "simulated", name: "Simulated (Testing Mode)", status: "ready" },
      { type: "azure", name: "Microsoft Azure (Container Apps)", status: "coming_soon" },
      { type: "gcp", name: "Google Cloud (Cloud Run)", status: "coming_soon" },
      { type: "digitalocean", name: "DigitalOcean (App Platform)", status: "coming_soon" },
    ];
  }

  static isProviderReady(type: CloudProviderType | "simulated"): boolean {
    return type === "aws" || type === "selfhosted" || type === "simulated";
  }
}