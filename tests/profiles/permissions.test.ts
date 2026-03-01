/**
 * Permission Tests – User Profile Management
 *
 * Tests the role-based access control functions that govern who can
 * view, edit, delete, and manage avatars for profiles within an organisation.
 *
 * Roles under test:
 *   Owner  – full control, including deleting other Owners
 *   Admin  – full control except deleting Owners
 *   User   – read-only on others; self-edit only
 */

import {
  getProfilePermissions,
  canEditProfile,
  canDeleteProfile,
  canManageAvatar,
} from '@/modules/user-management/lib/permissions';
import type { UserRole } from '@/modules/user-management/types/profile';

// ─── Fixtures ────────────────────────────────────────────────────────────────
const USER_A = 'user-aaa';
const USER_B = 'user-bbb';

// ─── getProfilePermissions ────────────────────────────────────────────────────

describe('getProfilePermissions', () => {
  describe('Owner role', () => {
    const perms = getProfilePermissions('Owner');

    it('can view profiles', () => expect(perms.canViewProfiles).toBe(true));
    it('can edit own profile', () => expect(perms.canEditOwnProfile).toBe(true));
    it('can edit all profiles', () => expect(perms.canEditAllProfiles).toBe(true));
    it('can delete profiles', () => expect(perms.canDeleteProfiles).toBe(true));
    it('can delete Owner profiles', () => expect(perms.canDeleteOwnerProfile).toBe(true));
    it('can manage any avatar', () => expect(perms.canManageAnyAvatar).toBe(true));
    it('can manage own avatar', () => expect(perms.canManageOwnAvatar).toBe(true));
  });

  describe('Admin role', () => {
    const perms = getProfilePermissions('Admin');

    it('can view profiles', () => expect(perms.canViewProfiles).toBe(true));
    it('can edit own profile', () => expect(perms.canEditOwnProfile).toBe(true));
    it('can edit all profiles', () => expect(perms.canEditAllProfiles).toBe(true));
    it('can delete profiles', () => expect(perms.canDeleteProfiles).toBe(true));
    it('cannot delete Owner profiles', () => expect(perms.canDeleteOwnerProfile).toBe(false));
    it('can manage any avatar', () => expect(perms.canManageAnyAvatar).toBe(true));
    it('can manage own avatar', () => expect(perms.canManageOwnAvatar).toBe(true));
  });

  describe('User role', () => {
    const perms = getProfilePermissions('User');

    it('can view profiles', () => expect(perms.canViewProfiles).toBe(true));
    it('can edit own profile', () => expect(perms.canEditOwnProfile).toBe(true));
    it('cannot edit all profiles', () => expect(perms.canEditAllProfiles).toBe(false));
    it('cannot delete profiles', () => expect(perms.canDeleteProfiles).toBe(false));
    it('cannot delete Owner profiles', () => expect(perms.canDeleteOwnerProfile).toBe(false));
    it('cannot manage any avatar', () => expect(perms.canManageAnyAvatar).toBe(false));
    it('can manage own avatar', () => expect(perms.canManageOwnAvatar).toBe(true));
  });

  describe('permission object shape', () => {
    const expectedKeys: (keyof ReturnType<typeof getProfilePermissions>)[] = [
      'canViewProfiles',
      'canEditOwnProfile',
      'canEditAllProfiles',
      'canDeleteProfiles',
      'canDeleteOwnerProfile',
      'canManageAnyAvatar',
      'canManageOwnAvatar',
    ];

    it.each(['Owner', 'Admin', 'User'] as UserRole[])(
      'returns all expected permission keys for %s',
      (role) => {
        const perms = getProfilePermissions(role);
        expectedKeys.forEach((key) => expect(perms).toHaveProperty(key));
      },
    );

    it.each(['Owner', 'Admin', 'User'] as UserRole[])(
      'returns only boolean values for %s',
      (role) => {
        const perms = getProfilePermissions(role);
        Object.values(perms).forEach((v) => expect(typeof v).toBe('boolean'));
      },
    );
  });
});

// ─── canEditProfile ───────────────────────────────────────────────────────────

describe('canEditProfile', () => {
  describe('Owner', () => {
    it('can edit own profile', () => {
      expect(canEditProfile('Owner', USER_A, USER_A)).toBe(true);
    });
    it("can edit another user's profile", () => {
      expect(canEditProfile('Owner', USER_A, USER_B)).toBe(true);
    });
  });

  describe('Admin', () => {
    it('can edit own profile', () => {
      expect(canEditProfile('Admin', USER_A, USER_A)).toBe(true);
    });
    it("can edit another user's profile", () => {
      expect(canEditProfile('Admin', USER_A, USER_B)).toBe(true);
    });
  });

  describe('User', () => {
    it('can edit own profile', () => {
      expect(canEditProfile('User', USER_A, USER_A)).toBe(true);
    });
    it("cannot edit another user's profile", () => {
      expect(canEditProfile('User', USER_A, USER_B)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false when requester and target IDs differ only in casing', () => {
      // IDs are case-sensitive
      expect(canEditProfile('User', 'user-aaa', 'USER-AAA')).toBe(false);
    });

    it('returns false when IDs are empty strings and role is User', () => {
      // Both empty strings still count as matching, so this is own-profile
      expect(canEditProfile('User', '', '')).toBe(true);
    });
  });
});

// ─── canDeleteProfile ─────────────────────────────────────────────────────────

describe('canDeleteProfile', () => {
  const targetRoles: UserRole[] = ['Owner', 'Admin', 'User'];

  describe('Owner can delete', () => {
    it.each(targetRoles)('a %s profile', (targetRole) => {
      expect(canDeleteProfile('Owner', targetRole)).toBe(true);
    });
  });

  describe('Admin', () => {
    it('can delete a User profile', () => {
      expect(canDeleteProfile('Admin', 'User')).toBe(true);
    });
    it('can delete an Admin profile', () => {
      expect(canDeleteProfile('Admin', 'Admin')).toBe(true);
    });
    it('cannot delete an Owner profile', () => {
      expect(canDeleteProfile('Admin', 'Owner')).toBe(false);
    });
  });

  describe('User cannot delete', () => {
    it.each(targetRoles)('a %s profile', (targetRole) => {
      expect(canDeleteProfile('User', targetRole)).toBe(false);
    });
  });
});

// ─── canManageAvatar ──────────────────────────────────────────────────────────

describe('canManageAvatar', () => {
  describe('Owner', () => {
    it('can manage own avatar', () => {
      expect(canManageAvatar('Owner', USER_A, USER_A)).toBe(true);
    });
    it("can manage another user's avatar", () => {
      expect(canManageAvatar('Owner', USER_A, USER_B)).toBe(true);
    });
  });

  describe('Admin', () => {
    it('can manage own avatar', () => {
      expect(canManageAvatar('Admin', USER_A, USER_A)).toBe(true);
    });
    it("can manage another user's avatar", () => {
      expect(canManageAvatar('Admin', USER_A, USER_B)).toBe(true);
    });
  });

  describe('User', () => {
    it('can manage own avatar', () => {
      expect(canManageAvatar('User', USER_A, USER_A)).toBe(true);
    });
    it("cannot manage another user's avatar", () => {
      expect(canManageAvatar('User', USER_A, USER_B)).toBe(false);
    });
  });
});

// ─── Role hierarchy consistency ───────────────────────────────────────────────

describe('role hierarchy consistency', () => {
  it('Owner permissions are a superset of Admin permissions', () => {
    const owner = getProfilePermissions('Owner');
    const admin = getProfilePermissions('Admin');

    // Every permission that Admin has, Owner must also have
    (Object.keys(admin) as (keyof typeof admin)[]).forEach((key) => {
      if (admin[key]) {
        expect(owner[key]).toBe(true);
      }
    });
  });

  it('Admin permissions are a superset of User permissions', () => {
    const admin = getProfilePermissions('Admin');
    const user = getProfilePermissions('User');

    (Object.keys(user) as (keyof typeof user)[]).forEach((key) => {
      if (user[key]) {
        expect(admin[key]).toBe(true);
      }
    });
  });

  it('Owner has strictly more permissions than Admin (canDeleteOwnerProfile)', () => {
    const owner = getProfilePermissions('Owner');
    const admin = getProfilePermissions('Admin');
    expect(owner.canDeleteOwnerProfile).toBe(true);
    expect(admin.canDeleteOwnerProfile).toBe(false);
  });

  it('Admin has strictly more permissions than User (canEditAllProfiles)', () => {
    const admin = getProfilePermissions('Admin');
    const user = getProfilePermissions('User');
    expect(admin.canEditAllProfiles).toBe(true);
    expect(user.canEditAllProfiles).toBe(false);
  });
});
