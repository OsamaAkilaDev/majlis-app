import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Public } from '../src/auth/public.decorator';
import { API_PREFIX } from '../src/config/api-prefix';
import { createTestApp } from './app';

let app: INestApplication;

beforeAll(async () => { app = await createTestApp(); });
afterAll(async () => { await app.close(); });

interface OpenApiSchema {
  $ref?: string;
  properties?: Record<string, unknown>;
  oneOf?: unknown[];
  anyOf?: unknown[];
}

interface OpenApiOperation {
  responses?: Record<string, { content?: Record<string, { schema: OpenApiSchema }> }>;
}

interface OpenApiDoc {
  openapi: string;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

/** A DTO-typed `@ApiResponse` is always a ref, never an inline schema. */
function resolveSchema(doc: OpenApiDoc, schema: OpenApiSchema): OpenApiSchema {
  if (!schema.$ref) return schema;
  const name = schema.$ref.replace('#/components/schemas/', '');
  const resolved = doc.components?.schemas?.[name];
  if (!resolved) throw new Error(`Document has no component schema named ${name}`);
  return resolved;
}

function fetchDoc(): Promise<request.Response> {
  return request(app.getHttpServer()).get(`${API_PREFIX}/docs-json`);
}

describe('generated OpenAPI document', () => {
  it('is reachable at docs-json with no session cookie: Swagger mounts outside the Nest router, same as /docs', async () => {
    const res = await fetchDoc();
    expect(res.status).toBe(200);
    expect((res.body as OpenApiDoc).openapi).toMatch(/^3\./);
  });

  it("declares POST /auth/login's 401 response with a real Problem Details schema", async () => {
    const res = await fetchDoc();
    const doc = res.body as OpenApiDoc;

    const loginPath = Object.keys(doc.paths).find((p) => p.endsWith('/auth/login'));
    expect(loginPath).toBeDefined();

    const response401 = doc.paths[loginPath!]!.post?.responses?.['401'];
    // Catches no error responses, which happens when Problem Details schemas are type-only imports.
    expect(response401).toBeDefined();

    const schema = resolveSchema(doc, response401!.content!['application/json']!.schema);

    // The resolved properties, since an empty schema would pass a key check.
    expect(schema.properties).toBeDefined();
    expect(schema.properties!.type).toBeDefined();
    expect(schema.properties!.title).toBeDefined();
    expect(schema.properties!.status).toBeDefined();
  });

  it("declares PATCH /users/{id}/status's 404 response with the same Problem Details schema component", async () => {
    // A second route proves the schema is a registered component, not per route.
    const res = await fetchDoc();
    const doc = res.body as OpenApiDoc;

    const statusPath = Object.keys(doc.paths).find((p) => p.endsWith('/status') && p.includes('/users/'));
    expect(statusPath).toBeDefined();

    const response404 = doc.paths[statusPath!]!.patch?.responses?.['404'];
    expect(response404).toBeDefined();

    const loginPath = Object.keys(doc.paths).find((p) => p.endsWith('/auth/login'))!;
    const loginSchemaRef = doc.paths[loginPath]!.post!.responses!['401']!.content!['application/json']!.schema.$ref;
    const statusSchemaRef = response404!.content!['application/json']!.schema.$ref;
    expect(statusSchemaRef).toBe(loginSchemaRef);
  });
});

describe('403 responses follow @RequirePermission', () => {
  // The 403 comes from the decorator; a guarded route has it and an unguarded one does not.
  it('documents 403 on a guarded route, with the Problem Details schema', async () => {
    const doc = (await fetchDoc()).body as OpenApiDoc;

    const auditPath = Object.keys(doc.paths).find((p) => p.endsWith('/audit'));
    expect(auditPath).toBeDefined();

    const response403 = doc.paths[auditPath!]!.get?.responses?.['403'];
    expect(response403).toBeDefined();

    // Not just the status key: a schemaless response documents nothing.
    const schema = resolveSchema(doc, response403!.content!['application/json']!.schema);
    expect(schema.properties?.title).toBeDefined();
    expect(schema.properties?.status).toBeDefined();
  });

  it('leaves a self-scoped route without one', async () => {
    const doc = (await fetchDoc()).body as OpenApiDoc;

    // No @RequirePermission here, so a 403 means it was applied globally.
    const invitationsPath = Object.keys(doc.paths).find((p) => p.endsWith('/me/invitations'));
    expect(invitationsPath).toBeDefined();
    expect(doc.paths[invitationsPath!]!.get?.responses?.['403']).toBeUndefined();
  });
});

describe('2xx responses carry their contract schema', () => {
  function okSchema(doc: OpenApiDoc, suffix: string, method: string, status: string): OpenApiSchema {
    const path = Object.keys(doc.paths).find((p) => p.endsWith(suffix));
    expect(path, suffix).toBeDefined();
    const content = doc.paths[path!]![method]?.responses?.[status]?.content?.['application/json'];
    expect(content, `${method} ${suffix} ${status}`).toBeDefined();
    return resolveSchema(doc, content!.schema);
  }

  it('documents an object, a list and a union body with their real properties', async () => {
    const doc = (await fetchDoc()).body as OpenApiDoc;

    // A property only this route's schema has.
    expect(okSchema(doc, '/clubs/{clubId}', 'get', '200').properties?.committee).toBeDefined();
    expect(okSchema(doc, '/me/certificates', 'get', '200').properties?.items).toBeDefined();
    expect(okSchema(doc, '/auth/signup', 'post', '201').properties?.clubRoles).toBeDefined();
    const checkIn = okSchema(doc, '/check-in/manual', 'post', '200');
    expect((checkIn.oneOf ?? checkIn.anyOf)?.length).toBe(5);
  });
});

const fixtureSchema = z.object({ ready: z.boolean() });
type FixtureStatus = z.infer<typeof fixtureSchema>;

class FixtureStatusDto extends createZodDto(fixtureSchema) {}

@Controller('__test/serializer')
class SerializerFixtureController {
  @Public()
  @Get('wrong')
  @ZodResponse({ status: 200, type: FixtureStatusDto })
  wrong(): FixtureStatus {
    return { ready: 'yes' } as unknown as FixtureStatus;
  }

  @Public()
  @Get('extra')
  @ZodResponse({ status: 200, type: FixtureStatusDto })
  extra(): FixtureStatus {
    return { ready: true, password: 'x' } as FixtureStatus;
  }
}

@Module({ controllers: [SerializerFixtureController] })
class SerializerFixtureModule {}

describe('response serialization', () => {
  let fixtureApp: INestApplication;
  beforeAll(async () => { fixtureApp = await createTestApp([SerializerFixtureModule]); });
  afterAll(async () => { await fixtureApp.close(); });

  it('answers 500 Problem Details when a handler returns something its schema rejects', async () => {
    const res = await request(fixtureApp.getHttpServer()).get(`${API_PREFIX}/__test/serializer/wrong`);
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(JSON.stringify(res.body)).not.toContain('yes');
  });

  it('strips a key the schema does not declare', async () => {
    const res = await request(fixtureApp.getHttpServer()).get(`${API_PREFIX}/__test/serializer/extra`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ready: true });
  });
});
