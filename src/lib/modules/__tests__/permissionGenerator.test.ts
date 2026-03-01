import {
  applyPermissionConstraints,
  generateDefaultPermissions,
  hierarchicalDefaultAccess,
  validateModuleManifest,
  validatePermissions,
} from '../permissionGenerator';
import { ModuleManifest, RolePermissions } from '../types';
import { makeModuleManifest, makeRolePermissions } from './testUtils';

// ---------------------------------------------------------------------------
// generateDefaultPermissions
// ---------------------------------------------------------------------------

describe('generateDefaultPermissions', () => {
  it('copies featureAccess and settingsAccess from the manifest defaultAccess', () => {
    const manifest = makeModuleManifest({
      defaultAccess: makeRolePermissions({
        Owner: { featureAccess: true, settingsAccess: true },
        Admin: { featureAccess: true, settingsAccess: false },
        User: { featureAccess: false, settingsAccess: false },
      }),
    });

    const result = generateDefaultPermissions(manifest);

    expect(result.Owner).toEqual({ featureAccess: true, settingsAccess: true });
    expect(result.Admin).toEqual({ featureAccess: true, settingsAccess: false });
    expect(result.User).toEqual({ featureAccess: false, settingsAccess: false });
  });

  it('produces permissions for all three roles', () => {
    const manifest = makeModuleManifest();
    const result = generateDefaultPermissions(manifest);
    expect(result).toHaveProperty('Owner');
    expect(result).toHaveProperty('Admin');
    expect(result).toHaveProperty('User');
  });

  it('enforces that settingsAccess is false when featureAccess is false', () => {
    const manifest = makeModuleManifest({
      defaultAccess: makeRolePermissions({
        User: { featureAccess: false, settingsAccess: true }, // invalid in source
      }),
    });

    const result = generateDefaultPermissions(manifest);

    expect(result.User.featureAccess).toBe(false);
    expect(result.User.settingsAccess).toBe(false);
  });

  it('allows settingsAccess to be true when featureAccess is true', () => {
    const manifest = makeModuleManifest({
      defaultAccess: makeRolePermissions({
        Owner: { featureAccess: true, settingsAccess: true },
      }),
    });

    const result = generateDefaultPermissions(manifest);
    expect(result.Owner.settingsAccess).toBe(true);
  });

  it('returns all-false permissions when defaultAccess has all false', () => {
    const manifest = makeModuleManifest({
      defaultAccess: {
        Owner: { featureAccess: false, settingsAccess: false },
        Admin: { featureAccess: false, settingsAccess: false },
        User: { featureAccess: false, settingsAccess: false },
      },
    });

    const result = generateDefaultPermissions(manifest);
    expect(result.Owner).toEqual({ featureAccess: false, settingsAccess: false });
    expect(result.Admin).toEqual({ featureAccess: false, settingsAccess: false });
    expect(result.User).toEqual({ featureAccess: false, settingsAccess: false });
  });

  it('returns all-true permissions when defaultAccess has all true', () => {
    const manifest = makeModuleManifest({
      defaultAccess: {
        Owner: { featureAccess: true, settingsAccess: true },
        Admin: { featureAccess: true, settingsAccess: true },
        User: { featureAccess: true, settingsAccess: true },
      },
    });

    const result = generateDefaultPermissions(manifest);
    expect(result.Owner).toEqual({ featureAccess: true, settingsAccess: true });
    expect(result.Admin).toEqual({ featureAccess: true, settingsAccess: true });
    expect(result.User).toEqual({ featureAccess: true, settingsAccess: true });
  });
});

// ---------------------------------------------------------------------------
// validatePermissions
// ---------------------------------------------------------------------------

describe('validatePermissions', () => {
  it('returns valid for a well-formed permissions object', () => {
    const permissions = makeRolePermissions();
    const { valid, errors } = validatePermissions(permissions);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('returns invalid when a role entry is missing', () => {
    const permissions = {
      Owner: { featureAccess: true, settingsAccess: true },
      Admin: { featureAccess: true, settingsAccess: false },
      // User missing
    } as unknown as RolePermissions;

    const { valid, errors } = validatePermissions(permissions);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('User'))).toBe(true);
  });

  it('returns invalid when featureAccess is not a boolean', () => {
    const permissions = makeRolePermissions({
      User: { featureAccess: 'yes' as unknown as boolean, settingsAccess: false },
    });

    const { valid, errors } = validatePermissions(permissions);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('featureAccess') && e.includes('User'))).toBe(true);
  });

  it('returns invalid when settingsAccess is not a boolean', () => {
    const permissions = makeRolePermissions({
      Admin: { featureAccess: true, settingsAccess: 1 as unknown as boolean },
    });

    const { valid, errors } = validatePermissions(permissions);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('settingsAccess') && e.includes('Admin'))).toBe(true);
  });

  it('returns invalid when settingsAccess is true and featureAccess is false', () => {
    const permissions = makeRolePermissions({
      User: { featureAccess: false, settingsAccess: true },
    });

    const { valid, errors } = validatePermissions(permissions);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('settingsAccess') && e.includes('User'))).toBe(true);
  });

  it('collects errors for multiple invalid roles simultaneously', () => {
    const permissions = {
      Owner: { featureAccess: false, settingsAccess: true }, // invalid constraint
      Admin: { featureAccess: false, settingsAccess: true }, // invalid constraint
      User: { featureAccess: false, settingsAccess: false },
    };

    const { valid, errors } = validatePermissions(permissions);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// validateModuleManifest
// ---------------------------------------------------------------------------

describe('validateModuleManifest', () => {
  it('returns valid for a correct manifest', () => {
    const manifest = makeModuleManifest();
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('returns invalid when module identifier is missing', () => {
    const manifest = makeModuleManifest({ module: '' });
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('module identifier'))).toBe(true);
  });

  it('returns invalid when module identifier contains uppercase letters', () => {
    const manifest = makeModuleManifest({ module: 'TestModule' });
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('kebab-case'))).toBe(true);
  });

  it('returns invalid when module identifier has leading hyphens', () => {
    const manifest = makeModuleManifest({ module: '-test-module' });
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('kebab-case'))).toBe(true);
  });

  it('returns invalid when module identifier has trailing hyphens', () => {
    const manifest = makeModuleManifest({ module: 'test-module-' });
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('kebab-case'))).toBe(true);
  });

  it('returns invalid when module identifier contains spaces', () => {
    const manifest = makeModuleManifest({ module: 'test module' });
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('kebab-case'))).toBe(true);
  });

  it('accepts module identifiers with numbers', () => {
    const manifest = makeModuleManifest({ module: 'module-v2' });
    const { valid } = validateModuleManifest(manifest);
    expect(valid).toBe(true);
  });

  it('returns invalid when displayName is missing', () => {
    const manifest = makeModuleManifest({ displayName: '' });
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('displayName'))).toBe(true);
  });

  it('returns invalid when displayName is whitespace only', () => {
    const manifest = makeModuleManifest({ displayName: '   ' });
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('displayName'))).toBe(true);
  });

  it('returns invalid when hasSettings is not a boolean', () => {
    const manifest = makeModuleManifest({
      hasSettings: 'true' as unknown as boolean,
    });
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('hasSettings'))).toBe(true);
  });

  it('returns invalid when defaultAccess is missing', () => {
    const manifest = { ...makeModuleManifest() };
    delete (manifest as Partial<ModuleManifest>).defaultAccess;
    const { valid, errors } = validateModuleManifest(manifest as ModuleManifest);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('defaultAccess'))).toBe(true);
  });

  it('returns invalid when defaultAccess has invalid permissions', () => {
    const manifest = makeModuleManifest({
      defaultAccess: makeRolePermissions({
        Owner: { featureAccess: false, settingsAccess: true },
      }),
    });
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('collects multiple errors at once', () => {
    const manifest = {
      module: '',
      displayName: '',
      hasSettings: 'yes',
    } as unknown as ModuleManifest;
    const { valid, errors } = validateModuleManifest(manifest);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// applyPermissionConstraints
// ---------------------------------------------------------------------------

describe('applyPermissionConstraints', () => {
  it('returns permissions unchanged when all are valid', () => {
    const permissions = makeRolePermissions();
    const result = applyPermissionConstraints(permissions);
    expect(result).toEqual(permissions);
  });

  it('sets settingsAccess to false when featureAccess is false', () => {
    const permissions = makeRolePermissions({
      User: { featureAccess: false, settingsAccess: true },
    });
    const result = applyPermissionConstraints(permissions);
    expect(result.User.settingsAccess).toBe(false);
  });

  it('preserves settingsAccess when featureAccess is true', () => {
    const permissions = makeRolePermissions({
      Owner: { featureAccess: true, settingsAccess: true },
    });
    const result = applyPermissionConstraints(permissions);
    expect(result.Owner.settingsAccess).toBe(true);
  });

  it('does not mutate the input object', () => {
    const permissions = makeRolePermissions({
      User: { featureAccess: false, settingsAccess: true },
    });
    const original = JSON.stringify(permissions);
    applyPermissionConstraints(permissions);
    expect(JSON.stringify(permissions)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// hierarchicalDefaultAccess
// ---------------------------------------------------------------------------

describe('hierarchicalDefaultAccess', () => {
  it('gives Owner full access', () => {
    const defaults = hierarchicalDefaultAccess();
    expect(defaults.Owner).toEqual({ featureAccess: true, settingsAccess: true });
  });

  it('gives Admin feature access but not settings access', () => {
    const defaults = hierarchicalDefaultAccess();
    expect(defaults.Admin).toEqual({ featureAccess: true, settingsAccess: false });
  });

  it('gives User no access', () => {
    const defaults = hierarchicalDefaultAccess();
    expect(defaults.User).toEqual({ featureAccess: false, settingsAccess: false });
  });

  it('returns a valid permission set', () => {
    const defaults = hierarchicalDefaultAccess();
    const { valid } = validatePermissions(defaults);
    expect(valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generatePermissionKeys
// ---------------------------------------------------------------------------

describe('generatePermissionKeys', () => {
  it('always generates a feature.access key', () => {
    const keys = generatePermissionKeys({ module: 'my-module', hasSettings: false });
    expect(keys).toContain('my-module.feature.access');
  });

  it('returns only the feature.access key when hasSettings is false', () => {
    const keys = generatePermissionKeys({ module: 'my-module', hasSettings: false });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe('my-module.feature.access');
  });

  it('returns both keys when hasSettings is true', () => {
    const keys = generatePermissionKeys({ module: 'my-module', hasSettings: true });
    expect(keys).toHaveLength(2);
    expect(keys).toContain('my-module.feature.access');
    expect(keys).toContain('my-module.settings.modify');
  });

  it('uses the module slug verbatim in the key', () => {
    const keys = generatePermissionKeys({ module: 'user-management', hasSettings: true });
    expect(keys[0]).toMatch(/^user-management\./);
    expect(keys[1]).toMatch(/^user-management\./);
  });

  it('works with a manifest that has numeric segments', () => {
    const keys = generatePermissionKeys({ module: 'module-v2', hasSettings: true });
    expect(keys).toContain('module-v2.feature.access');
    expect(keys).toContain('module-v2.settings.modify');
  });
});

// ---------------------------------------------------------------------------
// resolveKeyAccess
// ---------------------------------------------------------------------------

describe('resolveKeyAccess', () => {
  const permissions = makeRolePermissions({
    Owner: { featureAccess: true, settingsAccess: true },
    Admin: { featureAccess: true, settingsAccess: false },
    User: { featureAccess: false, settingsAccess: false },
  });

  it('maps feature.access key to featureAccess for each role', () => {
    const result = resolveKeyAccess('my-module.feature.access', permissions);
    expect(result.ownerAccess).toBe(true);
    expect(result.adminAccess).toBe(true);
    expect(result.userAccess).toBe(false);
  });

  it('maps settings.modify key to settingsAccess for each role', () => {
    const result = resolveKeyAccess('my-module.settings.modify', permissions);
    expect(result.ownerAccess).toBe(true);   // Owner.settingsAccess
    expect(result.adminAccess).toBe(false);  // Admin.settingsAccess
    expect(result.userAccess).toBe(false);   // User.settingsAccess
  });

  it('uses featureAccess values for any non-settings key', () => {
    const result = resolveKeyAccess('my-module.feature.access', permissions);
    expect(result.ownerAccess).toBe(permissions.Owner.featureAccess);
    expect(result.adminAccess).toBe(permissions.Admin.featureAccess);
    expect(result.userAccess).toBe(permissions.User.featureAccess);
  });

  it('returns all-false when all permissions are false', () => {
    const allFalse = makeRolePermissions({
      Owner: { featureAccess: false, settingsAccess: false },
      Admin: { featureAccess: false, settingsAccess: false },
      User: { featureAccess: false, settingsAccess: false },
    });
    const result = resolveKeyAccess('my-module.feature.access', allFalse);
    expect(result).toEqual({ ownerAccess: false, adminAccess: false, userAccess: false });
  });
});

// ---------------------------------------------------------------------------
// createPermissionRecords
// ---------------------------------------------------------------------------

describe('createPermissionRecords', () => {
  it('upserts one record when hasSettings is false', async () => {
    const module = makeRegisteredModule({ hasSettings: false });
    const row = makePermissionRow('test-module.feature.access');
    const supabase = makePermSupabase({ data: [row], error: null });

    const result = await createPermissionRecords(supabase, module);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('test-module.feature.access');
  });

  it('upserts two records when hasSettings is true', async () => {
    const module = makeRegisteredModule({ hasSettings: true });
    const rows = [
      makePermissionRow('test-module.feature.access', { id: 'perm-1' }),
      makePermissionRow('test-module.settings.modify', { id: 'perm-2' }),
    ];
    const supabase = makePermSupabase({ data: rows, error: null });

    const result = await createPermissionRecords(supabase, module);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.key)).toContain('test-module.feature.access');
    expect(result.map((r) => r.key)).toContain('test-module.settings.modify');
  });

  it('maps DB columns to camelCase PermissionRecord properties', async () => {
    const module = makeRegisteredModule({ hasSettings: false });
    const row = makePermissionRow('test-module.feature.access');
    const supabase = makePermSupabase({ data: [row], error: null });

    const result = await createPermissionRecords(supabase, module);
    const record = result[0];

    expect(record).toHaveProperty('id');
    expect(record).toHaveProperty('key');
    expect(record).toHaveProperty('moduleId');
    expect(record).toHaveProperty('organizationId');
    expect(record).toHaveProperty('ownerAccess');
    expect(record).toHaveProperty('adminAccess');
    expect(record).toHaveProperty('userAccess');
    expect(record).toHaveProperty('createdAt');
    expect(record).toHaveProperty('updatedAt');
  });

  it('applies featureAccess values to the feature.access insert', async () => {
    const permissions = makeRolePermissions({
      Owner: { featureAccess: true, settingsAccess: true },
      Admin: { featureAccess: true, settingsAccess: false },
      User: { featureAccess: false, settingsAccess: false },
    });
    const module = makeRegisteredModule({ hasSettings: false, permissions });

    let capturedUpsertData: unknown = null;
    const chain: Record<string, jest.Mock> = {};
    const returnChain = () => chain;
    ['select', 'delete', 'eq', 'order', 'limit'].forEach((m) => {
      chain[m] = jest.fn().mockImplementation(returnChain);
    });
    chain['upsert'] = jest.fn().mockImplementation((data: unknown) => {
      capturedUpsertData = data;
      return chain;
    });
    chain['then'] = jest.fn((onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled)
    );
    const supabase = { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await createPermissionRecords(supabase, module);

    const inserts = capturedUpsertData as Array<Record<string, unknown>>;
    expect(inserts).toHaveLength(1);
    expect(inserts[0]['owner_access']).toBe(true);
    expect(inserts[0]['admin_access']).toBe(true);
    expect(inserts[0]['user_access']).toBe(false);
  });

  it('applies settingsAccess values to the settings.modify insert', async () => {
    const permissions = makeRolePermissions({
      Owner: { featureAccess: true, settingsAccess: true },
      Admin: { featureAccess: true, settingsAccess: false },
      User: { featureAccess: false, settingsAccess: false },
    });
    const module = makeRegisteredModule({ hasSettings: true, permissions });

    let capturedUpsertData: unknown = null;
    const chain: Record<string, jest.Mock> = {};
    const returnChain = () => chain;
    ['select', 'delete', 'eq', 'order', 'limit'].forEach((m) => {
      chain[m] = jest.fn().mockImplementation(returnChain);
    });
    chain['upsert'] = jest.fn().mockImplementation((data: unknown) => {
      capturedUpsertData = data;
      return chain;
    });
    chain['then'] = jest.fn((onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled)
    );
    const supabase = { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await createPermissionRecords(supabase, module);

    const inserts = capturedUpsertData as Array<Record<string, unknown>>;
    const settingsInsert = inserts.find((i) => (i['key'] as string).endsWith('.settings.modify'));
    expect(settingsInsert).toBeDefined();
    expect(settingsInsert!['owner_access']).toBe(true);   // Owner.settingsAccess
    expect(settingsInsert!['admin_access']).toBe(false);  // Admin.settingsAccess
    expect(settingsInsert!['user_access']).toBe(false);   // User.settingsAccess
  });

  it('throws when the database operation fails', async () => {
    const module = makeRegisteredModule();
    const supabase = makePermSupabase({ data: null, error: { message: 'db error' } });

    await expect(createPermissionRecords(supabase, module)).rejects.toThrow('db error');
  });

  it('returns an empty array when the upsert returns no data', async () => {
    const module = makeRegisteredModule({ hasSettings: false });
    const supabase = makePermSupabase({ data: null, error: null });

    const result = await createPermissionRecords(supabase, module);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updatePermissionRecords
// ---------------------------------------------------------------------------

describe('updatePermissionRecords', () => {
  it('deletes the settings.modify record when hasSettings is false', async () => {
    const module = makeRegisteredModule({ hasSettings: false });
    const featureRow = makePermissionRow('test-module.feature.access');

    // Call 1: from() for delete operation
    // Call 2: from() for createPermissionRecords upsert
    const supabase = makePermSupabase(
      { data: null, error: null },
      { data: [featureRow], error: null }
    );

    const result = await updatePermissionRecords(supabase, module);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('test-module.feature.access');
  });

  it('does not issue a delete when hasSettings is true', async () => {
    const module = makeRegisteredModule({ hasSettings: true });
    const rows = [
      makePermissionRow('test-module.feature.access', { id: 'p1' }),
      makePermissionRow('test-module.settings.modify', { id: 'p2' }),
    ];

    // Only one DB call expected (the upsert); if a spurious delete were
    // issued it would consume the only chain and the upsert would error.
    const supabase = makePermSupabase({ data: rows, error: null });

    const result = await updatePermissionRecords(supabase, module);
    expect(result).toHaveLength(2);
  });

  it('throws when the delete operation fails', async () => {
    const module = makeRegisteredModule({ hasSettings: false });
    const supabase = makePermSupabase({ data: null, error: { message: 'delete failed' } });

    await expect(updatePermissionRecords(supabase, module)).rejects.toThrow('delete failed');
  });

  it('throws when the subsequent upsert fails', async () => {
    const module = makeRegisteredModule({ hasSettings: false });
    const supabase = makePermSupabase(
      { data: null, error: null },
      { data: null, error: { message: 'upsert error' } }
    );

    await expect(updatePermissionRecords(supabase, module)).rejects.toThrow('upsert error');
  });
});

// ---------------------------------------------------------------------------
// removePermissionRecords
// ---------------------------------------------------------------------------

describe('removePermissionRecords', () => {
  it('resolves without error on successful deletion', async () => {
    const supabase = makePermSupabase({ data: null, error: null });
    await expect(removePermissionRecords(supabase, 'module-uuid-1')).resolves.toBeUndefined();
  });

  it('issues a delete filtered by module_id', async () => {
    let capturedEqArgs: unknown[] = [];
    const chain: Record<string, jest.Mock> = {};
    const returnChain = () => chain;
    ['select', 'upsert', 'insert', 'update', 'order', 'limit'].forEach((m) => {
      chain[m] = jest.fn().mockImplementation(returnChain);
    });
    chain['delete'] = jest.fn().mockImplementation(returnChain);
    chain['eq'] = jest.fn().mockImplementation((...args: unknown[]) => {
      capturedEqArgs = args;
      return chain;
    });
    chain['then'] = jest.fn((onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled)
    );
    const supabase = { from: jest.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await removePermissionRecords(supabase, 'module-uuid-42');

    expect(chain['delete']).toHaveBeenCalled();
    expect(capturedEqArgs[0]).toBe('module_id');
    expect(capturedEqArgs[1]).toBe('module-uuid-42');
  });

  it('throws when the database operation fails', async () => {
    const supabase = makePermSupabase({ data: null, error: { message: 'fk violation' } });
    await expect(removePermissionRecords(supabase, 'module-uuid-1')).rejects.toThrow('fk violation');
  });
});
