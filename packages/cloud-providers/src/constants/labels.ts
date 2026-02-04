/**
 * Standard labels/tags for cloud resources.
 */

export const LABEL_PREFIX = "clawster";

export const RESOURCE_LABELS = {
  MANAGED_BY: `${LABEL_PREFIX}/managed-by`,
  INSTANCE_NAME: `${LABEL_PREFIX}/instance-name`,
  WORKSPACE: `${LABEL_PREFIX}/workspace`,
  FLEET_ID: `${LABEL_PREFIX}/fleet-id`,
  ENVIRONMENT: `${LABEL_PREFIX}/environment`,
  VERSION: `${LABEL_PREFIX}/version`,
} as const;

export const MANAGED_BY_VALUE = "clawster";
