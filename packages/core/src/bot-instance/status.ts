/**
 * Bot Instance Status Enums
 *
 * Status and health enums for bot instances.
 * Extracted to avoid circular dependencies with fleet.ts.
 */

import { z } from "zod";

/**
 * Bot instance operational status.
 */
export const BotStatus = z.enum([
  "CREATING",
  "PENDING",
  "RUNNING",
  "DEGRADED",
  "STOPPED",
  "PAUSED",
  "DELETING",
  "ERROR",
  "RECONCILING"
]);

export type BotStatus = z.infer<typeof BotStatus>;

/**
 * Bot instance health status.
 */
export const BotHealth = z.enum(["HEALTHY", "UNHEALTHY", "UNKNOWN", "DEGRADED"]);

export type BotHealth = z.infer<typeof BotHealth>;
