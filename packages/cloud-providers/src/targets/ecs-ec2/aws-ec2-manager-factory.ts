/**
 * Factory that wires AWS SDK clients and injects them into managers.
 *
 * Single entry point: `AwsManagerFactory.createManagers(config)`.
 * All SDK clients are created here and shared via constructor injection (DIP).
 */

import { EC2Client } from "@aws-sdk/client-ec2";
import { IAMClient } from "@aws-sdk/client-iam";
import { AwsNetworkManager } from "./managers/aws-network-manager";
import { AwsComputeManager } from "./managers/aws-compute-manager";
import type { IAwsNetworkManager, IAwsComputeManager } from "./managers/interfaces";
import type { AwsLogCallback } from "./types";

/** All managers returned by the factory — typed to interfaces (DIP) */
export interface AwsEc2Managers {
  networkManager: IAwsNetworkManager;
  computeManager: IAwsComputeManager;
}

/** Configuration for the manager factory */
export interface AwsManagerFactoryConfig {
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  log: AwsLogCallback;
}

export class AwsManagerFactory {
  static createManagers(config: AwsManagerFactoryConfig): AwsEc2Managers {
    const { region, credentials, log } = config;
    const clientConfig = { region, credentials };

    const ec2Client = new EC2Client(clientConfig);
    const iamClient = new IAMClient(clientConfig);

    return {
      networkManager: new AwsNetworkManager(ec2Client, iamClient, region, log),
      computeManager: new AwsComputeManager(ec2Client, log),
    };
  }
}
