import { NextRequest } from 'next/server';
import { ModuleServiceError } from '@/lib/modules/moduleService';
import { makeModuleManifest, makeRegisteredModule } from '@/lib/modules/__tests__/testUtils';

// ---------------------------------------------------------------------------
// Mock the module service so route handlers stay isolated
// ---------------------------------------------------------------------------

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}));

const mockGetModules = jest.fn();
const mockRegisterModule = jest.fn();

jest.mock('@/lib/modules/moduleService', () => {
  const actual = jest.requireActual('@/lib/modules/moduleService');
  return {
    ...actual,
    getModules: (...args: unknown[]) => mockGetModules(...args),
    registerModule: (...args: unknown[]) => mockRegisterModule(...args),
  };
});

// Import AFTER mocks are set up
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET, POST } = require('../route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(params?: Record<string, string>) {
  const url = new URL('http://localhost/api/modules');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url.toString());
}

async function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost/api/modules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// GET /api/modules
// ---------------------------------------------------------------------------

describe('GET /api/modules', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when organizationId is missing', async () => {
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/organizationId/i);
  });

  it('returns 200 with the modules array on success', async () => {
    const modules = [
      makeRegisteredModule(),
      makeRegisteredModule({ id: 'mod-2', module: 'other-module' }),
    ];
    mockGetModules.mockResolvedValueOnce(modules);

    const req = makeGetRequest({ organizationId: 'org-1' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.modules).toHaveLength(2);
  });

  it('returns an empty array when no modules are registered', async () => {
    mockGetModules.mockResolvedValueOnce([]);

    const req = makeGetRequest({ organizationId: 'org-empty' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.modules).toEqual([]);
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockGetModules.mockRejectedValueOnce(new Error('connection reset'));

    const req = makeGetRequest({ organizationId: 'org-1' });
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('passes the organizationId to the service', async () => {
    mockGetModules.mockResolvedValueOnce([]);

    const req = makeGetRequest({ organizationId: 'org-abc' });
    await GET(req);

    expect(mockGetModules).toHaveBeenCalledWith(expect.anything(), 'org-abc');
  });
});

// ---------------------------------------------------------------------------
// POST /api/modules
// ---------------------------------------------------------------------------

describe('POST /api/modules', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 201 with the new module on success', async () => {
    const module = makeRegisteredModule();
    mockRegisterModule.mockResolvedValueOnce(module);

    const req = await makePostRequest({
      manifest: makeModuleManifest(),
      organizationId: 'org-1',
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.module).toMatchObject({ id: module.id });
  });

  it('returns 400 when manifest is missing', async () => {
    const req = await makePostRequest({ organizationId: 'org-1' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/manifest/i);
  });

  it('returns 400 when organizationId is missing', async () => {
    const req = await makePostRequest({ manifest: makeModuleManifest() });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/organizationId/i);
  });

  it('returns 400 when body is empty', async () => {
    const req = await makePostRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 422 when the service throws VALIDATION_ERROR', async () => {
    mockRegisterModule.mockRejectedValueOnce(
      new ModuleServiceError('Invalid module manifest: ...', 'VALIDATION_ERROR')
    );

    const req = await makePostRequest({
      manifest: makeModuleManifest(),
      organizationId: 'org-1',
    });
    const res = await POST(req);

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/invalid/i);
  });

  it('returns 409 when the service throws DUPLICATE', async () => {
    mockRegisterModule.mockRejectedValueOnce(
      new ModuleServiceError("Module 'test-module' is already registered", 'DUPLICATE')
    );

    const req = await makePostRequest({
      manifest: makeModuleManifest(),
      organizationId: 'org-1',
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockRegisterModule.mockRejectedValueOnce(new Error('db timeout'));

    const req = await makePostRequest({
      manifest: makeModuleManifest(),
      organizationId: 'org-1',
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
  });

  it('passes manifest and organizationId to the service', async () => {
    mockRegisterModule.mockResolvedValueOnce(makeRegisteredModule());

    const manifest = makeModuleManifest({ module: 'my-module' });
    const req = await makePostRequest({ manifest, organizationId: 'org-xyz' });
    await POST(req);

    expect(mockRegisterModule).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ module: 'my-module' }),
      'org-xyz'
    );
  });

  it('returns 400 on invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
