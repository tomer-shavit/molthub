import { describe, it, expect, beforeEach } from 'vitest';
import { validateManifest, InstanceManifestSchema } from '../manifest';
import { 
  createValidManifest, 
  createInvalidManifests,
  resetIdCounter 
} from './fixtures';
import { deepClone } from './utils';

describe('Manifest - Edge Cases and Boundary Conditions', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('apiVersion validation', () => {
    it('rejects empty apiVersion', () => {
      const manifest = createValidManifest();
      (manifest as any).apiVersion = '';
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects apiVersion with wrong format', () => {
      const manifest = createValidManifest();
      (manifest as any).apiVersion = 'molthub-v1';
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('accepts only molthub/v1', () => {
      const manifest = createValidManifest();
      const validVersions = ['molthub/v1'];
      const invalidVersions = ['molthub/v2', 'v1', '1.0', 'molthub'];

      for (const version of validVersions) {
        const testManifest = { ...manifest, apiVersion: version };
        expect(() => validateManifest(testManifest)).not.toThrow();
      }

      for (const version of invalidVersions) {
        const testManifest = { ...manifest, apiVersion: version };
        expect(() => validateManifest(testManifest)).toThrow();
      }
    });
  });

  describe('kind validation', () => {
    it('rejects empty kind', () => {
      const manifest = createValidManifest();
      (manifest as any).kind = '';
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects wrong kind', () => {
      const manifest = createValidManifest();
      (manifest as any).kind = 'Deployment';
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('is case-sensitive for kind', () => {
      const manifest = createValidManifest();
      (manifest as any).kind = 'openclawinstance';
      expect(() => validateManifest(manifest)).toThrow();
    });
  });

  describe('metadata.name validation', () => {
    it('rejects name starting with hyphen', () => {
      const manifest = createValidManifest();
      manifest.metadata.name = '-test-bot';
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects name ending with hyphen', () => {
      const manifest = createValidManifest();
      manifest.metadata.name = 'test-bot-';
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects name with consecutive hyphens', () => {
      const manifest = createValidManifest();
      manifest.metadata.name = 'test--bot';
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects name with special characters', () => {
      const manifest = createValidManifest();
      const invalidNames = [
        'test@bot',
        'test#bot',
        'test$bot',
        'test%bot',
        'test^bot',
        'test&bot',
        'test*bot',
        'test(bot)',
        'test[bot]',
        'test{bot}',
        'test/bot',
        'test\\bot',
        'test|bot',
        'test:bot',
        'test;bot',
        'test"bot',
        "test'bot",
        'test<bot>',
        'test,bot',
        'test.bot',
        'test?bot',
        'test!bot',
        'test`bot',
        'test~bot',
        'test+bot',
        'test=bot',
      ];

      for (const name of invalidNames) {
        manifest.metadata.name = name;
        expect(() => validateManifest(deepClone(manifest))).toThrow();
      }
    });

    it('accepts name with numbers', () => {
      const manifest = createValidManifest();
      manifest.metadata.name = 'bot-123';
      expect(() => validateManifest(manifest)).not.toThrow();
    });

    it('accepts name starting with number', () => {
      const manifest = createValidManifest();
      manifest.metadata.name = '123-bot';
      expect(() => validateManifest(manifest)).not.toThrow();
    });

    it('rejects very long names', () => {
      const manifest = createValidManifest();
      manifest.metadata.name = 'a'.repeat(64);
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('accepts name at maximum length', () => {
      const manifest = createValidManifest();
      manifest.metadata.name = 'a'.repeat(63);
      expect(() => validateManifest(manifest)).not.toThrow();
    });
  });

  describe('metadata.workspace validation', () => {
    it('rejects empty workspace', () => {
      const manifest = createValidManifest();
      manifest.metadata.workspace = '';
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects workspace with invalid characters', () => {
      const manifest = createValidManifest();
      manifest.metadata.workspace = 'my workspace';
      expect(() => validateManifest(manifest)).toThrow();
    });
  });

  describe('metadata.labels validation', () => {
    it('accepts empty labels object', () => {
      const manifest = createValidManifest();
      manifest.metadata.labels = {};
      const result = validateManifest(manifest);
      expect(result.metadata.labels).toEqual({});
    });

    it('accepts valid labels', () => {
      const manifest = createValidManifest();
      manifest.metadata.labels = {
        team: 'platform',
        environment: 'production',
        'app.kubernetes.io/name': 'openclaw',
      };
      const result = validateManifest(manifest);
      expect(result.metadata.labels.team).toBe('platform');
    });

    it('rejects labels with empty keys', () => {
      const manifest = createValidManifest();
      (manifest.metadata.labels as any) = { '': 'value' };
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects too many labels', () => {
      const manifest = createValidManifest();
      const labels: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        labels[`label-${i}`] = `value-${i}`;
      }
      manifest.metadata.labels = labels;
      expect(() => validateManifest(manifest)).toThrow();
    });
  });

  describe('spec.runtime validation', () => {
    describe('image validation', () => {
      it('rejects image without any tag', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.image = 'nginx';
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('rejects image with latest tag', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.image = 'nginx:latest';
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('rejects image with stable tag', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.image = 'nginx:stable';
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('accepts semantic version tags', () => {
        const manifest = createValidManifest();
        const validTags = [
          'v1.0.0',
          'v1.2.3',
          'v0.1.0-alpha',
          'v2.0.0-beta.1',
          '1.0.0',
          '2024.01.15',
        ];

        for (const tag of validTags) {
          manifest.spec.runtime.image = `ghcr.io/openclaw/openclaw:${tag}`;
          expect(() => validateManifest(deepClone(manifest))).not.toThrow();
        }
      });

      it('accepts SHA-based tags', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.image = 'ghcr.io/openclaw/openclaw:sha-abc123';
        const result = validateManifest(manifest);
        expect(result.spec.runtime.image).toBe('ghcr.io/openclaw/openclaw:sha-abc123');
      });

      it('accepts various registry formats', () => {
        const manifest = createValidManifest();
        const validImages = [
          'docker.io/library/nginx:v1.0.0',
          'gcr.io/project/image:v1.0.0',
          '123456789.dkr.ecr.us-east-1.amazonaws.com/repo:v1.0.0',
          'ghcr.io/org/repo/subrepo:v1.0.0',
        ];

        for (const image of validImages) {
          manifest.spec.runtime.image = image;
          expect(() => validateManifest(deepClone(manifest))).not.toThrow();
        }
      });
    });

    describe('cpu validation', () => {
      it('rejects zero cpu', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.cpu = 0;
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('rejects negative cpu', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.cpu = -0.5;
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('accepts minimum cpu value', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.cpu = 0.25;
        const result = validateManifest(manifest);
        expect(result.spec.runtime.cpu).toBe(0.25);
      });

      it('rejects cpu below minimum', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.cpu = 0.24;
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('accepts fractional cpu values', () => {
        const manifest = createValidManifest();
        const validCpus = [0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16];

        for (const cpu of validCpus) {
          manifest.spec.runtime.cpu = cpu;
          expect(() => validateManifest(deepClone(manifest))).not.toThrow();
        }
      });

      it('rejects very high cpu values', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.cpu = 128;
        expect(() => validateManifest(manifest)).toThrow();
      });
    });

    describe('memory validation', () => {
      it('rejects zero memory', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.memory = 0;
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('rejects negative memory', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.memory = -512;
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('accepts minimum memory value', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.memory = 256;
        const result = validateManifest(manifest);
        expect(result.spec.runtime.memory).toBe(256);
      });

      it('rejects memory below minimum', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.memory = 255;
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('accepts various memory values', () => {
        const manifest = createValidManifest();
        const validMemory = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768];

        for (const memory of validMemory) {
          manifest.spec.runtime.memory = memory;
          expect(() => validateManifest(deepClone(manifest))).not.toThrow();
        }
      });

      it('rejects very high memory values', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.memory = 128000;
        expect(() => validateManifest(manifest)).toThrow();
      });
    });

    describe('replicas validation', () => {
      it('defaults replicas to 1', () => {
        const manifest = createValidManifest();
        delete (manifest.spec.runtime as any).replicas;
        const result = validateManifest(manifest);
        expect(result.spec.runtime.replicas).toBe(1);
      });

      it('rejects zero replicas', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.replicas = 0;
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('rejects negative replicas', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.replicas = -1;
        expect(() => validateManifest(manifest)).toThrow();
      });

      it('accepts various replica counts', () => {
        const manifest = createValidManifest();
        const validReplicas = [1, 2, 3, 5, 10, 50, 100];

        for (const replicas of validReplicas) {
          manifest.spec.runtime.replicas = replicas;
          expect(() => validateManifest(deepClone(manifest))).not.toThrow();
        }
      });

      it('rejects too many replicas', () => {
        const manifest = createValidManifest();
        manifest.spec.runtime.replicas = 1001;
        expect(() => validateManifest(manifest)).toThrow();
      });
    });
  });

  describe('spec.secrets validation', () => {
    it('accepts empty secrets array', () => {
      const manifest = createValidManifest();
      manifest.spec.secrets = [];
      const result = validateManifest(manifest);
      expect(result.spec.secrets).toEqual([]);
    });

    it('accepts valid secret references', () => {
      const manifest = createValidManifest();
      manifest.spec.secrets = [
        { name: 'api-key', provider: 'aws-secrets-manager', key: 'arn' },
        { name: 'db-password', provider: 'aws-secrets-manager', key: 'secret-name' },
      ];
      const result = validateManifest(manifest);
      expect(result.spec.secrets).toHaveLength(2);
    });

    it('rejects duplicate secret names', () => {
      const manifest = createValidManifest();
      manifest.spec.secrets = [
        { name: 'api-key', provider: 'aws-secrets-manager', key: 'arn1' },
        { name: 'api-key', provider: 'aws-secrets-manager', key: 'arn2' },
      ];
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects invalid provider', () => {
      const manifest = createValidManifest();
      manifest.spec.secrets = [
        { name: 'api-key', provider: 'vault', key: 'path' },
      ];
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects secret with empty name', () => {
      const manifest = createValidManifest();
      manifest.spec.secrets = [
        { name: '', provider: 'aws-secrets-manager', key: 'arn' },
      ];
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects secret with plaintext value', () => {
      const manifest = createValidManifest();
      (manifest.spec.secrets as any) = [
        { name: 'password', value: 'secret123' },
      ];
      expect(() => validateManifest(manifest)).toThrow();
    });
  });

  describe('spec.channels validation', () => {
    it('accepts empty channels array', () => {
      const manifest = createValidManifest();
      manifest.spec.channels = [];
      const result = validateManifest(manifest);
      expect(result.spec.channels).toEqual([]);
    });

    it('accepts valid channel configurations', () => {
      const manifest = createValidManifest();
      manifest.spec.channels = [
        {
          type: 'slack',
          enabled: true,
          secretRef: { name: 'slack', provider: 'aws-secrets-manager', key: 'arn' },
        },
        {
          type: 'discord',
          enabled: false,
          secretRef: { name: 'discord', provider: 'aws-secrets-manager', key: 'arn' },
        },
      ];
      const result = validateManifest(manifest);
      expect(result.spec.channels).toHaveLength(2);
    });

    it('rejects duplicate channel types', () => {
      const manifest = createValidManifest();
      manifest.spec.channels = [
        {
          type: 'slack',
          enabled: true,
          secretRef: { name: 'slack1', provider: 'aws-secrets-manager', key: 'arn' },
        },
        {
          type: 'slack',
          enabled: true,
          secretRef: { name: 'slack2', provider: 'aws-secrets-manager', key: 'arn' },
        },
      ];
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('rejects channel without secret reference', () => {
      const manifest = createValidManifest();
      (manifest.spec.channels as any) = [
        { type: 'slack', enabled: true },
      ];
      expect(() => validateManifest(manifest)).toThrow();
    });
  });

  describe('spec.skills validation', () => {
    it('accepts ALLOWLIST mode with non-empty allowlist', () => {
      const manifest = createValidManifest();
      manifest.spec.skills = { mode: 'ALLOWLIST', allowlist: ['weather'] };
      const result = validateManifest(manifest);
      expect(result.spec.skills.mode).toBe('ALLOWLIST');
    });

    it('rejects ALLOWLIST mode with empty allowlist', () => {
      const manifest = createValidManifest();
      manifest.spec.skills = { mode: 'ALLOWLIST', allowlist: [] };
      expect(() => validateManifest(manifest)).toThrow();
    });

    it('accepts DENYLIST mode', () => {
      const manifest = createValidManifest();
      manifest.spec.skills = { mode: 'DENYLIST', denylist: ['admin'] };
      const result = validateManifest(manifest);
      expect(result.spec.skills.mode).toBe('DENYLIST');
    });

    it('accepts ALL mode', () => {
      const manifest = createValidManifest();
      manifest.spec.skills = { mode: 'ALL' };
      const result = validateManifest(manifest);
      expect(result.spec.skills.mode).toBe('ALL');
    });

    it('rejects invalid skill names', () => {
      const manifest = createValidManifest();
      const invalidSkills = [
        'skill with spaces',
        'skill-with-UPPERCASE',
        'skill_with_underscores',
        'skill@symbol',
      ];

      for (const skill of invalidSkills) {
        manifest.spec.skills = { mode: 'ALLOWLIST', allowlist: [skill] };
        expect(() => validateManifest(deepClone(manifest))).toThrow();
      }
    });

    it('accepts valid skill names', () => {
      const manifest = createValidManifest();
      const validSkills = [
        'weather',
        'news-api',
        'database-query',
        'slack-webhook',
        'email-sender',
      ];

      manifest.spec.skills = { mode: 'ALLOWLIST', allowlist: validSkills };
      const result = validateManifest(manifest);
      expect(result.spec.skills.allowlist).toHaveLength(5);
    });
  });

  describe('spec.network validation', () => {
    it('accepts NONE inbound', () => {
      const manifest = createValidManifest();
      manifest.spec.network.inbound = 'NONE';
      const result = validateManifest(manifest);
      expect(result.spec.network.inbound).toBe('NONE');
    });

    it('accepts WEBHOOK inbound', () => {
      const manifest = createValidManifest();
      manifest.spec.network.inbound = 'WEBHOOK';
      const result = validateManifest(manifest);
      expect(result.spec.network.inbound).toBe('WEBHOOK');
    });

    it('accepts PUBLIC inbound', () => {
      const manifest = createValidManifest();
      manifest.spec.network.inbound = 'PUBLIC';
      const result = validateManifest(manifest);
      expect(result.spec.network.inbound).toBe('PUBLIC');
    });

    it('accepts RESTRICTED egress', () => {
      const manifest = createValidManifest();
      manifest.spec.network.egressPreset = 'RESTRICTED';
      const result = validateManifest(manifest);
      expect(result.spec.network.egressPreset).toBe('RESTRICTED');
    });

    it('accepts DEFAULT egress', () => {
      const manifest = createValidManifest();
      manifest.spec.network.egressPreset = 'DEFAULT';
      const result = validateManifest(manifest);
      expect(result.spec.network.egressPreset).toBe('DEFAULT');
    });

    it('accepts NONE egress', () => {
      const manifest = createValidManifest();
      manifest.spec.network.egressPreset = 'NONE';
      const result = validateManifest(manifest);
      expect(result.spec.network.egressPreset).toBe('NONE');
    });
  });

  describe('spec.observability validation', () => {
    it('accepts valid log levels', () => {
      const manifest = createValidManifest();
      const validLevels = ['debug', 'info', 'warn', 'error'];

      for (const level of validLevels) {
        manifest.spec.observability.logLevel = level as any;
        expect(() => validateManifest(deepClone(manifest))).not.toThrow();
      }
    });

    it('rejects invalid log levels', () => {
      const manifest = createValidManifest();
      const invalidLevels = ['verbose', 'trace', 'fatal', ''];

      for (const level of invalidLevels) {
        manifest.spec.observability.logLevel = level as any;
        expect(() => validateManifest(deepClone(manifest))).toThrow();
      }
    });

    it('accepts tracing enabled', () => {
      const manifest = createValidManifest();
      manifest.spec.observability.tracing = true;
      const result = validateManifest(manifest);
      expect(result.spec.observability.tracing).toBe(true);
    });

    it('accepts tracing disabled', () => {
      const manifest = createValidManifest();
      manifest.spec.observability.tracing = false;
      const result = validateManifest(manifest);
      expect(result.spec.observability.tracing).toBe(false);
    });
  });

  describe('complex scenarios', () => {
    it('validates complete production manifest', () => {
      const manifest = {
        apiVersion: 'molthub/v1',
        kind: 'OpenClawInstance',
        metadata: {
          name: 'customer-service-bot',
          workspace: 'production',
          environment: 'prod',
          labels: {
            team: 'customer-success',
            'cost-center': 'support',
            tier: 'critical',
          },
        },
        spec: {
          runtime: {
            image: 'ghcr.io/openclaw/openclaw:v2.1.0',
            cpu: 2,
            memory: 4096,
            replicas: 3,
          },
          secrets: [
            { name: 'openai-api-key', provider: 'aws-secrets-manager', key: 'arn' },
            { name: 'slack-bot-token', provider: 'aws-secrets-manager', key: 'arn' },
          ],
          channels: [
            {
              type: 'slack',
              enabled: true,
              secretRef: { name: 'slack-bot-token', provider: 'aws-secrets-manager', key: 'arn' },
            },
          ],
          skills: {
            mode: 'ALLOWLIST',
            allowlist: ['customer-search', 'ticket-create', 'knowledge-base'],
          },
          network: {
            inbound: 'WEBHOOK',
            egressPreset: 'RESTRICTED',
          },
          observability: {
            logLevel: 'info',
            tracing: true,
          },
          policies: {
            forbidPublicAdmin: true,
            requireSecretManager: true,
          },
        },
      };

      const result = validateManifest(manifest);
      expect(result.metadata.name).toBe('customer-service-bot');
      expect(result.spec.runtime.replicas).toBe(3);
    });

    it('validates minimal development manifest', () => {
      const manifest = {
        apiVersion: 'molthub/v1',
        kind: 'OpenClawInstance',
        metadata: {
          name: 'dev-bot',
          workspace: 'default',
          environment: 'dev',
          labels: {},
        },
        spec: {
          runtime: {
            image: 'ghcr.io/openclaw/openclaw:v0.1.0',
            cpu: 0.25,
            memory: 512,
          },
          secrets: [],
          channels: [],
          skills: {
            mode: 'ALLOWLIST',
            allowlist: ['echo'],
          },
          network: {
            inbound: 'NONE',
            egressPreset: 'RESTRICTED',
          },
          observability: {
            logLevel: 'debug',
            tracing: false,
          },
          policies: {
            forbidPublicAdmin: true,
            requireSecretManager: true,
          },
        },
      };

      const result = validateManifest(manifest);
      expect(result.spec.runtime.cpu).toBe(0.25);
      expect(result.spec.runtime.replicas).toBe(1);
    });
  });

  describe('error messages', () => {
    it('provides helpful error for invalid apiVersion', () => {
      const manifest = createValidManifest();
      manifest.apiVersion = 'invalid';
      try {
        validateManifest(manifest);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('apiVersion');
      }
    });

    it('provides helpful error for invalid name', () => {
      const manifest = createValidManifest();
      manifest.metadata.name = 'Invalid Name';
      try {
        validateManifest(manifest);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('name');
      }
    });

    it('provides helpful error for latest tag', () => {
      const manifest = createValidManifest();
      manifest.spec.runtime.image = 'image:latest';
      try {
        validateManifest(manifest);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message.toLowerCase()).toContain('latest');
      }
    });
  });
});
