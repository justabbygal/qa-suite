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
