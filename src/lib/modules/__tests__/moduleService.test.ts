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
// The chain is made thenable so that awaiting it directly (e.g. in
// deregisterModule / getModules) resolves with the configured result.
// ---------------------------------------------------------------------------

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const returnChain = () => chain;

  ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit'].forEach((m) => {
    (chain as Record<string, jest.Mock>)[m] = jest.fn().mockImplementation(returnChain);
  });

  // Terminal methods that return a Promise directly
  (chain as Record<string, jest.Mock>)['single'] = jest.fn().mockResolvedValue(result);
  (chain as Record<string, jest.Mock>)['maybeSingle'] = jest.fn().mockResolvedValue(result);

  // Make the chain itself awaitable (thenable) for cases like delete().eq()
  (chain as Record<string, unknown>)['then'] = (
    resolve: (v: typeof result) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);

  return chain;
}

function makeSupabase(...results: Array<{ data: unknown; error: unknown }>): SupabaseClient {
  let callIndex = 0;
  const chains = results.map(makeChain);

  const from = jest.fn().mockImplementation(() => {
    const c = chains[callIndex] ?? chains[chains.length - 1];
    callIndex++;
    return c;
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

    const supabase = makeSupabase(
      { data: null, error: null },      // maybeSingle – no duplicate
      { data: row, error: null }        // single – insert result
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

    const chain = makeChain({ data: toDbRow(makeRegisteredModule()), error: null });
    const maybeSingleChain = makeChain({ data: null, error: null });

    let callCount = 0;
    const from = jest.fn().mockImplementation(() => {
      if (callCount === 0) {
        callCount++;
        return maybeSingleChain;
      }
      // Override insert to capture data
      const insertChain = { ...chain };
      (insertChain as Record<string, unknown>)['insert'] = jest.fn().mockImplementation(
        (data: Record<string, unknown>) => {
          capturedInsertData = data;
          return chain;
        }
      );
      return insertChain;
    });

    const supabase = { from } as unknown as SupabaseClient;
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

    await expect(
      updateModule(supabase, 'module-uuid-1', {
        permissions: {
          User: { featureAccess: false, settingsAccess: true },
        },
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
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

    // getModules uses .order() as the terminal awaitable
    const chain: Record<string, unknown> = {};
    const returnChain = () => chain;
    ['select', 'eq', 'single', 'maybeSingle', 'insert', 'update', 'delete', 'limit'].forEach(
      (m) => { (chain as Record<string, jest.Mock>)[m] = jest.fn().mockImplementation(returnChain); }
    );
    (chain as Record<string, jest.Mock>)['order'] = jest
      .fn()
      .mockResolvedValue({ data: rows, error: null });

    const supabase = { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    const result = await getModules(supabase, 'org-uuid-1');

    expect(result).toHaveLength(2);
    expect(result[0].module).toBe('module-a');
    expect(result[1].module).toBe('module-b');
  });

  it('returns an empty array when no modules are registered', async () => {
    const chain: Record<string, unknown> = {};
    const returnChain = () => chain;
    ['select', 'eq', 'single', 'maybeSingle', 'insert', 'update', 'delete', 'limit'].forEach(
      (m) => { (chain as Record<string, jest.Mock>)[m] = jest.fn().mockImplementation(returnChain); }
    );
    (chain as Record<string, jest.Mock>)['order'] = jest
      .fn()
      .mockResolvedValue({ data: [], error: null });

    const supabase = { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    const result = await getModules(supabase, 'empty-org');
    expect(result).toEqual([]);
  });

  it('returns an empty array when the query errors', async () => {
    const chain: Record<string, unknown> = {};
    const returnChain = () => chain;
    ['select', 'eq', 'single', 'maybeSingle', 'insert', 'update', 'delete', 'limit'].forEach(
      (m) => { (chain as Record<string, jest.Mock>)[m] = jest.fn().mockImplementation(returnChain); }
    );
    (chain as Record<string, jest.Mock>)['order'] = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'db error' } });

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
