/**
 * Debug domain client.
 * Handles introspection and diagnostics.
 */

import { BaseHttpClient } from '../base-client';
import type {
  DebugProcessInfo,
  DebugGatewayProbeResult,
  DebugRedactedConfig,
  DebugEnvVarStatus,
  DebugFileInfo,
  DebugConnectivityResult,
} from '../types/debug';

export class DebugClient extends BaseHttpClient {
  /**
   * Get running processes for an instance.
   */
  getProcesses(instanceId: string): Promise<DebugProcessInfo[]> {
    return this.get(`/bot-instances/${instanceId}/debug/processes`);
  }

  /**
   * Probe the gateway for an instance.
   */
  probeGateway(instanceId: string): Promise<DebugGatewayProbeResult> {
    return this.get(`/bot-instances/${instanceId}/debug/gateway-probe`);
  }

  /**
   * Get redacted config for an instance.
   */
  getConfig(instanceId: string): Promise<DebugRedactedConfig> {
    return this.get(`/bot-instances/${instanceId}/debug/config`);
  }

  /**
   * Get environment variable status for an instance.
   */
  getEnvStatus(instanceId: string): Promise<DebugEnvVarStatus[]> {
    return this.get(`/bot-instances/${instanceId}/debug/env`);
  }

  /**
   * Get state files for an instance.
   */
  getStateFiles(instanceId: string): Promise<DebugFileInfo[]> {
    return this.get(`/bot-instances/${instanceId}/debug/state-files`);
  }

  /**
   * Test connectivity for an instance.
   */
  testConnectivity(instanceId: string): Promise<DebugConnectivityResult> {
    return this.get(`/bot-instances/${instanceId}/debug/connectivity`);
  }
}

export const debugClient = new DebugClient();
