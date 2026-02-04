/**
 * Timeout constants for cloud operations.
 */

/** Maximum time to wait for any single operation (10 minutes) */
export const OPERATION_TIMEOUT_MS = 600_000;

/** Polling interval for checking operation status */
export const OPERATION_POLL_INTERVAL_MS = 5_000;

/** Polling interval for CloudFormation stack status */
export const STACK_POLL_INTERVAL_MS = 10_000;

/** Timeout for CloudFormation stack operations (30 minutes) */
export const CLOUDFORMATION_TIMEOUT_MS = 1_800_000;

/** Timeout for GCE operation completion (15 minutes) */
export const GCE_OPERATION_TIMEOUT_MS = 900_000;

/** Timeout for Azure resource provisioning (20 minutes) */
export const AZURE_PROVISIONING_TIMEOUT_MS = 1_200_000;

/** Default container startup timeout */
export const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;

/** Gateway connection timeout */
export const GATEWAY_CONNECTION_TIMEOUT_MS = 30_000;
