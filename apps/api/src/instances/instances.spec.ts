import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';

describe('InstancesController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET) - should return health status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBeDefined();
        expect(res.body.checks).toBeDefined();
        expect(res.body.timestamp).toBeDefined();
      });
  });

  it('/instances (GET) - should return list of instances', () => {
    return request(app.getHttpServer())
      .get('/instances')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('/instances (POST) - should create a new instance', () => {
    return request(app.getHttpServer())
      .post('/instances')
      .send({
        name: 'test-instance',
        environment: 'dev',
        templateId: 'builtin-0',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.id).toBeDefined();
        expect(res.body.name).toBe('test-instance');
        expect(res.body.status).toBe('CREATING');
      });
  });

  it('/instances (POST) - should reject duplicate names', async () => {
    // Create first instance
    await request(app.getHttpServer())
      .post('/instances')
      .send({
        name: 'duplicate-test',
        environment: 'dev',
        templateId: 'builtin-0',
      })
      .expect(201);

    // Try to create second with same name
    return request(app.getHttpServer())
      .post('/instances')
      .send({
        name: 'duplicate-test',
        environment: 'dev',
        templateId: 'builtin-0',
      })
      .expect(400);
  });

  it('/templates (GET) - should return list of templates', () => {
    return request(app.getHttpServer())
      .get('/templates')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
      });
  });

  it('/metrics (GET) - should return Prometheus metrics', () => {
    return request(app.getHttpServer())
      .get('/metrics')
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect((res) => {
        expect(res.text).toContain('molthub_');
      });
  });
});