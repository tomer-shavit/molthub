import { Injectable, NotFoundException } from "@nestjs/common";

export type MiddlewareHook =
  | "onRequest"
  | "onResponse"
  | "onHttpRequest"
  | "onHttpResponse";

export interface MiddlewareRegistryEntry {
  id: string;
  displayName: string;
  version: string;
  description: string;
  hooks: MiddlewareHook[];
  configSchema?: Record<string, unknown>;
  emoji?: string;
}

@Injectable()
export class MiddlewareRegistryService {
  private readonly registry: ReadonlyArray<MiddlewareRegistryEntry> = [
    {
      id: "@clawster/middleware-boom",
      displayName: "BOOM",
      version: "0.1.0",
      description:
        'Appends " BOOM" to every agent completion response. Useful for testing the middleware pipeline end-to-end.',
      hooks: ["onResponse"],
      emoji: "\u{1F4A5}",
    },
  ];

  findAll(): MiddlewareRegistryEntry[] {
    return [...this.registry];
  }

  findById(id: string): MiddlewareRegistryEntry {
    const entry = this.registry.find((m) => m.id === id);
    if (!entry) {
      throw new NotFoundException(`Middleware "${id}" not found in registry`);
    }
    return { ...entry };
  }
}
