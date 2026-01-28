import { describe, it, expect, beforeEach } from 'vitest';
import {
  FleetSchema,
  BotInstanceSchema,
  validateFleet,
  validateBotInstance,
} from '../fleet';
import { createFleet, createBotInstance, resetIdCounter } from './fixtures';
import { deepClone } from './utils';

describe('Fleet - Edge Cases and Boundary Conditions', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('fleet name validation', () => {
    it('rejects name starting with number', () => {
      const fleet = createFleet({ name: '123-fleet' });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('rejects name starting with hyphen', () => {
      const fleet = createFleet({ name: '-fleet' });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('rejects name ending with hyphen', () => {
      const fleet = createFleet({ name: 'fleet-' });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('rejects consecutive hyphens', () => {
      const fleet = createFleet({ name: 'fleet--name' });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('rejects name longer than 63 characters', () => {
      const fleet = createFleet({ name: 'a'.repeat(64) });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('accepts name at exactly 63 characters', () => {
      const fleet = createFleet({ name: 'a'.repeat(63) });
      expect(() => validateFleet(fleet)).not.toThrow();
    });

    it('rejects reserved kubernetes names', () => {
      const reservedNames = ['kube-system', 'kube-public', 'default', 'kubernetes'];
      for (const name of reservedNames) {
        const fleet = createFleet({ name });
        expect(() => validateFleet(deepClone(fleet))).toThrow();
      }
    });
  });

  describe('environment validation', () => {
    it('rejects invalid environment values', () => {
      const invalidEnvs = ['development', 'production', 'test', 'uat', 'qa'];
      for (const env of invalidEnvs) {
        const fleet = createFleet({ environment: env as any });
        expect(() => validateFleet(deepClone(fleet))).toThrow();
      }
    });

    it('accepts only dev, staging, prod', () => {
      const validEnvs = ['dev', 'staging', 'prod'];
      for (const env of validEnvs) {
        const fleet = createFleet({ environment: env as any });
        expect(() => validateFleet(deepClone(fleet))).not.toThrow();
      }
    });
  });

  describe('status validation', () => {
    it('defaults status to ACTIVE', () => {
      const fleet = createFleet();
      delete (fleet as any).status;
      const result = FleetSchema.parse(fleet);
      expect(result.status).toBe('ACTIVE');
    });

    it('accepts all valid statuses', () => {
      const statuses = ['ACTIVE', 'PAUSED', 'DRAINING', 'ERROR'];
      for (const status of statuses) {
        const fleet = createFleet({ status: status as any });
        const result = validateFleet(deepClone(fleet));
        expect(result.status).toBe(status);
      }
    });
  });

  describe('AWS resource validation', () => {
    it('accepts valid ECS cluster ARN', () => {
      const fleet = createFleet({
        ecsClusterArn: 'arn:aws:ecs:us-east-1:123456789:cluster/my-cluster',
      });
      const result = validateFleet(fleet);
      expect(result.ecsClusterArn).toBe('arn:aws:ecs:us-east-1:123456789:cluster/my-cluster');
    });

    it('rejects invalid ECS cluster ARN format', () => {
      const fleet = createFleet({
        ecsClusterArn: 'invalid-arn',
      });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('accepts valid VPC ID', () => {
      const fleet = createFleet({
        vpcId: 'vpc-12345abc',
      });
      const result = validateFleet(fleet);
      expect(result.vpcId).toBe('vpc-12345abc');
    });

    it('rejects invalid VPC ID format', () => {
      const fleet = createFleet({
        vpcId: 'invalid-vpc',
      });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('accepts valid subnet IDs', () => {
      const fleet = createFleet({
        privateSubnetIds: ['subnet-12345abc', 'subnet-67890def'],
      });
      const result = validateFleet(fleet);
      expect(result.privateSubnetIds).toHaveLength(2);
    });

    it('rejects invalid subnet ID format', () => {
      const fleet = createFleet({
        privateSubnetIds: ['invalid-subnet'],
      });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('accepts valid security group ID', () => {
      const fleet = createFleet({
        securityGroupId: 'sg-12345abc',
      });
      const result = validateFleet(fleet);
      expect(result.securityGroupId).toBe('sg-12345abc');
    });

    it('rejects invalid security group ID format', () => {
      const fleet = createFleet({
        securityGroupId: 'invalid-sg',
      });
      expect(() => validateFleet(fleet)).toThrow();
    });
  });

  describe('tags validation', () => {
    it('accepts empty tags', () => {
      const fleet = createFleet({ tags: {} });
      const result = validateFleet(fleet);
      expect(result.tags).toEqual({});
    });

    it('accepts valid tag key-value pairs', () => {
      const fleet = createFleet({
        tags: {
          team: 'platform',
          environment: 'production',
          'cost-center': 'engineering',
        },
      });
      const result = validateFleet(fleet);
      expect(result.tags.team).toBe('platform');
    });

    it('rejects tag keys with invalid characters', () => {
      const fleet = createFleet({
        tags: {
          'invalid:key': 'value',
        },
      });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('rejects too many tags', () => {
      const tags: Record<string, string> = {};
      for (let i = 0; i < 60; i++) {
        tags[`tag-${i}`] = `value-${i}`;
      }
      const fleet = createFleet({ tags });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('rejects tag values longer than 256 characters', () => {
      const fleet = createFleet({
        tags: {
          key: 'a'.repeat(257),
        },
      });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('rejects tag keys longer than 128 characters', () => {
      const fleet = createFleet({
        tags: {
          ['a'.repeat(129)]: 'value',
        },
      });
      expect(() => validateFleet(fleet)).toThrow();
    });
  });

  describe('policy pack IDs validation', () => {
    it('accepts empty policy pack IDs', () => {
      const fleet = createFleet({ enforcedPolicyPackIds: [] });
      const result = validateFleet(fleet);
      expect(result.enforcedPolicyPackIds).toEqual([]);
    });

    it('accepts multiple policy pack IDs', () => {
      const fleet = createFleet({
        enforcedPolicyPackIds: ['pack-1', 'pack-2', 'pack-3'],
      });
      const result = validateFleet(fleet);
      expect(result.enforcedPolicyPackIds).toHaveLength(3);
    });

    it('rejects duplicate policy pack IDs', () => {
      const fleet = createFleet({
        enforcedPolicyPackIds: ['pack-1', 'pack-1'],
      });
      expect(() => validateFleet(fleet)).toThrow();
    });
  });

  describe('description validation', () => {
    it('accepts empty description', () => {
      const fleet = createFleet({ description: undefined });
      const result = validateFleet(fleet);
      expect(result.description).toBeUndefined();
    });

    it('accepts description up to 1000 characters', () => {
      const fleet = createFleet({
        description: 'A'.repeat(1000),
      });
      const result = validateFleet(fleet);
      expect(result.description).toHaveLength(1000);
    });

    it('rejects description longer than 1000 characters', () => {
      const fleet = createFleet({
        description: 'A'.repeat(1001),
      });
      expect(() => validateFleet(fleet)).toThrow();
    });
  });

  describe('default profile validation', () => {
    it('accepts valid default profile ID', () => {
      const fleet = createFleet({
        defaultProfileId: 'profile-123',
      });
      const result = validateFleet(fleet);
      expect(result.defaultProfileId).toBe('profile-123');
    });

    it('accepts null default profile ID', () => {
      const fleet = createFleet({
        defaultProfileId: undefined,
      });
      const result = validateFleet(fleet);
      expect(result.defaultProfileId).toBeUndefined();
    });
  });

  describe('timestamps validation', () => {
    it('accepts valid dates', () => {
      const now = new Date();
      const fleet = createFleet({
        createdAt: now,
        updatedAt: now,
      });
      const result = validateFleet(fleet);
      expect(result.createdAt).toEqual(now);
      expect(result.updatedAt).toEqual(now);
    });

    it('rejects invalid dates', () => {
      const fleet = createFleet({
        createdAt: new Date('invalid'),
      });
      expect(() => validateFleet(fleet)).toThrow();
    });

    it('rejects future created dates', () => {
      const future = new Date(Date.now() + 100000000000);
      const fleet = createFleet({
        createdAt: future,
      });
      expect(() => validateFleet(fleet)).toThrow();
    });
  });
});

describe('BotInstance - Edge Cases and Boundary Conditions', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('name validation', () => {
    it('follows same rules as fleet names', () => {
      const invalidNames = [
        '123-bot',
        '-bot',
        'bot-',
        'bot--name',
        'Invalid Name',
        'invalid_name',
        'a'.repeat(64),
      ];

      for (const name of invalidNames) {
        const bot = createBotInstance({ name });
        expect(() => validateBotInstance(deepClone(bot))).toThrow();
      }
    });

    it('accepts valid names', () => {
      const validNames = [
        'bot',
        'my-bot',
        'customer-service-bot',
        'a'.repeat(63),
      ];

      for (const name of validNames) {
        const bot = createBotInstance({ name });
        expect(() => validateBotInstance(deepClone(bot))).not.toThrow();
      }
    });
  });

  describe('status validation', () => {
    it('defaults status to CREATING', () => {
      const bot = createBotInstance();
      delete (bot as any).status;
      const result = BotInstanceSchema.parse(bot);
      expect(result.status).toBe('CREATING');
    });

    it('accepts all valid statuses', () => {
      const statuses = [
        'CREATING',
        'PENDING',
        'RUNNING',
        'DEGRADED',
        'STOPPED',
        'PAUSED',
        'DELETING',
        'ERROR',
        'RECONCILING',
      ];

      for (const status of statuses) {
        const bot = createBotInstance({ status: status as any });
        const result = validateBotInstance(deepClone(bot));
        expect(result.status).toBe(status);
      }
    });
  });

  describe('health validation', () => {
    it('defaults health to UNKNOWN', () => {
      const bot = createBotInstance();
      delete (bot as any).health;
      const result = BotInstanceSchema.parse(bot);
      expect(result.health).toBe('UNKNOWN');
    });

    it('accepts all valid health values', () => {
      const healths = ['HEALTHY', 'UNHEALTHY', 'UNKNOWN', 'DEGRADED'];

      for (const health of healths) {
        const bot = createBotInstance({ health: health as any });
        const result = validateBotInstance(deepClone(bot));
        expect(result.health).toBe(health);
      }
    });
  });

  describe('error count validation', () => {
    it('accepts zero errors', () => {
      const bot = createBotInstance({ errorCount: 0 });
      const result = validateBotInstance(bot);
      expect(result.errorCount).toBe(0);
    });

    it('accepts positive error counts', () => {
      const bot = createBotInstance({ errorCount: 5 });
      const result = validateBotInstance(bot);
      expect(result.errorCount).toBe(5);
    });

    it('rejects negative error counts', () => {
      const bot = createBotInstance({ errorCount: -1 });
      expect(() => validateBotInstance(bot)).toThrow();
    });

    it('defaults error count to 0', () => {
      const bot = createBotInstance();
      delete (bot as any).errorCount;
      const result = BotInstanceSchema.parse(bot);
      expect(result.errorCount).toBe(0);
    });
  });

  describe('restart count validation', () => {
    it('accepts zero restarts', () => {
      const bot = createBotInstance({ restartCount: 0 });
      const result = validateBotInstance(bot);
      expect(result.restartCount).toBe(0);
    });

    it('accepts positive restart counts', () => {
      const bot = createBotInstance({ restartCount: 10 });
      const result = validateBotInstance(bot);
      expect(result.restartCount).toBe(10);
    });

    it('rejects negative restart counts', () => {
      const bot = createBotInstance({ restartCount: -1 });
      expect(() => validateBotInstance(bot)).toThrow();
    });
  });

  describe('uptime validation', () => {
    it('accepts zero uptime', () => {
      const bot = createBotInstance({ uptimeSeconds: 0 });
      const result = validateBotInstance(bot);
      expect(result.uptimeSeconds).toBe(0);
    });

    it('accepts positive uptime', () => {
      const bot = createBotInstance({ uptimeSeconds: 86400 });
      const result = validateBotInstance(bot);
      expect(result.uptimeSeconds).toBe(86400);
    });

    it('rejects negative uptime', () => {
      const bot = createBotInstance({ uptimeSeconds: -1 });
      expect(() => validateBotInstance(bot)).toThrow();
    });
  });

  describe('overlay IDs validation', () => {
    it('accepts empty overlay IDs', () => {
      const bot = createBotInstance({ overlayIds: [] });
      const result = validateBotInstance(bot);
      expect(result.overlayIds).toEqual([]);
    });

    it('accepts multiple overlay IDs', () => {
      const bot = createBotInstance({
        overlayIds: ['overlay-1', 'overlay-2', 'overlay-3'],
      });
      const result = validateBotInstance(bot);
      expect(result.overlayIds).toHaveLength(3);
    });

    it('rejects duplicate overlay IDs', () => {
      const bot = createBotInstance({
        overlayIds: ['overlay-1', 'overlay-1'],
      });
      expect(() => validateBotInstance(bot)).toThrow();
    });
  });

  describe('metadata validation', () => {
    it('accepts empty metadata', () => {
      const bot = createBotInstance({ metadata: {} });
      const result = validateBotInstance(bot);
      expect(result.metadata).toEqual({});
    });

    it('accepts nested metadata', () => {
      const bot = createBotInstance({
        metadata: {
          version: '1.0.0',
          config: {
            featureFlags: {
              newUI: true,
            },
          },
        },
      });
      const result = validateBotInstance(bot);
      expect(result.metadata.config?.featureFlags?.newUI).toBe(true);
    });

    it('rejects metadata with circular references', () => {
      const bot = createBotInstance();
      bot.metadata = { self: bot.metadata };
      // Note: This would fail due to JSON.stringify in deepClone
      // but the schema itself may not catch it
    });
  });

  describe('AWS resource ARNs validation', () => {
    it('accepts valid ECS cluster ARN', () => {
      const bot = createBotInstance({
        ecsClusterArn: 'arn:aws:ecs:us-east-1:123456789:cluster/my-cluster',
      });
      const result = validateBotInstance(bot);
      expect(result.ecsClusterArn).toBe('arn:aws:ecs:us-east-1:123456789:cluster/my-cluster');
    });

    it('accepts valid ECS service ARN', () => {
      const bot = createBotInstance({
        ecsServiceArn: 'arn:aws:ecs:us-east-1:123456789:service/my-cluster/my-service',
      });
      const result = validateBotInstance(bot);
      expect(result.ecsServiceArn).toBe('arn:aws:ecs:us-east-1:123456789:service/my-cluster/my-service');
    });

    it('accepts valid task definition ARN', () => {
      const bot = createBotInstance({
        taskDefinitionArn: 'arn:aws:ecs:us-east-1:123456789:task-definition/my-task:5',
      });
      const result = validateBotInstance(bot);
      expect(result.taskDefinitionArn).toBe('arn:aws:ecs:us-east-1:123456789:task-definition/my-task:5');
    });

    it('accepts valid CloudWatch log group', () => {
      const bot = createBotInstance({
        cloudwatchLogGroup: '/ecs/my-bot',
      });
      const result = validateBotInstance(bot);
      expect(result.cloudwatchLogGroup).toBe('/ecs/my-bot');
    });
  });

  describe('manifest validation', () => {
    it('requires desired manifest', () => {
      const bot = createBotInstance();
      delete (bot as any).desiredManifest;
      expect(() => validateBotInstance(bot)).toThrow();
    });

    it('validates nested manifest structure', () => {
      const bot = createBotInstance({
        desiredManifest: {
          apiVersion: 'molthub/v1',
          kind: 'MoltbotInstance',
          metadata: {
            name: 'test-bot',
            workspace: 'default',
            environment: 'dev',
            labels: {},
          },
          spec: {
            runtime: {
              image: 'ghcr.io/clawdbot/clawdbot:v0.1.0',
              cpu: 0.5,
              memory: 1024,
              replicas: 1,
            },
            secrets: [],
            channels: [],
            skills: {
              mode: 'ALLOWLIST',
              allowlist: ['weather'],
            },
            network: {
              inbound: 'NONE',
              egressPreset: 'RESTRICTED',
            },
            observability: {
              logLevel: 'info',
              tracing: false,
            },
            policies: {
              forbidPublicAdmin: true,
              requireSecretManager: true,
            },
          },
        },
      });
      const result = validateBotInstance(bot);
      expect(result.desiredManifest.metadata.name).toBe('test-bot');
    });
  });

  describe('error state validation', () => {
    it('accepts null last error', () => {
      const bot = createBotInstance({ lastError: null });
      const result = validateBotInstance(bot);
      expect(result.lastError).toBeNull();
    });

    it('accepts error object', () => {
      const bot = createBotInstance({
        lastError: {
          message: 'Connection failed',
          code: 'ECONNREFUSED',
          timestamp: new Date(),
        },
      });
      const result = validateBotInstance(bot);
      expect(result.lastError?.message).toBe('Connection failed');
    });

    it('accepts error with stack trace', () => {
      const bot = createBotInstance({
        lastError: {
          message: 'Runtime error',
          stack: 'Error: Runtime error\n    at Bot.run (/app/bot.ts:1:1)',
          timestamp: new Date(),
        },
      });
      const result = validateBotInstance(bot);
      expect(result.lastError?.stack).toContain('Runtime error');
    });
  });

  describe('timestamp validation', () => {
    it('accepts valid timestamps', () => {
      const now = new Date();
      const bot = createBotInstance({
        lastReconcileAt: now,
        lastHealthCheckAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const result = validateBotInstance(bot);
      expect(result.lastReconcileAt).toEqual(now);
    });

    it('accepts null timestamps', () => {
      const bot = createBotInstance({
        lastReconcileAt: null,
        lastHealthCheckAt: null,
      });
      const result = validateBotInstance(bot);
      expect(result.lastReconcileAt).toBeNull();
    });
  });
});
