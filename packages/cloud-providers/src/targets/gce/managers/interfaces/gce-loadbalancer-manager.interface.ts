/**
 * GCE Load Balancer Manager Interface
 *
 * Provides abstraction for load balancer components including security policies,
 * backend services, URL maps, HTTP/HTTPS proxies, and forwarding rules.
 * Enables dependency injection for testing and modularity.
 */

import type { LoadBalancerNames } from "../../types";

/**
 * Interface for managing GCE load balancer resources.
 */
export interface IGceLoadBalancerManager {
  /**
   * Ensure a Cloud Armor security policy exists.
   *
   * @param name - Security policy name
   * @param allowedCidrs - Allowed IP CIDR ranges
   * @returns Security policy self-link URL
   */
  ensureSecurityPolicy(name: string, allowedCidrs: string[]): Promise<string>;

  /**
   * Ensure a backend service exists.
   *
   * @param name - Backend service name
   * @param instanceGroupUrl - URL of the instance group
   * @param securityPolicyName - Optional security policy name to attach
   * @returns Backend service self-link URL
   */
  ensureBackendService(
    name: string,
    instanceGroupUrl: string,
    securityPolicyName?: string
  ): Promise<string>;

  /**
   * Ensure a URL map exists.
   *
   * @param name - URL map name
   * @param backendServiceUrl - URL of the backend service
   * @returns URL map self-link URL
   */
  ensureUrlMap(name: string, backendServiceUrl: string): Promise<string>;

  /**
   * Ensure an HTTP proxy exists.
   *
   * @param name - HTTP proxy name
   * @param urlMapUrl - URL of the URL map
   * @returns HTTP proxy self-link URL
   */
  ensureHttpProxy(name: string, urlMapUrl: string): Promise<string>;

  /**
   * Ensure an HTTPS proxy exists.
   *
   * @param name - HTTPS proxy name
   * @param urlMapUrl - URL of the URL map
   * @param sslCertId - SSL certificate ID
   * @returns HTTPS proxy self-link URL
   */
  ensureHttpsProxy(name: string, urlMapUrl: string, sslCertId: string): Promise<string>;

  /**
   * Ensure a forwarding rule exists.
   *
   * @param name - Forwarding rule name
   * @param proxyUrl - URL of the target proxy
   * @param ipAddressName - Name of the external IP address
   * @param port - Port number (80 or 443)
   * @returns Forwarding rule self-link URL
   */
  ensureForwardingRule(
    name: string,
    proxyUrl: string,
    ipAddressName: string,
    port: number
  ): Promise<string>;

  /**
   * Destroy all load balancer resources in reverse dependency order.
   *
   * @param names - Names of all load balancer resources
   * @param sslEnabled - Whether SSL is enabled (determines HTTP vs HTTPS proxy deletion)
   */
  destroyLoadBalancer(names: LoadBalancerNames, sslEnabled: boolean): Promise<void>;
}
