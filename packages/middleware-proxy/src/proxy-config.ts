import { z } from "zod";

export const MiddlewareConfigEntrySchema = z.object({
  package: z.string(),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
});

export const ProxyConfigSchema = z.object({
  externalPort: z.number().int().min(1).max(65535).default(18789),
  internalPort: z.number().int().min(1).max(65535).default(18790),
  internalHost: z.string().default("127.0.0.1"),
  middlewares: z.array(MiddlewareConfigEntrySchema).default([]),
});

export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
export type MiddlewareConfigEntry = z.infer<typeof MiddlewareConfigEntrySchema>;
