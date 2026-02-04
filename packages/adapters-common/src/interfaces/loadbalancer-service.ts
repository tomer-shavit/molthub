/**
 * Load Balancer Service Interface
 *
 * Provides abstraction for load balancer operations across cloud providers.
 * Implemented by AWS ALB/NLB Service, Azure Application Gateway Service,
 * GCP Load Balancer Service, etc.
 */

import type {
  LoadBalancerConfig,
  LoadBalancerResult,
  LoadBalancerEndpoint,
} from "../types/loadbalancer";

/**
 * Interface for managing load balancers across cloud providers.
 */
export interface ILoadBalancerService {
  /**
   * Create a new load balancer.
   *
   * @param name - Load balancer name
   * @param config - Load balancer configuration
   * @returns Load balancer creation result
   */
  createLoadBalancer(
    name: string,
    config: LoadBalancerConfig
  ): Promise<LoadBalancerResult>;

  /**
   * Delete a load balancer and all associated resources.
   *
   * @param name - Load balancer name or ID
   */
  deleteLoadBalancer(name: string): Promise<void>;

  /**
   * Update the backend pool / target group with new targets.
   *
   * @param name - Load balancer name or ID
   * @param targets - Array of target IPs or instance IDs
   */
  updateBackendPool(name: string, targets: string[]): Promise<void>;

  /**
   * Get the public endpoint information for a load balancer.
   *
   * @param name - Load balancer name or ID
   * @returns Load balancer endpoint with DNS name and URL
   */
  getEndpoint(name: string): Promise<LoadBalancerEndpoint>;
}
