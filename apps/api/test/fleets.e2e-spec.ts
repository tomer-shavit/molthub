/**
 * API Integration Tests - Fleet Endpoints
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Fleet API (e2e)', () => {
  let app: INestApplication;
  let createdFleetId: string;
  const workspaceId = 'test-workspace-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /fleets', () => {
    it('should create a new fleet', async () => {
      const response = await request(app.getHttpServer())
        .post('/fleets')
        .send({
          workspaceId,
          name: 'test-fleet-api',
          environment: 'dev',
          description: 'Test fleet for API tests',
          tags: { team: 'test', environment: 'dev' },
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('test-fleet-api');
      expect(response.body.status).toBe('ACTIVE');
      createdFleetId = response.body.id;
    });

    it('should reject duplicate fleet names in same workspace', async () => {
      await request(app.getHttpServer())
        .post('/fleets')
        .send({
          workspaceId,
          name: 'duplicate-fleet',
          environment: 'dev',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/fleets')
        .send({
          workspaceId,
          name: 'duplicate-fleet',
          environment: 'dev',
        })
        .expect(400);
    });

    it('should reject invalid environment', async () => {
      await request(app.getHttpServer())
        .post('/fleets')
        .send({
          workspaceId,
          name: 'invalid-env-fleet',
          environment: 'invalid',
        })
        .expect(400);
    });

    it('should reject invalid fleet name', async () => {
      await request(app.getHttpServer())
        .post('/fleets')
        .send({
          workspaceId,
          name: 'Invalid Name With Spaces',
          environment: 'dev',
        })
        .expect(400);
    });

    it('should reject missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/fleets')
        .send({
          name: 'missing-fields',
        })
        .expect(400);
    });
  });

  describe('GET /fleets', () => {
    it('should list all fleets for workspace', async () => {
      const response = await request(app.getHttpServer())
        .get('/fleets')
        .query({ workspaceId })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should filter by environment', async () => {
      const response = await request(app.getHttpServer())
        .get('/fleets')
        .query({ workspaceId, environment: 'dev' })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/fleets')
        .query({ workspaceId, status: 'ACTIVE' })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should require workspaceId', async () => {
      await request(app.getHttpServer())
        .get('/fleets')
        .expect(400);
    });
  });

  describe('GET /fleets/:id', () => {
    it('should get fleet by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/fleets/${createdFleetId}`)
        .expect(200);

      expect(response.body.id).toBe(createdFleetId);
      expect(response.body.name).toBe('test-fleet-api');
    });

    it('should return 404 for non-existent fleet', async () => {
      await request(app.getHttpServer())
        .get('/fleets/non-existent-id')
        .expect(404);
    });

    it('should include instances count', async () => {
      const response = await request(app.getHttpServer())
        .get(`/fleets/${createdFleetId}`)
        .expect(200);

      expect(response.body).toHaveProperty('_count');
      expect(response.body._count).toHaveProperty('instances');
    });
  });

  describe('PATCH /fleets/:id', () => {
    it('should update fleet description', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/fleets/${createdFleetId}`)
        .send({
          description: 'Updated description',
        })
        .expect(200);

      expect(response.body.description).toBe('Updated description');
    });

    it('should update fleet tags', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/fleets/${createdFleetId}`)
        .send({
          tags: { team: 'platform', costCenter: 'eng' },
        })
        .expect(200);

      expect(response.body.tags.team).toBe('platform');
    });

    it('should return 404 for non-existent fleet', async () => {
      await request(app.getHttpServer())
        .patch('/fleets/non-existent-id')
        .send({ description: 'Test' })
        .expect(404);
    });
  });

  describe('PATCH /fleets/:id/status', () => {
    it('should update fleet status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/fleets/${createdFleetId}/status`)
        .send({ status: 'PAUSED' })
        .expect(200);

      expect(response.body.status).toBe('PAUSED');
    });

    it('should reject invalid status transition', async () => {
      await request(app.getHttpServer())
        .patch(`/fleets/${createdFleetId}/status`)
        .send({ status: 'DRAINING' })
        .expect(200);

      // Can't transition from DRAINING to PAUSED
      await request(app.getHttpServer())
        .patch(`/fleets/${createdFleetId}/status`)
        .send({ status: 'PAUSED' })
        .expect(400);
    });

    it('should reject invalid status', async () => {
      await request(app.getHttpServer())
        .patch(`/fleets/${createdFleetId}/status`)
        .send({ status: 'INVALID' })
        .expect(400);
    });
  });

  describe('GET /fleets/:id/health', () => {
    it('should get fleet health', async () => {
      const response = await request(app.getHttpServer())
        .get(`/fleets/${createdFleetId}/health`)
        .expect(200);

      expect(response.body).toHaveProperty('fleetId');
      expect(response.body).toHaveProperty('totalInstances');
      expect(response.body).toHaveProperty('healthyCount');
      expect(response.body).toHaveProperty('degradedCount');
      expect(response.body).toHaveProperty('unhealthyCount');
      expect(response.body).toHaveProperty('unknownCount');
      expect(response.body).toHaveProperty('status');
    });

    it('should return 404 for non-existent fleet', async () => {
      await request(app.getHttpServer())
        .get('/fleets/non-existent-id/health')
        .expect(404);
    });
  });

  describe('DELETE /fleets/:id', () => {
    it('should not delete fleet with instances', async () => {
      // Create a fleet
      const createResponse = await request(app.getHttpServer())
        .post('/fleets')
        .send({
          workspaceId,
          name: 'fleet-with-instances',
          environment: 'dev',
        })
        .expect(201);

      // Create an instance in the fleet
      await request(app.getHttpServer())
        .post('/bot-instances')
        .send({
          workspaceId,
          fleetId: createResponse.body.id,
          name: 'test-instance',
          desiredManifest: {
            apiVersion: 'clawster/v1',
            kind: 'OpenClawInstance',
            metadata: {
              name: 'test-instance',
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
          },
        })
        .expect(201);

      // Try to delete fleet with instances
      await request(app.getHttpServer())
        .delete(`/fleets/${createResponse.body.id}`)
        .expect(400);
    });

    it('should return 404 for non-existent fleet', async () => {
      await request(app.getHttpServer())
        .delete('/fleets/non-existent-id')
        .expect(404);
    });
  });
});
