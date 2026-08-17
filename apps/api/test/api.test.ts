import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { computePlan } from '@shedit/engine';
import { defaultShedConfig, feet } from '@shedit/shared';
import { AppModule } from '../src/app.module';

/**
 * These run with MONGO_URL unset, which is the point: everything except
 * project storage has to work without a database.
 */
describe('ShedIt API (no database)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    delete process.env.MONGO_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports health with persistence off', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.persistence).toBe('off');
  });

  it('computes a plan identical to calling the engine directly', async () => {
    const config = defaultShedConfig();
    const res = await request(app.getHttpServer())
      .post('/api/plans/compute')
      .send(config)
      .expect(201);

    // The guard on the whole shared-engine premise: the API adds no maths of
    // its own, so its output must match the engine byte for byte.
    expect(JSON.stringify(res.body)).toBe(JSON.stringify(computePlan(config)));
  });

  it('derives a lean-to when opposite walls differ', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/plans/compute')
      .send({
        ...defaultShedConfig(),
        wallHeights: { front: feet(9), back: feet(7), left: feet(7), right: feet(7) },
      })
      .expect(201);

    expect(res.body.roof.mode).toBe('skillion-depth');
    expect(res.body.roof.wallKinds.left).toBe('rake');
  });

  it('rejects an invalid configuration with field-level detail', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/plans/compute')
      .send({ width: 1 })
      .expect(400);

    expect(res.body.issues.some((i: { path: string }) => i.path === 'width')).toBe(true);
  });

  it('exports a PDF plan book', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/exports/pdf')
      .send(defaultShedConfig())
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    const body = res.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.length).toBeGreaterThan(20_000);
  });

  it('exports a CSV cut list with angle columns', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/exports/csv')
      .send(defaultShedConfig())
      .expect(200);

    const lines = res.text.trim().split('\n');
    expect(lines[0]).toContain('End A');
    expect(lines.length).toBeGreaterThan(10);
    // A lean-to must produce bevelled rake studs.
    expect(res.text).toMatch(/bevel/);
  });

  it('exports JSON that round-trips back into the planner', async () => {
    const original = defaultShedConfig();
    const res = await request(app.getHttpServer())
      .post('/api/exports/json')
      .send(original)
      .expect(200);

    const parsed = JSON.parse(res.text);
    expect(parsed.config).toEqual(original);

    const again = await request(app.getHttpServer())
      .post('/api/plans/compute')
      .send(parsed.config)
      .expect(201);
    expect(again.body.stats.memberCount).toBe(parsed.plan.stats.memberCount);
  });

  it('explains why saving is unavailable instead of 404ing', async () => {
    const res = await request(app.getHttpServer()).get('/api/projects').expect(503);
    expect(res.body.error).toBe('PERSISTENCE_DISABLED');
    expect(res.body.message).toMatch(/MONGO_URL/);
  });
});
