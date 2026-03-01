/**
 * Integration tests for the complete module registration workflow.
 *
 * These tests exercise the service layer end-to-end using a mock Supabase
 * client that simulates realistic query sequences.  They verify that all the
 * pieces – validation, permission generation, DB writes, and error handling –
 * work together correctly.
 */

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
import { validatePermissions } from '../permissionGenerator';

// ---------------------------------------------------------------------------
// Shared mock builder
//
// Every chain method is either chainable or resolves when awaited.
// ---------------------------------------------------------------------------

function buildSequentialSupabase(
  responses: Array<{ data: unknown; error: unknown }>
): SupabaseClient {
  let index = 0;

  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const returnChain = () => chain;

    ['select', 'insert', 'update', 'delete', 'eq', 'limit'].forEach((m) => {
      (chain as Record<string, jest.Mock>)[m] = jest.fn().mockImplementation(returnChain);
    });

    // Make chain thenable so `await chain.delete().eq()` works
    chain['then'] = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown
    ) => {
      const r = responses[index] ?? responses[responses.length - 1];
      index++;
      return Promise.resolve(r).then(resolve, reject);
    };

    // Terminal methods that return a Promise directly
    (chain as Record<string, jest.Mock>)['single'] = jest.fn().mockImplementation(() => {
      const r = responses[index] ?? responses[responses.length - 1];
      index++;
      return Promise.resolve(r);
    });

    (chain as Record<string, jest.Mock>)['maybeSingle'] = jest.fn().mockImplementation(() => {
      const r = responses[index] ?? responses[responses.length - 1];
      index++;
      return Promise.resolve(r);
    });

    // .order() is the terminal for getModules
    (chain as Record<string, jest.Mock>)['order'] = jest.fn().mockImplementation(() => {
      const r = responses[index] ?? responses[responses.length - 1];
      index++;
      return Promise.resolve(r);
    });

    return chain;
  }

  return { from: jest.fn().mockImplementation(makeChain) } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Full registration workflow
// ---------------------------------------------------------------------------

describe('Integration – full registration workflow', () => {
  it('registers a module and returns a correctly shaped RegisteredModule', async () => {
    const module = makeRegisteredModule();
    const row = toDbRow(module);

    const supabase = buildSequentialSupabase([
      { data: null, error: null },    // maybeSingle – no duplicate
      { data: row, error: null },     // single – insert result
    ]);

    const result = await registerModule(supabase, makeModuleManifest(), 'org-uuid-1');

    expect(result.id).toBe(module.id);
    expect(result.module).toBe(module.module);
    expect(result.displayName).toBe(module.displayName);
    expect(result.organizationId).toBe(module.organizationId);
    expect(result.permissions).toBeDefined();
    const { valid } = validatePermissions(result.permissions);
    expect(valid).toBe(true);
  });

  it('rejects duplicate registration within the same organization', async () => {
    const existingRow = toDbRow(makeRegisteredModule());

    const supabase = buildSequentialSupabase([
      { data: existingRow, error: null }, // maybeSingle – duplicate found
    ]);

    await expect(
      registerModule(supabase, makeModuleManifest(), 'org-uuid-1')
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
  });

  it('allows the same module slug in different organizations', async () => {
    const moduleA = makeRegisteredModule({ organizationId: 'org-a' });
    const rowA = toDbRow(moduleA);

    const supabase = buildSequentialSupabase([
      { data: null, error: null },    // maybeSingle – not a duplicate for org-b
      { data: rowA, error: null },    // single – insert
    ]);

    await expect(
      registerModule(supabase, makeModuleManifest(), 'org-b')
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Update workflow
// ---------------------------------------------------------------------------

describe('Integration – update workflow', () => {
  it('applies displayName change and returns the updated module', async () => {
    const existingRow = toDbRow(makeRegisteredModule());
    const updatedRow = { ...existingRow, display_name: 'Renamed Module' };

    const supabase = buildSequentialSupabase([
      { data: existingRow, error: null },   // single – fetch current
      { data: updatedRow, error: null },    // single – update result
    ]);

    const result = await updateModule(supabase, 'module-uuid-1', { displayName: 'Renamed Module' });
    expect(result.displayName).toBe('Renamed Module');
  });

  it('merges permission updates with existing permissions', async () => {
    const existing = makeRegisteredModule({
      permissions: makeRolePermissions({
        User: { featureAccess: false, settingsAccess: false },
      }),
    });
    const existingRow = toDbRow(existing);

    const updatedPermissions = makeRolePermissions({
      User: { featureAccess: true, settingsAccess: false },
    });
    const updatedRow = { ...existingRow, permissions: updatedPermissions };

    const supabase = buildSequentialSupabase([
      { data: existingRow, error: null },
      { data: updatedRow, error: null },
    ]);

    const result = await updateModule(supabase, 'module-uuid-1', {
      permissions: { User: { featureAccess: true, settingsAccess: false } },
    });

    expect(result.permissions.User.featureAccess).toBe(true);
    expect(result.permissions.Owner).toEqual(existing.permissions.Owner);
    expect(result.permissions.Admin).toEqual(existing.permissions.Admin);
  });

  it('rejects invalid permission constraints during update', async () => {
    const existing = makeRegisteredModule({
      permissions: makeRolePermissions({
        Admin: { featureAccess: true, settingsAccess: true },
      }),
    });
    const existingRow = toDbRow(existing);

    const supabase = buildSequentialSupabase([{ data: existingRow, error: null }]);

    // Setting featureAccess to false while settingsAccess is still true should fail
    await expect(
      updateModule(supabase, 'module-uuid-1', {
        permissions: { Admin: { featureAccess: false, settingsAccess: true } },
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects update for a non-existent module with NOT_FOUND', async () => {
    const supabase = buildSequentialSupabase([{ data: null, error: { message: 'no rows' } }]);

    await expect(
      updateModule(supabase, 'ghost-module', { displayName: 'Ghost' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// Deregistration workflow
// ---------------------------------------------------------------------------

describe('Integration – deregistration workflow', () => {
  it('deregisters a module successfully', async () => {
    const supabase = buildSequentialSupabase([{ data: null, error: null }]);
    await expect(deregisterModule(supabase, 'module-uuid-1')).resolves.toBeUndefined();
  });

  it('throws DATABASE_ERROR when deregistration fails', async () => {
    const supabase = buildSequentialSupabase([
      { data: null, error: { message: 'foreign key constraint' } },
    ]);

    await expect(deregisterModule(supabase, 'module-uuid-1')).rejects.toMatchObject({
      code: 'DATABASE_ERROR',
    });
  });
});

// ---------------------------------------------------------------------------
// Read workflows
// ---------------------------------------------------------------------------

describe('Integration – read workflows', () => {
  it('retrieves a single module by id', async () => {
    const module = makeRegisteredModule({ id: 'target-mod' });
    const supabase = buildSequentialSupabase([{ data: toDbRow(module), error: null }]);

    const result = await getModule(supabase, 'target-mod');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('target-mod');
  });

  it('returns null for a non-existent module id', async () => {
    const supabase = buildSequentialSupabase([{ data: null, error: { message: 'no rows' } }]);
    const result = await getModule(supabase, 'non-existent');
    expect(result).toBeNull();
  });

  it('lists all modules for an organization in order', async () => {
    const modules = [
      toDbRow(makeRegisteredModule({ id: 'm1', module: 'alpha-module' })),
      toDbRow(makeRegisteredModule({ id: 'm2', module: 'beta-module' })),
      toDbRow(makeRegisteredModule({ id: 'm3', module: 'gamma-module' })),
    ];

    const supabase = buildSequentialSupabase([{ data: modules, error: null }]);
    const result = await getModules(supabase, 'org-uuid-1');

    expect(result).toHaveLength(3);
    expect(result.map((m) => m.module)).toEqual(['alpha-module', 'beta-module', 'gamma-module']);
  });

  it('returns empty array for an organization with no modules', async () => {
    const supabase = buildSequentialSupabase([{ data: [], error: null }]);
    const result = await getModules(supabase, 'empty-org');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Error type contract
// ---------------------------------------------------------------------------

describe('Integration – error type contract', () => {
  it('thrown errors from registerModule are instances of ModuleServiceError', async () => {
    const supabase = buildSequentialSupabase([]);
    await expect(
      registerModule(supabase, makeModuleManifest({ module: 'Bad Module' }), 'org')
    ).rejects.toBeInstanceOf(ModuleServiceError);
  });

  it('thrown errors from updateModule are instances of ModuleServiceError', async () => {
    const supabase = buildSequentialSupabase([{ data: null, error: { message: 'not found' } }]);
    await expect(
      updateModule(supabase, 'ghost', { displayName: 'x' })
    ).rejects.toBeInstanceOf(ModuleServiceError);
  });

  it('thrown errors from deregisterModule are instances of ModuleServiceError', async () => {
    const supabase = buildSequentialSupabase([{ data: null, error: { message: 'fk' } }]);
    await expect(deregisterModule(supabase, 'id')).rejects.toBeInstanceOf(ModuleServiceError);
  });
});

// ---------------------------------------------------------------------------
// Permission generation – integration
// ---------------------------------------------------------------------------

describe('Integration – permission generation', () => {
  it('generated permissions always pass validatePermissions', async () => {
    const row = toDbRow(makeRegisteredModule());

    const manifests = [
      makeModuleManifest({ defaultAccess: makeRolePermissions() }),
      makeModuleManifest({
        defaultAccess: {
          Owner: { featureAccess: true, settingsAccess: true },
          Admin: { featureAccess: true, settingsAccess: true },
          User: { featureAccess: true, settingsAccess: true },
        },
      }),
    ];

    for (const manifest of manifests) {
      const supabase = buildSequentialSupabase([
        { data: null, error: null },
        { data: row, error: null },
      ]);
      await expect(registerModule(supabase, manifest, 'org')).resolves.toBeDefined();
    }
  });

  it('corrects invalid defaultAccess (settingsAccess true + featureAccess false) before persisting', async () => {
    let capturedPermissions: unknown = null;

    const chain: Record<string, unknown> = {};
    const returnChain = () => chain;
    ['select', 'eq', 'order', 'limit'].forEach((m) => {
      (chain as Record<string, jest.Mock>)[m] = jest.fn().mockImplementation(returnChain);
    });
    (chain as Record<string, jest.Mock>)['maybeSingle'] = jest
      .fn()
      .mockResolvedValue({ data: null, error: null });
    (chain as Record<string, jest.Mock>)['insert'] = jest
      .fn()
      .mockImplementation((data: Record<string, unknown>) => {
        capturedPermissions = data['permissions'];
        return chain;
      });
    (chain as Record<string, jest.Mock>)['single'] = jest
      .fn()
      .mockResolvedValue({ data: toDbRow(makeRegisteredModule()), error: null });

    const supabase = {
      from: jest.fn().mockReturnValue(chain),
    } as unknown as SupabaseClient;

    const manifest = makeModuleManifest({
      defaultAccess: makeRolePermissions({
        User: { featureAccess: false, settingsAccess: true }, // invalid – should be corrected
      }),
    });

    await registerModule(supabase, manifest, 'org');

    expect(capturedPermissions).not.toBeNull();
    const userPerm = (capturedPermissions as ReturnType<typeof makeRolePermissions>).User;
    expect(userPerm.settingsAccess).toBe(false);
  });
});
