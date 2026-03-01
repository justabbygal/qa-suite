import { NextRequest } from 'next/server';
import { ModuleServiceError } from '@/lib/modules/moduleService';
import { makeRegisteredModule, makeRolePermissions } from '@/lib/modules/__tests__/testUtils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}));

const mockGetModule = jest.fn();
const mockUpdateModule = jest.fn();
const mockDeregisterModule = jest.fn();

jest.mock('@/lib/modules/moduleService', () => {
  const actual = jest.requireActual('@/lib/modules/moduleService');
  return {
    ...actual,
    getModule: (...args: unknown[]) => mockGetModule(...args),
    updateModule: (...args: unknown[]) => mockUpdateModule(...args),
    deregisterModule: (...args: unknown[]) => mockDeregisterModule(...args),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET, PUT, DELETE } = require('../[id]/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODULE_ID = 'module-uuid-1';
const params = { params: { id: MODULE_ID } };

function makeReq(method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost/api/modules/${MODULE_ID}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// GET /api/modules/:id
// ---------------------------------------------------------------------------

describe('GET /api/modules/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with the module when found', async () => {
    const module = makeRegisteredModule();
    mockGetModule.mockResolvedValueOnce(module);

    const res = await GET(makeReq(), params);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.module.id).toBe(module.id);
  });

  it('returns 404 when the module is not found', async () => {
    mockGetModule.mockResolvedValueOnce(null);

    const res = await GET(makeReq(), params);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });

  it('returns 500 on unexpected service error', async () => {
    mockGetModule.mockRejectedValueOnce(new Error('network failure'));

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(500);
  });

  it('passes the module id to the service', async () => {
    mockGetModule.mockResolvedValueOnce(makeRegisteredModule());
    await GET(makeReq(), params);
    expect(mockGetModule).toHaveBeenCalledWith(expect.anything(), MODULE_ID);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/modules/:id
// ---------------------------------------------------------------------------

describe('PUT /api/modules/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with the updated module on success', async () => {
    const updated = makeRegisteredModule({ displayName: 'New Name' });
    mockUpdateModule.mockResolvedValueOnce(updated);

    const res = await PUT(makeReq('PUT', { displayName: 'New Name' }), params);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.module.displayName).toBe('New Name');
  });

  it('returns 404 when the service throws NOT_FOUND', async () => {
    mockUpdateModule.mockRejectedValueOnce(
      new ModuleServiceError('Module not found', 'NOT_FOUND')
    );

    const res = await PUT(makeReq('PUT', { displayName: 'x' }), params);
    expect(res.status).toBe(404);
  });

  it('returns 422 when the service throws VALIDATION_ERROR', async () => {
    mockUpdateModule.mockRejectedValueOnce(
      new ModuleServiceError('displayName cannot be empty', 'VALIDATION_ERROR')
    );

    const res = await PUT(makeReq('PUT', { displayName: '' }), params);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/displayName/i);
  });

  it('returns 500 on unexpected service error', async () => {
    mockUpdateModule.mockRejectedValueOnce(new Error('timeout'));

    const res = await PUT(makeReq('PUT', { hasSettings: false }), params);
    expect(res.status).toBe(500);
  });

  it('returns 400 on invalid JSON body', async () => {
    const req = new NextRequest(`http://localhost/api/modules/${MODULE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad-json',
    });
    const res = await PUT(req, params);
    expect(res.status).toBe(400);
  });

  it('passes the module id and update payload to the service', async () => {
    mockUpdateModule.mockResolvedValueOnce(makeRegisteredModule());

    const updates = { hasSettings: false };
    await PUT(makeReq('PUT', updates), params);

    expect(mockUpdateModule).toHaveBeenCalledWith(
      expect.anything(),
      MODULE_ID,
      expect.objectContaining({ hasSettings: false })
    );
  });

  it('returns 200 when updating permissions', async () => {
    const updated = makeRegisteredModule({
      permissions: makeRolePermissions({ User: { featureAccess: true, settingsAccess: false } }),
    });
    mockUpdateModule.mockResolvedValueOnce(updated);

    const res = await PUT(
      makeReq('PUT', { permissions: { User: { featureAccess: true, settingsAccess: false } } }),
      params
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.module.permissions.User.featureAccess).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/modules/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/modules/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with success:true on successful deletion', async () => {
    mockDeregisterModule.mockResolvedValueOnce(undefined);

    const res = await DELETE(makeReq('DELETE'), params);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 500 when the service throws DATABASE_ERROR', async () => {
    mockDeregisterModule.mockRejectedValueOnce(
      new ModuleServiceError('fk constraint violation', 'DATABASE_ERROR')
    );

    const res = await DELETE(makeReq('DELETE'), params);
    expect(res.status).toBe(500);
  });

  it('returns 500 on unexpected service error', async () => {
    mockDeregisterModule.mockRejectedValueOnce(new Error('connection refused'));

    const res = await DELETE(makeReq('DELETE'), params);
    expect(res.status).toBe(500);
  });

  it('passes the module id to the service', async () => {
    mockDeregisterModule.mockResolvedValueOnce(undefined);

    await DELETE(makeReq('DELETE'), params);

    expect(mockDeregisterModule).toHaveBeenCalledWith(expect.anything(), MODULE_ID);
  });
});
