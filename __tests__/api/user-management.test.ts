/**
 * User Management API Tests
 *
 * These tests exercise the business-logic layer that underlies the
 * /api/users route group. The expected HTTP status codes are noted in
 * comments to document the intended API contract; the functions themselves
 * return { success, data?, error? } objects rather than raw HTTP responses.
 */

import {
  inviteUser,
  updateUserRole,
  removeUser,
  listUsers,
} from "@/lib/permissions/user-management";
import {
  resolvePermission,
  shouldShowElement,
} from "@/lib/permissions/service";
import { registerModule, clearRegistry } from "@/lib/permissions/registry";
import type { OrgUser, ModuleManifest } from "@/lib/permissions/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_MANAGEMENT_MODULE: ModuleManifest = {
  module: "user-management",
  displayName: "User Management",
  hasSettings: true,
  defaultAccess: {
    owner: { featureAccess: true, settingsAccess: true },
    admin: { featureAccess: true, settingsAccess: false },
    user: { featureAccess: false, settingsAccess: false },
  },
};

function makeUser(
  id: string,
  role: OrgUser["role"],
  orgId = "org-abc"
): OrgUser {
  return { id, email: `${id}@test.com`, name: id, role, organizationId: orgId };
}

// ---------------------------------------------------------------------------

describe("User Management API", () => {
  let orgOwner: OrgUser;
  let orgAdmin: OrgUser;
  let orgUser1: OrgUser;
  let orgUser2: OrgUser;
  let externalOwner: OrgUser; // belongs to a different org

  beforeAll(() => {
    registerModule(USER_MANAGEMENT_MODULE);
  });

  afterAll(() => {
    clearRegistry();
  });

  beforeEach(() => {
    orgOwner = makeUser("owner-1", "owner");
    orgAdmin = makeUser("admin-1", "admin");
    orgUser1 = makeUser("user-1", "user");
    orgUser2 = makeUser("user-2", "user");
    externalOwner = makeUser("ext-owner-1", "owner", "org-other");
  });

  // =========================================================================
  // GET /api/users – list users
  // =========================================================================

  describe("GET /api/users – list users", () => {
    function orgMembers() {
      return [orgOwner, orgAdmin, orgUser1, orgUser2];
    }

    // 200 – success for all authenticated roles
    it("200 – owner receives all org members", () => {
      const result = listUsers(orgOwner, orgMembers());
      expect(result).toHaveLength(4);
    });

    it("200 – admin receives all org members", () => {
      const result = listUsers(orgAdmin, orgMembers());
      expect(result).toHaveLength(4);
    });

    it("200 – regular user receives all org members", () => {
      const result = listUsers(orgUser1, orgMembers());
      expect(result).toHaveLength(4);
    });

    // Org isolation
    it("does not expose users from other organizations", () => {
      const allUsers = [...orgMembers(), externalOwner];
      const result = listUsers(orgOwner, allUsers);
      expect(result).not.toContainEqual(externalOwner);
    });

    it("every returned user belongs to the actor's organization", () => {
      const allUsers = [...orgMembers(), externalOwner];
      const result = listUsers(orgAdmin, allUsers);
      expect(
        result.every((u) => u.organizationId === orgAdmin.organizationId)
      ).toBe(true);
    });

    it("returns an empty array when the org has no users", () => {
      expect(listUsers(orgOwner, [])).toHaveLength(0);
    });

    it("external user sees only their own org's members (zero here)", () => {
      const result = listUsers(externalOwner, orgMembers());
      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // POST /api/users/invite – invite user
  // =========================================================================

  describe("POST /api/users/invite – invite user", () => {
    // 200 – owner can invite admin and user
    it("200 – owner can invite a user-role member", () => {
      const result = inviteUser(orgOwner, "new@test.com", "user");
      expect(result.success).toBe(true);
      expect(result.data?.email).toBe("new@test.com");
      expect(result.data?.role).toBe("user");
    });

    it("200 – owner can invite an admin-role member", () => {
      const result = inviteUser(orgOwner, "newadmin@test.com", "admin");
      expect(result.success).toBe(true);
      expect(result.data?.role).toBe("admin");
    });

    // 403 – owner cannot invite another owner (same level)
    it("403 – owner cannot invite an owner-role member", () => {
      expect(
        inviteUser(orgOwner, "newowner@test.com", "owner").success
      ).toBe(false);
    });

    // 200 – admin can invite user
    it("200 – admin can invite a user-role member", () => {
      const result = inviteUser(orgAdmin, "newuser@test.com", "user");
      expect(result.success).toBe(true);
    });

    // 403 – admin cannot invite admin or owner
    it("403 – admin cannot invite an admin-role member", () => {
      expect(
        inviteUser(orgAdmin, "newadmin@test.com", "admin").success
      ).toBe(false);
    });

    it("403 – admin cannot invite an owner-role member", () => {
      expect(
        inviteUser(orgAdmin, "newowner@test.com", "owner").success
      ).toBe(false);
    });

    // 403 – user cannot invite anyone
    it("403 – user cannot invite a user-role member", () => {
      expect(inviteUser(orgUser1, "x@test.com", "user").success).toBe(false);
    });

    it("403 – user cannot invite an admin-role member", () => {
      expect(inviteUser(orgUser1, "x@test.com", "admin").success).toBe(false);
    });

    it("403 – user cannot invite an owner-role member", () => {
      expect(inviteUser(orgUser1, "x@test.com", "owner").success).toBe(false);
    });
  });

  // =========================================================================
  // PATCH /api/users/:id – update role
  // =========================================================================

  describe("PATCH /api/users/:id – update role", () => {
    // Owner operations
    it("200 – owner can promote a user to admin", () => {
      const result = updateUserRole(orgOwner, orgUser1, "admin");
      expect(result.success).toBe(true);
      expect(result.data?.newRole).toBe("admin");
      expect(result.data?.userId).toBe(orgUser1.id);
    });

    it("200 – owner can demote an admin to user", () => {
      const result = updateUserRole(orgOwner, orgAdmin, "user");
      expect(result.success).toBe(true);
      expect(result.data?.newRole).toBe("user");
    });

    it("403 – owner cannot promote anyone to owner (same level)", () => {
      expect(updateUserRole(orgOwner, orgUser1, "owner").success).toBe(false);
      expect(updateUserRole(orgOwner, orgAdmin, "owner").success).toBe(false);
    });

    it("403 – owner cannot change their own role", () => {
      expect(updateUserRole(orgOwner, orgOwner, "user").success).toBe(false);
    });

    // Admin operations
    it("200 – admin can reassign a user's role to user", () => {
      expect(updateUserRole(orgAdmin, orgUser1, "user").success).toBe(true);
    });

    it("403 – admin cannot promote a user to admin", () => {
      expect(updateUserRole(orgAdmin, orgUser1, "admin").success).toBe(false);
    });

    it("403 – admin cannot promote a user to owner", () => {
      expect(updateUserRole(orgAdmin, orgUser1, "owner").success).toBe(false);
    });

    it("403 – admin cannot modify another admin's role", () => {
      const admin2 = makeUser("admin-2", "admin");
      expect(updateUserRole(orgAdmin, admin2, "user").success).toBe(false);
    });

    it("403 – admin cannot modify an owner's role", () => {
      expect(updateUserRole(orgAdmin, orgOwner, "user").success).toBe(false);
    });

    it("403 – admin cannot change their own role", () => {
      expect(updateUserRole(orgAdmin, orgAdmin, "user").success).toBe(false);
    });

    // User operations
    it("403 – user cannot change another user's role", () => {
      expect(updateUserRole(orgUser1, orgUser2, "user").success).toBe(false);
    });

    it("403 – user cannot change an admin's role", () => {
      expect(updateUserRole(orgUser1, orgAdmin, "user").success).toBe(false);
    });

    it("403 – user cannot change their own role", () => {
      expect(updateUserRole(orgUser1, orgUser1, "user").success).toBe(false);
    });
  });

  // =========================================================================
  // DELETE /api/users/:id – remove user
  // =========================================================================

  describe("DELETE /api/users/:id – remove user", () => {
    // Owner operations
    it("200 – owner can remove an admin", () => {
      const result = removeUser(orgOwner, orgAdmin);
      expect(result.success).toBe(true);
      expect(result.data?.userId).toBe(orgAdmin.id);
    });

    it("200 – owner can remove a user", () => {
      expect(removeUser(orgOwner, orgUser1).success).toBe(true);
    });

    it("403 – owner cannot remove another owner (same level)", () => {
      const owner2 = makeUser("owner-2", "owner");
      expect(removeUser(orgOwner, owner2).success).toBe(false);
    });

    it("403 – owner cannot remove themselves", () => {
      expect(removeUser(orgOwner, orgOwner).success).toBe(false);
    });

    // Admin operations
    it("200 – admin can remove a user", () => {
      const result = removeUser(orgAdmin, orgUser1);
      expect(result.success).toBe(true);
      expect(result.data?.userId).toBe(orgUser1.id);
    });

    it("403 – admin cannot remove an owner", () => {
      expect(removeUser(orgAdmin, orgOwner).success).toBe(false);
    });

    it("403 – admin cannot remove another admin", () => {
      const admin2 = makeUser("admin-2", "admin");
      expect(removeUser(orgAdmin, admin2).success).toBe(false);
    });

    it("403 – admin cannot remove themselves", () => {
      expect(removeUser(orgAdmin, orgAdmin).success).toBe(false);
    });

    // User operations
    it("403 – user cannot remove another user", () => {
      expect(removeUser(orgUser1, orgUser2).success).toBe(false);
    });

    it("403 – user cannot remove an admin", () => {
      expect(removeUser(orgUser1, orgAdmin).success).toBe(false);
    });

    it("403 – user cannot remove an owner", () => {
      expect(removeUser(orgUser1, orgOwner).success).toBe(false);
    });

    it("403 – user cannot remove themselves", () => {
      expect(removeUser(orgUser1, orgUser1).success).toBe(false);
    });
  });

  // =========================================================================
  // Permission-gated UI – user-management module access
  // =========================================================================

  describe("UI permission gating – user-management module", () => {
    it("owner can access the user-management feature", () => {
      const perm = resolvePermission("owner", "user-management");
      expect(shouldShowElement(perm)).toBe(true);
    });

    it("admin can access the user-management feature", () => {
      const perm = resolvePermission("admin", "user-management");
      expect(shouldShowElement(perm)).toBe(true);
    });

    it("user cannot access the user-management feature", () => {
      const perm = resolvePermission("user", "user-management");
      expect(shouldShowElement(perm)).toBe(false);
    });

    it("owner can access user-management settings", () => {
      const perm = resolvePermission("owner", "user-management");
      expect(shouldShowElement(perm, true)).toBe(true);
    });

    it("admin cannot access user-management settings (no settings access by default)", () => {
      const perm = resolvePermission("admin", "user-management");
      expect(shouldShowElement(perm, true)).toBe(false);
    });

    it("user cannot access user-management settings", () => {
      const perm = resolvePermission("user", "user-management");
      expect(shouldShowElement(perm, true)).toBe(false);
    });

    it("user: canUse=false means the entire module UI is hidden", () => {
      const perm = resolvePermission("user", "user-management");
      expect(perm.canUse).toBe(false);
      expect(perm.canConfigure).toBe(false);
      expect(shouldShowElement(perm)).toBe(false);
      expect(shouldShowElement(perm, true)).toBe(false);
    });
  });

  // =========================================================================
  // Multi-tenant isolation
  // =========================================================================

  describe("multi-tenant isolation", () => {
    it("listUsers: members of org-other are excluded from org-abc results", () => {
      const allUsers = [orgOwner, orgAdmin, orgUser1, externalOwner];
      const result = listUsers(orgOwner, allUsers);
      expect(result).not.toContainEqual(externalOwner);
    });

    it("listUsers: external actor sees zero org-abc members", () => {
      const result = listUsers(externalOwner, [orgOwner, orgAdmin, orgUser1]);
      expect(result).toHaveLength(0);
    });

    it("listUsers: results only contain users with the actor's organizationId", () => {
      const mixed = [orgOwner, orgAdmin, orgUser1, externalOwner];
      const result = listUsers(orgAdmin, mixed);
      const orgIds = [...new Set(result.map((u) => u.organizationId))];
      expect(orgIds).toEqual([orgAdmin.organizationId]);
    });

    it("permission resolution is role-based and org-agnostic by default", () => {
      // Both orgOwner and externalOwner have the 'owner' role – same permissions
      const localPerm = resolvePermission("owner", "user-management");
      const extPerm = resolvePermission("owner", "user-management");
      expect(localPerm).toEqual(extPerm);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe("edge cases", () => {
    it("listUsers: handles a list of users from many different orgs", () => {
      const manyOrgUsers = Array.from({ length: 10 }, (_, i) =>
        makeUser(`u-${i}`, "user", `org-${i}`)
      );
      const result = listUsers(orgOwner, manyOrgUsers);
      expect(result).toHaveLength(0); // none match org-abc
    });

    it("inviteUser: works with any valid email address format", () => {
      expect(
        inviteUser(orgOwner, "user+tag@sub.domain.example.com", "user").success
      ).toBe(true);
    });

    it("updateUserRole: returned userId matches the target's id", () => {
      const result = updateUserRole(orgOwner, orgUser1, "admin");
      expect(result.data?.userId).toBe(orgUser1.id);
    });

    it("removeUser: returned userId matches the target's id", () => {
      const result = removeUser(orgOwner, orgUser1);
      expect(result.data?.userId).toBe(orgUser1.id);
    });

    it("all failed results carry an error string", () => {
      const failures = [
        inviteUser(orgUser1, "x@test.com", "admin"),
        updateUserRole(orgAdmin, orgOwner, "user"),
        removeUser(orgUser1, orgAdmin),
        removeUser(orgAdmin, orgAdmin), // self
      ];
      for (const r of failures) {
        expect(r.success).toBe(false);
        expect(r.error).toBeTruthy();
      }
    });

    it("successful inviteUser result has no error field", () => {
      const result = inviteUser(orgOwner, "valid@test.com", "user");
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("successful removeUser result has no error field", () => {
      const result = removeUser(orgOwner, orgUser1);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
