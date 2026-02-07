import { z } from "zod";

/**
 * Shared key validation: starts with letter, alphanumeric + underscore + hyphen, 1-128 chars.
 */
export const SecretKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z][A-Za-z0-9_-]*$/,
    "Key must start with a letter and contain only alphanumeric characters, underscores, or hyphens",
  );

/**
 * Zod schema for vault secret store request.
 * Value: 1-65536 chars (64KB max).
 */
export const StoreSecretSchema = z.object({
  key: SecretKeySchema,
  value: z.string().min(1).max(65536),
});

export type StoreSecretDto = z.infer<typeof StoreSecretSchema>;
