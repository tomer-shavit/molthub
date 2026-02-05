/**
 * Injection tokens for the Reconciler module.
 *
 * These symbols are used as providers in NestJS dependency injection
 * to decouple service implementations from their consumers.
 */

/**
 * Injection token for IGatewayManager.
 * Use this to inject the gateway manager instead of direct instantiation.
 */
export const GATEWAY_MANAGER = Symbol("GATEWAY_MANAGER");

/**
 * Injection token for ILifecycleManager.
 * Use this to inject the lifecycle manager interface for strategy pattern.
 */
export const LIFECYCLE_MANAGER = Symbol("LIFECYCLE_MANAGER");
