import { SupabaseClient } from '@supabase/supabase-js';
import {
  ModuleServiceError,
  deregisterModule,
  getModule,
  getModules,
  registerModule,
  updateModule,
} from '../moduleService';
import { makeModuleManifest, makeRegisteredModule, makeRolePermissions, toDbRow } from './testUtils';

// ---------------------------------------------------------------------------
// Supabase mock factory
//
// Returns a mock SupabaseClient where every query chain resolves to the
// provided result objects in sequence.  Each call site receives its own
// tailored mock, so tests remain isolated.
// ---------------------------------------------------------------------------

function makeChain(result: { data: unknown; error: unknown }) {
  const terminal = jest.fn().mockResolvedValue(result);
  const chain: Record<string, jest.Mock> = {};

  const returnChain = () => chain;
  ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit'].forEach((m) => {
    chain[m] = jest.fn().mockImplementation(returnChain);
  });
  chain['single'] = terminal;
  chain['maybeSingle'] = terminal;

  return { chain, terminal };
}

function makeSupabase(
  ...results: Array<{ data: unknown; error: unknown }>
): SupabaseClient {
  let callIndex = 0;
  const chains = results.map(makeChain);

  const from = jest.fn().mockImplementation(() => {
    const c = chains[callIndex] ?? chains[chains.length - 1];
    callIndex++;
    return c.chain;
  });

  return { from } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// registerModule
// ---------------------------------------------------------------------------

describe('registerModule', () => {
  it('successfully registers a valid module and returns it', async () => {
    const module = makeRegisteredModule();
    const row = toDbRow(module);

    // Call 1: maybeSingle() – no duplicate found
    // Call 2: single()     – inserted row
    const supabase = makeSupabase(
      { data: null, error: null },
      { data: row, error: null }
    );

    const result = await registerModule(supabase, makeModuleManifest(), 'org-uuid-1');

    expect(result.module).toBe(module.module);
    expect(result.displayName).toBe(module.displayName);
    expect(result.hasSettings).toBe(module.hasSettings);
    expect(result.organizationId).toBe(module.organizationId);
  });

  it('maps database columns to camelCase properties', async () => {
    const row = toDbRow(makeRegisteredModule());
    const supabase = makeSupabase(
      { data: null, error: null },
      { data: row, error: null }
    );

    const result = await registerModule(supabase, makeModuleManifest(), 'org-uuid-1');

    expect(result).toHaveProperty('displayName');
    expect(result).toHaveProperty('hasSettings');
    expect(result).toHaveProperty('organizationId');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('updatedAt');
  });

  it('throws VALIDATION_ERROR for an invalid manifest (empty module name)', async () => {
    const supabase = makeSupabase();
    const manifest = makeModuleManifest({ module: '' });

    await expect(registerModule(supabase, manifest, 'org-1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for a manifest with uppercase module name', async () => {
    const supabase = makeSupabase();
    const manifest = makeModuleManifest({ module: 'TestModule' });

    await expect(registerModule(supabase, manifest, 'org-1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for a manifest with empty displayName', async () => {
    const supabase = makeSupabase();
    const manifest = makeModuleManifest({ displayName: '' });

    await expect(registerModule(supabase, manifest, 'org-1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws DUPLICATE when the module is already registered for the org', async () => {
    const row = toDbRow(makeRegisteredModule());
    // maybeSingle() returns an existing row
    const supabase = makeSupabase({ data: row, error: null });

    await expect(
      registerModule(supabase, makeModuleManifest(), 'org-uuid-1')
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
  });

  it('throws DATABASE_ERROR when the insert fails', async () => {
    const supabase = makeSupabase(
      { data: null, error: null },
      { data: null, error: { message: 'connection refused' } }
    );

    await expect(
      registerModule(supabase, makeModuleManifest(), 'org-1')
    ).rejects.toMatchObject({ code: 'DATABASE_ERROR' });
  });

  it('throws ModuleServiceError (not a generic Error) on validation failure', async () => {
    const supabase = makeSupabase();
    const manifest = makeModuleManifest({ module: '' });

    await expect(registerModule(supabase, manifest, 'org-1')).rejects.toBeInstanceOf(
      ModuleServiceError
    );
  });

  it('generates and stores default permissions from the manifest', async () => {
    let capturedInsertData: Record<string, unknown> | null = null;

    const chain: Record<string, jest.Mock> = {};
    const returnChain = () => chain;
    ['select', 'eq', 'order', 'limit'].forEach((m) => {
      chain[m] = jest.fn().mockImplementation(returnChain);
    });
    chain['maybeSingle'] = jest.fn().mockResolvedValue({ data: null, error: null });
    chain['single'] = jest.fn().mockResolvedValue({ data: toDbRow(makeRegisteredModule()), error: null });
    chain['insert'] = jest.fn().mockImplementation((data: Record<string, unknown>) => {
      capturedInsertData = data;
      return chain;
    });

    const supabase = { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await registerModule(supabase, makeModuleManifest(), 'org-1');

    expect(capturedInsertData).not.toBeNull();
    expect(capturedInsertData).toHaveProperty('permissions');
  });
});

// ---------------------------------------------------------------------------
// updateModule
// ---------------------------------------------------------------------------

describe('updateModule', () => {
  it('successfully updates displayName', async () => {
    const existing = toDbRow(makeRegisteredModule());
    const updated = { ...existing, display_name: 'Updated Name' };

    const supabase = makeSupabase(
      { data: existing, error: null },
      { data: updated, error: null }
    );

    const result = await updateModule(supabase, 'module-uuid-1', {
      displayName: 'Updated Name',
    });

    expect(result.displayName).toBe('Updated Name');
  });

  it('successfully updates hasSettings', async () => {
    const existing = toDbRow(makeRegisteredModule({ hasSettings: true }));
    const updated = { ...existing, has_settings: false };

    const supabase = makeSupabase(
      { data: existing, error: null },
      { data: updated, error: null }
    );

    const result = await updateModule(supabase, 'module-uuid-1', { hasSettings: false });
    expect(result.hasSettings).toBe(false);
  });

  it('successfully updates permissions', async () => {
    const existing = toDbRow(makeRegisteredModule());
    const newPerms = makeRolePermissions({
      User: { featureAccess: true, settingsAccess: false },
    });
    const updated = { ...existing, permissions: newPerms };

    const supabase = makeSupabase(
      { data: existing, error: null },
      { data: updated, error: null }
    );

    const result = await updateModule(supabase, 'module-uuid-1', {
      permissions: { User: { featureAccess: true, settingsAccess: false } },
    });

    expect(result.permissions.User.featureAccess).toBe(true);
  });

  it('throws NOT_FOUND when the module does not exist', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'not found' } });

    await expect(
      updateModule(supabase, 'nonexistent-id', { displayName: 'New' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws VALIDATION_ERROR when displayName is set to empty string', async () => {
    const existing = toDbRow(makeRegisteredModule());
    const supabase = makeSupabase({ data: existing, error: null });

    await expect(
      updateModule(supabase, 'module-uuid-1', { displayName: '' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR when updated permissions violate constraints', async () => {
    const existing = toDbRow(makeRegisteredModule());
    const supabase = makeSupabase({ data: existing, error: null });

    // settingsAccess true while featureAccess is false
    await expect(
      updateModule(supabase, 'module-uuid-1', {
        permissions: {
          User: { featureAccess: false, settingsAccess: true },
        },
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('merges partial permissions with existing ones', async () => {
    const existing = toDbRow(
      makeRegisteredModule({
        permissions: makeRolePermissions({
          Owner: { featureAccess: true, settingsAccess: true },
          Admin: { featureAccess: true, settingsAccess: false },
          User: { featureAccess: false, settingsAccess: false },
        }),
      })
    );

    let capturedUpdateData: Record<string, unknown> | null = null;
    const chain: Record<string, jest.Mock> = {};
    const returnChain = () => chain;
    ['eq', 'order', 'limit', 'delete'].forEach((m) => {
      chain[m] = jest.fn().mockImplementation(returnChain);
    });
    chain['select'] = jest.fn().mockImplementation(returnChain);
    chain['single'] = jest.fn()
      .mockResolvedValueOnce({ data: existing, error: null })
      .mockResolvedValueOnce({ data: existing, error: null });
    chain['update'] = jest.fn().mockImplementation((data: Record<string, unknown>) => {
      capturedUpdateData = data;
      return chain;
    });

    const supabase = { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await updateModule(supabase, 'module-uuid-1', {
      permissions: { User: { featureAccess: true, settingsAccess: false } },
    });

    expect(capturedUpdateData).not.toBeNull();
    const perms = capturedUpdateData!['permissions'] as ReturnType<typeof makeRolePermissions>;
    // Owner should retain its original values
    expect(perms.Owner).toEqual({ featureAccess: true, settingsAccess: true });
    // User should be updated
    expect(perms.User).toEqual({ featureAccess: true, settingsAccess: false });
  });
});

// ---------------------------------------------------------------------------
// deregisterModule
// ---------------------------------------------------------------------------

describe('deregisterModule', () => {
  it('resolves without error on successful deletion', async () => {
    const supabase = makeSupabase({ data: null, error: null });
    await expect(deregisterModule(supabase, 'module-uuid-1')).resolves.toBeUndefined();
  });

  it('throws DATABASE_ERROR when deletion fails', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'fk violation' } });
    await expect(deregisterModule(supabase, 'module-uuid-1')).rejects.toMatchObject({
      code: 'DATABASE_ERROR',
    });
  });

  it('throws ModuleServiceError on failure', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'error' } });
    await expect(deregisterModule(supabase, 'id')).rejects.toBeInstanceOf(ModuleServiceError);
  });
});

// ---------------------------------------------------------------------------
// getModule
// ---------------------------------------------------------------------------

describe('getModule', () => {
  it('returns the module when found', async () => {
    const row = toDbRow(makeRegisteredModule());
    const supabase = makeSupabase({ data: row, error: null });

    const result = await getModule(supabase, 'module-uuid-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('module-uuid-1');
  });

  it('returns null when the module is not found', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'not found' } });
    const result = await getModule(supabase, 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns null when the query returns no data without error', async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const result = await getModule(supabase, 'any-id');
    expect(result).toBeNull();
  });

  it('maps all fields correctly', async () => {
    const module = makeRegisteredModule();
    const row = toDbRow(module);
    const supabase = makeSupabase({ data: row, error: null });

    const result = await getModule(supabase, module.id);

    expect(result).toEqual(module);
  });
});

// ---------------------------------------------------------------------------
// getModules
// ---------------------------------------------------------------------------

describe('getModules', () => {
  it('returns an array of modules for the organization', async () => {
    const rows = [
      toDbRow(makeRegisteredModule({ id: 'mod-1', module: 'module-a' })),
      toDbRow(makeRegisteredModule({ id: 'mod-2', module: 'module-b' })),
    ];

    const chain: Record<string, jest.Mock> = {};
    const returnChain = () => chain;
    ['select', 'eq', 'single', 'maybeSingle', 'insert', 'update', 'delete', 'limit'].forEach((m) => {
      chain[m] = jest.fn().mockImplementation(returnChain);
    });
    chain['order'] = jest.fn().mockResolvedValue({ data: rows, error: null });

    const supabase = { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    const result = await getModules(supabase, 'org-uuid-1');

    expect(result).toHaveLength(2);
    expect(result[0].module).toBe('module-a');
    expect(result[1].module).toBe('module-b');
  });

  it('returns an empty array when no modules are registered', async () => {
    const chain: Record<string, jest.Mock> = {};
    const returnChain = () => chain;
    ['select', 'eq', 'single', 'maybeSingle', 'insert', 'update', 'delete', 'limit'].forEach((m) => {
      chain[m] = jest.fn().mockImplementation(returnChain);
    });
    chain['order'] = jest.fn().mockResolvedValue({ data: [], error: null });

    const supabase = { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    const result = await getModules(supabase, 'org-with-no-modules');
    expect(result).toEqual([]);
  });

  it('returns an empty array when the query errors', async () => {
    const chain: Record<string, jest.Mock> = {};
    const returnChain = () => chain;
    ['select', 'eq', 'single', 'maybeSingle', 'insert', 'update', 'delete', 'limit'].forEach((m) => {
      chain[m] = jest.fn().mockImplementation(returnChain);
    });
    chain['order'] = jest.fn().mockResolvedValue({ data: null, error: { message: 'db error' } });

    const supabase = { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    const result = await getModules(supabase, 'org-1');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ModuleServiceError
// ---------------------------------------------------------------------------

describe('ModuleServiceError', () => {
  it('is an instance of Error', () => {
    const err = new ModuleServiceError('test', 'NOT_FOUND');
    expect(err).toBeInstanceOf(Error);
  });

  it('sets the name to ModuleServiceError', () => {
    const err = new ModuleServiceError('test', 'NOT_FOUND');
    expect(err.name).toBe('ModuleServiceError');
  });

  it('exposes the code property', () => {
    const codes = ['NOT_FOUND', 'DUPLICATE', 'VALIDATION_ERROR', 'DATABASE_ERROR'] as const;
    for (const code of codes) {
      expect(new ModuleServiceError('msg', code).code).toBe(code);
    }
  });

  it('exposes the message property', () => {
    const err = new ModuleServiceError('something went wrong', 'DATABASE_ERROR');
    expect(err.message).toBe('something went wrong');
  });
});
