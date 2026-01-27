import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, Template } from "@molthub/database";
import { CreateTemplateDto } from "./templates.dto";

const BUILTIN_TEMPLATES: CreateTemplateDto[] = [
  {
    name: "Slack Bot",
    description: "A Moltbot configured for Slack with allowlisted skills",
    category: "chat",
    manifestTemplate: {
      apiVersion: "molthub/v1",
      kind: "MoltbotInstance",
      metadata: {
        environment: "dev",
        labels: {},
      },
      spec: {
        runtime: {
          image: "ghcr.io/clawdbot/clawdbot:v0.1.0",
          cpu: 0.5,
          memory: 1024,
          replicas: 1,
        },
        secrets: [],
        channels: [
          {
            type: "slack",
            enabled: true,
            secretRef: {
              name: "slack-token",
              provider: "aws-secrets-manager",
              key: "SLACK_BOT_TOKEN",
            },
          },
        ],
        skills: {
          mode: "ALLOWLIST",
          allowlist: ["weather", "github"],
        },
        network: {
          inbound: "NONE",
          egressPreset: "RESTRICTED",
        },
        observability: {
          logLevel: "info",
          tracing: false,
        },
        policies: {
          forbidPublicAdmin: true,
          requireSecretManager: true,
        },
      },
    },
  },
  {
    name: "Webhook Bot",
    description: "A Moltbot configured to receive webhooks",
    category: "webhook",
    manifestTemplate: {
      apiVersion: "molthub/v1",
      kind: "MoltbotInstance",
      metadata: {
        environment: "dev",
        labels: {},
      },
      spec: {
        runtime: {
          image: "ghcr.io/clawdbot/clawdbot:v0.1.0",
          cpu: 0.5,
          memory: 1024,
          replicas: 1,
        },
        secrets: [],
        channels: [
          {
            type: "webhook",
            enabled: true,
            secretRef: {
              name: "webhook-secret",
              provider: "aws-secrets-manager",
              key: "WEBHOOK_SECRET",
            },
            config: {
              verifyToken: true,
            },
          },
        ],
        skills: {
          mode: "ALLOWLIST",
          allowlist: ["webhook-handler"],
        },
        network: {
          inbound: "WEBHOOK",
          egressPreset: "RESTRICTED",
        },
        observability: {
          logLevel: "info",
          tracing: false,
        },
        policies: {
          forbidPublicAdmin: true,
          requireSecretManager: true,
        },
      },
    },
  },
  {
    name: "Minimal Bot",
    description: "A minimal Moltbot with no channels (API-only)",
    category: "minimal",
    manifestTemplate: {
      apiVersion: "molthub/v1",
      kind: "MoltbotInstance",
      metadata: {
        environment: "dev",
        labels: {},
      },
      spec: {
        runtime: {
          image: "ghcr.io/clawdbot/clawdbot:v0.1.0",
          cpu: 0.25,
          memory: 512,
          replicas: 1,
        },
        secrets: [],
        channels: [],
        skills: {
          mode: "ALLOWLIST",
          allowlist: [],
        },
        network: {
          inbound: "NONE",
          egressPreset: "RESTRICTED",
        },
        observability: {
          logLevel: "warn",
          tracing: false,
        },
        policies: {
          forbidPublicAdmin: true,
          requireSecretManager: true,
        },
      },
    },
  },
];

@Injectable()
export class TemplatesService {
  async findAll(): Promise<Template[]> {
    // Get builtin templates (virtual) + database templates
    const dbTemplates = await prisma.template.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Create virtual templates for builtins
    const builtinVirtualTemplates = BUILTIN_TEMPLATES.map((t, i) => ({
      id: `builtin-${i}`,
      ...t,
      isBuiltin: true,
      workspaceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    return [...builtinVirtualTemplates, ...dbTemplates];
  }

  async findOne(id: string): Promise<Template> {
    // Check if it's a builtin template
    if (id.startsWith("builtin-")) {
      const index = parseInt(id.replace("builtin-", ""));
      const template = BUILTIN_TEMPLATES[index];
      if (!template) {
        throw new NotFoundException(`Template ${id} not found`);
      }
      return {
        id,
        ...template,
        isBuiltin: true,
        workspaceId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Template;
    }

    const template = await prisma.template.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    return template;
  }

  async create(dto: CreateTemplateDto): Promise<Template> {
    return prisma.template.create({
      data: {
        ...dto,
        isBuiltin: false,
        workspaceId: "default",
      },
    });
  }
}