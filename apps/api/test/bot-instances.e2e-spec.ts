/**
 * API Integration Tests - Bot Instance Endpoints
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const validManifest = {
  apiVersion: 'clawster/v1',
  kind: 'OpenClawInstance',
  metadata: {
    name: 'test-bot',
    workspace: 'default',
    environment: 'dev',
    labels: {},
  },
  spec: {
    runtime: {
      image: 'openclaw:v0.1.0',
      cpu: 0.5,
      memory: 1024,
    },
    secrets: [],
    channels: [],
    skills: { mode: 'ALLOWLIST', allowlist: ['echo'] },
    network: { inbound: 'NONE', egressPreset: 'RESTRICTED' },
    observability: { logLevel: 'info', tracing: false },
    policies: { forbidPublicAdmin: true, requireSecretManager: true },
  },
};

describe('Bot Instances API (e2e)', () => {
  let app: INestApplication;
  let createdInstanceId: string;
  let fleetId: string;
  const workspaceId = 'test-workspace-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    // Create a fleet for the instances
    const fleetResponse = await request(app.getHttpServer())
      .post('/fleets')
      .send({
        workspaceId,
        name: 'test-fleet-for-instances',
        environment: 'dev',
      })
      .expect(201);

    fleetId = fleetResponse.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /bot-instances', () => {
    it('should create a new bot instance', async () => {
      const response = await request(app.getHttpServer())
        .post('/bot-instances')
        .send({
          workspaceId,
          fleetId,
          name: 'test-instance-api',
          desiredManifest: validManifest,
          tags: { team: 'test' },
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('test-instance-api');
      expect(response.body.status).toBe('CREATING');
      expect(response.body.health).toBe('UNKNOWN');
      createdInstanceId = response.body.id;
    });

    it('should reject duplicate instance names in same workspace', async () => {
      await request(app.getHttpServer())
        .post('/bot-instances')
        .send({
          workspaceId,
          fleetId,
          name: 'duplicate-instance',
          desiredManifest: validManifest,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/bot-instances')
        .send({
          workspaceId,
          fleetId,
          name: 'duplicate-instance',
          desiredManifest: validManifest,
        })
        .expect(400);
    });

    it('should reject invalid manifest', async () => {
      const invalidManifest = {
        ...validManifest,
        spec: {
          ...validManifest.spec,
          runtime: {
            ...validManifest.spec.runtime,
            image: 'nginx:latest', // Invalid: uses latest tag
          },
        },
      };

      await request(app.getHttpServer())
        .post('/bot-instances')
        .send({
          workspaceId,
          fleetId,
          name: 'invalid-manifest-instance',
          desiredManifest: invalidManifest,
        })
        .expect(400);
    });

    it('should reject missing fleet', async () => {
      await request(app.getHttpServer())
        .post('/bot-instances')
        .send({
          workspaceId,
          fleetId: 'non-existent-fleet',
          name: 'no-fleet-instance',
          desiredManifest: validManifest,
        })
        .expect(404);
    });

    it('should reject missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/bot-instances')
        .send({
          name: 'missing-fields',
        })
        .expect(400);
    });

    it('should accept with profile and overlays', async () => {
      const response = await request(app.getHttpServer())
        .post('/bot-instances')
        .send({
          workspaceId,
          fleetId,
          name: 'instance-with-profile',
          desiredManifest: validManifest,
          profileId: 'profile-123',
          overlayIds: ['overlay-1', 'overlay-2'],
        })
        .expect(201);

      expect(response.body.profileId).toBe('profile-123');
      expect(response.body.overlayIds).toEqual(['overlay-1', 'overlay-2']);
    });
  });

  describe('GET /bot-instances', () => {
    it('should list all instances for workspace', async () => {
      const response = await request(app.getHttpServer())
        .get('/bot-instances')
        .query({ workspaceId })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should filter by fleet', async () => {
      const response = await request(app.getHttpServer())
        .get('/bot-instances')
        .query({ workspaceId, fleetId })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/bot-instances')
        .query({ workspaceId, status: 'CREATING' })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter by health', async () => {
      const response = await request(app.getHttpServer())
        .get('/bot-instances')
        .query({ workspaceId, health: 'UNKNOWN' })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should include fleet info', async () => {
      const response = await request(app.getHttpServer())
        .get('/bot-instances')
        .query({ workspaceId })
        .expect(200);

      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('fleet');
      }
    });
  });

  describe('GET /bot-instances/:id', () => {
    it('should get instance by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/bot-instances/${createdInstanceId}`)
        .expect(200);

      expect(response.body.id).toBe(createdInstanceId);
      expect(response.body.name).toBe('test-instance-api');
      expect(response.body).toHaveProperty('desiredManifest');
    });

    it('should include connector bindings', async () => {
      const response = await request(app.getHttpServer())
        .get(`/bot-instances/${createdInstanceId}`)
        .expect(200);

      expect(response.body).toHaveProperty('connectorBindings');
    });

    it('should return 404 for non-existent instance', async () => {
      await request(app.getHttpServer())
        .get('/bot-instances/non-existent-id')
        .expect(404);
    });
  });

  describe('PATCH /bot-instances/:id', () => {
    it('should update instance tags', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/bot-instances/${createdInstanceId}`)
        .send({
          tags: { team: 'platform', costCenter: 'eng' },
        })
        .expect(200);

      expect(response.body.tags.team).toBe('platform');
    });

    it('should update instance manifest', async () => {
      const updatedManifest = {
        ...validManifest,
        spec: {
          ...validManifest.spec,
          runtime: {
            ...validManifest.spec.runtime,
            cpu: 1,
            memory: 2048,
          },
        },
      };

      const response = await request(app.getHttpServer())
        .patch(`/bot-instances/${createdInstanceId}`)
        .send({
          desiredManifest: updatedManifest,
        })
        .expect(200);

      expect(response.body.desiredManifest.spec.runtime.cpu).toBe(1);
    });

    it('should validate updated manifest', async () => {
      const invalidManifest = {
        ...validManifest,
        spec: {
          ...validManifest.spec,
          runtime: {
            ...validManifest.spec.runtime,
            cpu: 0.1, // Too low
          },
        },
      };

      await request(app.getHttpServer())
        .patch(`/bot-instances/${createdInstanceId}`)
        .send({
          desiredManifest: invalidManifest,
        })
        .expect(400);
    });

    it('should update overlayIds', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/bot-instances/${createdInstanceId}`)
        .send({
          overlayIds: ['overlay-3', 'overlay-4'],
        })
        .expect(200);

      expect(response.body.overlayIds).toEqual(['overlay-3', 'overlay-4']);
    });

    it('should return 404 for non-existent instance', async () => {
      await request(app.getHttpServer())
        .patch('/bot-instances/non-existent-id')
        .send({ tags: { test: 'value' } })
        .expect(404);
    });
  });

  describe('POST /bot-instances/:id/restart', () => {
    it('should restart instance', async () => {
      const response = await request(app.getHttpServer())
        .post(`/bot-instances/${createdInstanceId}/restart`)
        .expect(200);

      expect(response.body.status).toBe('RECONCILING');
      expect(response.body.restartCount).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent instance', async () => {
      await request(app.getHttpServer())
        .post('/bot-instances/non-existent-id/restart')
        .expect(404);
    });
  });

  describe('POST /bot-instances/:id/pause', () => {
    it('should pause instance', async () => {
      const response = await request(app.getHttpServer())
        .post(`/bot-instances/${createdInstanceId}/pause`)
        .expect(200);

      expect(response.body.status).toBe('PAUSED');
    });

    it('should return 404 for non-existent instance', async () => {
      await request(app.getHttpServer())
        .post('/bot-instances/non-existent-id/pause')
        .expect(404);
    });
  });

  describe('POST /bot-instances/:id/resume', () => {
    it('should resume instance', async () => {
      const response = await request(app.getHttpServer())
        .post(`/bot-instances/${createdInstanceId}/resume`)
        .expect(200);

      expect(response.body.status).toBe('PENDING');
    });

    it('should return 404 for non-existent instance', async () => {
      await request(app.getHttpServer())
        .post('/bot-instances/non-existent-id/resume')
        .expect(404);
    });
  });

  describe('POST /bot-instances/:id/stop', () => {
    it('should stop instance', async () => {
      const response = await request(app.getHttpServer())
        .post(`/bot-instances/${createdInstanceId}/stop`)
        .expect(200);

      expect(response.body.status).toBe('STOPPED');
    });

    it('should return 404 for non-existent instance', async () => {
      await request(app.getHttpServer())
        .post('/bot-instances/non-existent-id/stop')
        .expect(404);
    });
  });

  describe('DELETE /bot-instances/:id', () => {
    it('should mark instance for deletion', async () => {
      // Create instance to delete
      const createResponse = await request(app.getHttpServer())
        .post('/bot-instances')
        .send({
          workspaceId,
          fleetId,
          name: 'instance-to-delete',
          desiredManifest: validManifest,
        })
        .expect(201);

      const deleteResponse = await request(app.getHttpServer())
        .delete(`/bot-instances/${createResponse.body.id}`)
        .expect(200);

      expect(deleteResponse.body.status).toBe('DELETING');
    });

    it('should return 404 for non-existent instance', async () => {
      await request(app.getHttpServer())
        .delete('/bot-instances/non-existent-id')
        .expect(404);
    });
  });

  describe('GET /bot-instances/dashboard/:workspaceId', () => {
    it('should get dashboard data', async () => {
      const response = await request(app.getHttpServer())
        .get(`/bot-instances/dashboard/${workspaceId}`)
        .expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('totalInstances');
      expect(response.body.summary).toHaveProperty('statusBreakdown');
      expect(response.body.summary).toHaveProperty('healthBreakdown');
      expect(response.body).toHaveProperty('recentInstances');
      expect(response.body).toHaveProperty('fleetDistribution');
    });

    it('should return empty dashboard for new workspace', async () => {
      const response = await request(app.getHttpServer())
        .get('/bot-instances/dashboard/new-workspace-123')
        .expect(200);

      expect(response.body.summary.totalInstances).toBe(0);
    });
  });
});
