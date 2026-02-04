/**
 * GCE Load Balancer Manager
 *
 * Manages load balancer components including security policies, backend services,
 * URL maps, HTTP/HTTPS proxies, and forwarding rules.
 */

import {
  BackendServicesClient,
  UrlMapsClient,
  TargetHttpProxiesClient,
  TargetHttpsProxiesClient,
  GlobalForwardingRulesClient,
  SecurityPoliciesClient,
} from "@google-cloud/compute";
import type { LoadBalancerNames, GceLogCallback } from "../types";
import type { IGceLoadBalancerManager, IGceOperationManager } from "./interfaces";

/**
 * Manages GCE load balancer resources.
 */
export class GceLoadBalancerManager implements IGceLoadBalancerManager {
  constructor(
    private readonly backendServicesClient: BackendServicesClient,
    private readonly urlMapsClient: UrlMapsClient,
    private readonly httpProxiesClient: TargetHttpProxiesClient,
    private readonly httpsProxiesClient: TargetHttpsProxiesClient,
    private readonly forwardingRulesClient: GlobalForwardingRulesClient,
    private readonly securityPoliciesClient: SecurityPoliciesClient,
    private readonly operationManager: IGceOperationManager,
    private readonly project: string,
    private readonly zone: string,
    private readonly log: GceLogCallback
  ) {}

  /**
   * Ensure a Cloud Armor security policy exists.
   *
   * @param name - Security policy name
   * @param allowedCidrs - Allowed IP CIDR ranges
   * @returns Security policy self-link URL
   */
  async ensureSecurityPolicy(name: string, allowedCidrs: string[]): Promise<string> {
    try {
      const [policy] = await this.securityPoliciesClient.get({
        project: this.project,
        securityPolicy: name,
      });
      return policy.selfLink ?? "";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const rules = allowedCidrs.map((cidr, index) => ({
          priority: 1000 + index,
          match: {
            versionedExpr: "SRC_IPS_V1" as const,
            config: {
              srcIpRanges: [cidr],
            },
          },
          action: "allow",
          description: `Allow traffic from ${cidr}`,
        }));

        rules.push({
          priority: 2147483647,
          match: {
            versionedExpr: "SRC_IPS_V1" as const,
            config: {
              srcIpRanges: ["*"],
            },
          },
          action: "deny(403)",
          description: "Deny all other traffic",
        });

        const [operation] = await this.securityPoliciesClient.insert({
          project: this.project,
          securityPolicyResource: {
            name,
            description: `Cloud Armor policy for Clawster`,
            rules,
          },
        });
        await this.operationManager.waitForOperation(operation, "global", {
          description: "create security policy",
        });

        const [policy] = await this.securityPoliciesClient.get({
          project: this.project,
          securityPolicy: name,
        });
        return policy.selfLink ?? "";
      }
      throw error;
    }
  }

  /**
   * Ensure a backend service exists.
   *
   * @param name - Backend service name
   * @param instanceGroupUrl - URL of the instance group
   * @param securityPolicyName - Optional security policy name to attach
   * @returns Backend service self-link URL
   */
  async ensureBackendService(
    name: string,
    instanceGroupUrl: string,
    securityPolicyName?: string
  ): Promise<string> {
    try {
      const [service] = await this.backendServicesClient.get({
        project: this.project,
        backendService: name,
      });
      return service.selfLink ?? "";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const backendService: Record<string, unknown> = {
          name,
          description: `Backend service for Clawster`,
          backends: [
            {
              group: instanceGroupUrl,
              balancingMode: "UTILIZATION",
              maxUtilization: 0.8,
            },
          ],
          protocol: "HTTP",
          portName: "http",
          healthChecks: [],
          loadBalancingScheme: "EXTERNAL_MANAGED",
        };

        if (securityPolicyName) {
          backendService.securityPolicy = `https://www.googleapis.com/compute/v1/projects/${this.project}/global/securityPolicies/${securityPolicyName}`;
        }

        const [operation] = await this.backendServicesClient.insert({
          project: this.project,
          backendServiceResource: backendService,
        });
        await this.operationManager.waitForOperation(operation, "global", {
          description: "create backend service",
        });

        const [service] = await this.backendServicesClient.get({
          project: this.project,
          backendService: name,
        });
        return service.selfLink ?? "";
      }
      throw error;
    }
  }

  /**
   * Ensure a URL map exists.
   *
   * @param name - URL map name
   * @param backendServiceUrl - URL of the backend service
   * @returns URL map self-link URL
   */
  async ensureUrlMap(name: string, backendServiceUrl: string): Promise<string> {
    try {
      const [urlMap] = await this.urlMapsClient.get({
        project: this.project,
        urlMap: name,
      });
      return urlMap.selfLink ?? "";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const [operation] = await this.urlMapsClient.insert({
          project: this.project,
          urlMapResource: {
            name,
            description: `URL map for Clawster`,
            defaultService: backendServiceUrl,
          },
        });
        await this.operationManager.waitForOperation(operation, "global", {
          description: "create URL map",
        });

        const [urlMap] = await this.urlMapsClient.get({
          project: this.project,
          urlMap: name,
        });
        return urlMap.selfLink ?? "";
      }
      throw error;
    }
  }

  /**
   * Ensure an HTTP proxy exists.
   *
   * @param name - HTTP proxy name
   * @param urlMapUrl - URL of the URL map
   * @returns HTTP proxy self-link URL
   */
  async ensureHttpProxy(name: string, urlMapUrl: string): Promise<string> {
    try {
      const [proxy] = await this.httpProxiesClient.get({
        project: this.project,
        targetHttpProxy: name,
      });
      return proxy.selfLink ?? "";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const [operation] = await this.httpProxiesClient.insert({
          project: this.project,
          targetHttpProxyResource: {
            name,
            description: `HTTP proxy for Clawster`,
            urlMap: urlMapUrl,
          },
        });
        await this.operationManager.waitForOperation(operation, "global", {
          description: "create HTTP proxy",
        });

        const [proxy] = await this.httpProxiesClient.get({
          project: this.project,
          targetHttpProxy: name,
        });
        return proxy.selfLink ?? "";
      }
      throw error;
    }
  }

  /**
   * Ensure an HTTPS proxy exists.
   *
   * @param name - HTTPS proxy name
   * @param urlMapUrl - URL of the URL map
   * @param sslCertId - SSL certificate ID
   * @returns HTTPS proxy self-link URL
   */
  async ensureHttpsProxy(
    name: string,
    urlMapUrl: string,
    sslCertId: string
  ): Promise<string> {
    try {
      const [proxy] = await this.httpsProxiesClient.get({
        project: this.project,
        targetHttpsProxy: name,
      });
      return proxy.selfLink ?? "";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const [operation] = await this.httpsProxiesClient.insert({
          project: this.project,
          targetHttpsProxyResource: {
            name,
            description: `HTTPS proxy for Clawster`,
            urlMap: urlMapUrl,
            sslCertificates: [sslCertId],
          },
        });
        await this.operationManager.waitForOperation(operation, "global", {
          description: "create HTTPS proxy",
        });

        const [proxy] = await this.httpsProxiesClient.get({
          project: this.project,
          targetHttpsProxy: name,
        });
        return proxy.selfLink ?? "";
      }
      throw error;
    }
  }

  /**
   * Ensure a forwarding rule exists.
   *
   * @param name - Forwarding rule name
   * @param proxyUrl - URL of the target proxy
   * @param ipAddressName - Name of the external IP address
   * @param port - Port number (80 or 443)
   * @returns Forwarding rule self-link URL
   */
  async ensureForwardingRule(
    name: string,
    proxyUrl: string,
    ipAddressName: string,
    port: number
  ): Promise<string> {
    try {
      const [rule] = await this.forwardingRulesClient.get({
        project: this.project,
        forwardingRule: name,
      });
      return rule.selfLink ?? "";
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        const ipSelfLink = `https://www.googleapis.com/compute/v1/projects/${this.project}/global/addresses/${ipAddressName}`;

        const [operation] = await this.forwardingRulesClient.insert({
          project: this.project,
          forwardingRuleResource: {
            name,
            description: `Forwarding rule for Clawster`,
            IPAddress: ipSelfLink,
            IPProtocol: "TCP",
            portRange: String(port),
            target: proxyUrl,
            loadBalancingScheme: "EXTERNAL_MANAGED",
            networkTier: "PREMIUM",
          },
        });
        await this.operationManager.waitForOperation(operation, "global", {
          description: "create forwarding rule",
        });

        const [rule] = await this.forwardingRulesClient.get({
          project: this.project,
          forwardingRule: name,
        });
        return rule.selfLink ?? "";
      }
      throw error;
    }
  }

  /**
   * Destroy all load balancer resources in reverse dependency order.
   */
  async destroyLoadBalancer(
    names: LoadBalancerNames,
    sslEnabled: boolean
  ): Promise<void> {
    // 1. Delete forwarding rule
    this.log(`Deleting forwarding rule: ${names.forwardingRule}`, "stdout");
    await this.deleteForwardingRule(names.forwardingRule);

    // 2. Delete HTTP(S) proxy
    if (sslEnabled) {
      this.log(`Deleting HTTPS proxy: ${names.httpsProxy}`, "stdout");
      await this.deleteHttpsProxy(names.httpsProxy);
    } else {
      this.log(`Deleting HTTP proxy: ${names.httpProxy}`, "stdout");
      await this.deleteHttpProxy(names.httpProxy);
    }

    // 3. Delete URL map
    this.log(`Deleting URL map: ${names.urlMap}`, "stdout");
    await this.deleteUrlMap(names.urlMap);

    // 4. Delete backend service
    this.log(`Deleting backend service: ${names.backendService}`, "stdout");
    await this.deleteBackendService(names.backendService);

    // 5. Delete security policy
    this.log(`Deleting security policy: ${names.securityPolicy}`, "stdout");
    await this.deleteSecurityPolicy(names.securityPolicy);
  }

  private async deleteForwardingRule(name: string): Promise<void> {
    try {
      const [operation] = await this.forwardingRulesClient.delete({
        project: this.project,
        forwardingRule: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete forwarding rule",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  private async deleteHttpProxy(name: string): Promise<void> {
    try {
      const [operation] = await this.httpProxiesClient.delete({
        project: this.project,
        targetHttpProxy: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete HTTP proxy",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  private async deleteHttpsProxy(name: string): Promise<void> {
    try {
      const [operation] = await this.httpsProxiesClient.delete({
        project: this.project,
        targetHttpsProxy: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete HTTPS proxy",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  private async deleteUrlMap(name: string): Promise<void> {
    try {
      const [operation] = await this.urlMapsClient.delete({
        project: this.project,
        urlMap: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete URL map",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  private async deleteBackendService(name: string): Promise<void> {
    try {
      const [operation] = await this.backendServicesClient.delete({
        project: this.project,
        backendService: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete backend service",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  private async deleteSecurityPolicy(name: string): Promise<void> {
    try {
      const [operation] = await this.securityPoliciesClient.delete({
        project: this.project,
        securityPolicy: name,
      });
      await this.operationManager.waitForOperation(operation, "global", {
        description: "delete security policy",
      });
    } catch (error: unknown) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("NOT_FOUND") || error.message.includes("404"))
    );
  }
}
