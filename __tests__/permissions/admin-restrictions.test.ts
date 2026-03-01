/**
 * Admin Restrictions Tests
 *
 * Verifies the role-based management limitations enforced by the permission
 * system helpers.  The core rules are:
 *
 *   - Owners   → can manage Admins and Users (invite, role-change, remove)
 *   - Admins   → can manage Users only; CANNOT touch Owners or other Admins
 *   - Users    → no management capabilities
 */

import {
  canManageUsers,
  canInviteRole,
  canChangeUserRole,
  canRemoveUser,
  createMockUserManagementService,
  expectErrorCode,
} from "../utils/userManagementHelpers";

import {
  mockOwner,
  mockOwner2,
  mockAdmin,
  mockAdmin2,
  mockUser,
  mockUser2,
  mockOrgUsers,
  mockOrgUsersMultiOwner,
  TEST_ORG_ID,
} from "../fixtures/userData";

// ---------------------------------------------------------------------------
// canManageUsers – gate check
// ---------------------------------------------------------------------------

describe("canManageUsers", () => {
  it("returns true for owner", () => {
    expect(canManageUsers("owner")).toBe(true);
  });

  it("returns true for admin", () => {
    expect(canManageUsers("admin")).toBe(true);
  });

  it("returns false for user", () => {
    expect(canManageUsers("user")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canInviteRole – role assignment restrictions
// ---------------------------------------------------------------------------

describe("canInviteRole", () => {
  describe("owner actor", () => {
    it("can invite with 'user' role", () => {
      expect(canInviteRole("owner", "user")).toBe(true);
    });

    it("can invite with 'admin' role", () => {
      expect(canInviteRole("owner", "admin")).toBe(true);
    });

    it("can invite with 'owner' role (owners have unrestricted invite capability)", () => {
      expect(canInviteRole("owner", "owner")).toBe(true);
    });
  });

  describe("admin actor", () => {
    it("can invite with 'user' role", () => {
      expect(canInviteRole("admin", "user")).toBe(true);
    });

    it("cannot invite with 'admin' role (same level – privilege escalation prevented)", () => {
      expect(canInviteRole("admin", "admin")).toBe(false);
    });

    it("cannot invite with 'owner' role (higher level – privilege escalation prevented)", () => {
      expect(canInviteRole("admin", "owner")).toBe(false);
    });
  });

  describe("user actor", () => {
    it("cannot invite with any role", () => {
      expect(canInviteRole("user", "user")).toBe(false);
      expect(canInviteRole("user", "admin")).toBe(false);
      expect(canInviteRole("user", "owner")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// canChangeUserRole – role update restrictions
// ---------------------------------------------------------------------------

describe("canChangeUserRole", () => {
  describe("owner actor", () => {
    it("can promote a user to admin", () => {
      expect(canChangeUserRole(mockOwner, mockUser, "admin").allowed).toBe(true);
    });

    it("can demote an admin to user", () => {
      expect(canChangeUserRole(mockOwner, mockAdmin, "user").allowed).toBe(true);
    });

    it("cannot change its own role", () => {
      const result = canChangeUserRole(mockOwner, mockOwner, "user");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe("admin actor", () => {
    it("can reassign a user to the 'user' role", () => {
      expect(canChangeUserRole(mockAdmin, mockUser, "user").allowed).toBe(true);
    });

    it("cannot promote a user to admin", () => {
      const result = canChangeUserRole(mockAdmin, mockUser, "admin");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("cannot promote a user to owner", () => {
      const result = canChangeUserRole(mockAdmin, mockUser, "owner");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("cannot modify another admin's role", () => {
      const result = canChangeUserRole(mockAdmin, mockAdmin2, "user");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("cannot modify an owner's role", () => {
      const result = canChangeUserRole(mockAdmin, mockOwner, "user");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("cannot change its own role", () => {
      expect(canChangeUserRole(mockAdmin, mockAdmin, "user").allowed).toBe(false);
    });
  });

  describe("user actor", () => {
    it("cannot change any user's role", () => {
      expect(canChangeUserRole(mockUser, mockUser2, "user").allowed).toBe(false);
      expect(canChangeUserRole(mockUser, mockAdmin, "user").allowed).toBe(false);
      expect(canChangeUserRole(mockUser, mockOwner, "user").allowed).toBe(false);
    });

    it("cannot change its own role", () => {
      expect(canChangeUserRole(mockUser, mockUser, "admin").allowed).toBe(false);
    });
  });

  describe("error reason quality", () => {
    it("includes a reason string when admin targets an owner", () => {
      const { reason } = canChangeUserRole(mockAdmin, mockOwner, "user");
      expect(typeof reason).toBe("string");
      expect(reason!.length).toBeGreaterThan(0);
    });

    it("includes a reason string when admin tries to assign admin role", () => {
      const { reason } = canChangeUserRole(mockAdmin, mockUser, "admin");
      expect(typeof reason).toBe("string");
      expect(reason!.length).toBeGreaterThan(0);
    });

    it("includes a reason string for self-change", () => {
      const { reason } = canChangeUserRole(mockOwner, mockOwner, "user");
      expect(typeof reason).toBe("string");
      expect(reason!.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// canRemoveUser – removal restrictions
// ---------------------------------------------------------------------------

describe("canRemoveUser", () => {
  describe("owner actor", () => {
    it("can remove an admin", () => {
      expect(canRemoveUser(mockOwner, mockAdmin, mockOrgUsers).allowed).toBe(true);
    });

    it("can remove a user", () => {
      expect(canRemoveUser(mockOwner, mockUser, mockOrgUsers).allowed).toBe(true);
    });

    it("cannot remove itself", () => {
      expect(canRemoveUser(mockOwner, mockOwner, mockOrgUsers).allowed).toBe(false);
    });

    it("cannot remove the last owner (last-owner protection)", () => {
      // mockOrgUsers has one owner; a second owner tries to remove that owner
      const result = canRemoveUser(mockOwner2, mockOwner, mockOrgUsers);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/last owner/i);
    });

    it("can remove a second owner when two owners exist", () => {
      expect(canRemoveUser(mockOwner, mockOwner2, mockOrgUsersMultiOwner).allowed).toBe(true);
    });
  });

  describe("admin actor", () => {
    it("can remove a regular user", () => {
      expect(canRemoveUser(mockAdmin, mockUser, mockOrgUsers).allowed).toBe(true);
    });

    it("cannot remove an owner", () => {
      const result = canRemoveUser(mockAdmin, mockOwner, mockOrgUsers);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("cannot remove another admin", () => {
      const result = canRemoveUser(mockAdmin, mockAdmin2, mockOrgUsers);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("cannot remove itself", () => {
      expect(canRemoveUser(mockAdmin, mockAdmin, mockOrgUsers).allowed).toBe(false);
    });
  });

  describe("user actor", () => {
    it("cannot remove other users", () => {
      expect(canRemoveUser(mockUser, mockUser2, mockOrgUsers).allowed).toBe(false);
    });

    it("cannot remove admins", () => {
      expect(canRemoveUser(mockUser, mockAdmin, mockOrgUsers).allowed).toBe(false);
    });

    it("cannot remove owners", () => {
      expect(canRemoveUser(mockUser, mockOwner, mockOrgUsers).allowed).toBe(false);
    });

    it("cannot remove itself", () => {
      expect(canRemoveUser(mockUser, mockUser, mockOrgUsers).allowed).toBe(false);
    });
  });

  describe("last-owner protection", () => {
    it("prevents removing the sole owner regardless of who the actor is", () => {
      const singleOwnerList = [mockOwner, mockAdmin, mockUser];
      // Another owner (mockOwner2, not in list) still sees only one owner in allUsers
      const result = canRemoveUser(mockOwner2, mockOwner, singleOwnerList);
      expect(result.allowed).toBe(false);
    });

    it("allows removal when at least two owners exist in allUsers", () => {
      const multiOwnerList = [mockOwner, mockOwner2, mockAdmin, mockUser];
      expect(canRemoveUser(mockOwner, mockOwner2, multiOwnerList).allowed).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Service-level enforcement via MockUserManagementService
// ---------------------------------------------------------------------------

describe("MockUserManagementService – admin restrictions", () => {
  function makeService() {
    return createMockUserManagementService([...mockOrgUsers]);
  }

  describe("inviteUser – admin actor", () => {
    it("succeeds when admin invites with 'user' role", async () => {
      const svc = makeService();
      const invite = await svc.inviteUser(TEST_ORG_ID, "newuser@example.com", "user", mockAdmin.id);
      expect(invite.role).toBe("user");
      expect(invite.status).toBe("pending");
    });

    it("throws PERMISSION_DENIED when admin invites with 'admin' role", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.inviteUser(TEST_ORG_ID, "newadmin@example.com", "admin", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when admin invites with 'owner' role", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.inviteUser(TEST_ORG_ID, "newowner@example.com", "owner", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when user tries to invite anyone", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.inviteUser(TEST_ORG_ID, "x@example.com", "user", mockUser.id),
        "PERMISSION_DENIED"
      );
    });
  });

  describe("updateUserRole – admin actor", () => {
    it("succeeds when admin reassigns a user to 'user' role", async () => {
      const svc = makeService();
      const updated = await svc.updateUserRole(TEST_ORG_ID, mockUser.id, "user", mockAdmin.id);
      expect(updated.role).toBe("user");
    });

    it("throws PERMISSION_DENIED when admin promotes user to admin", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockUser.id, "admin", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when admin targets another admin", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockAdmin2.id, "user", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when admin targets an owner", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockOwner.id, "user", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when admin tries to change own role", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockAdmin.id, "user", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });
  });

  describe("removeUser – admin actor", () => {
    it("succeeds when admin removes a regular user", async () => {
      const svc = makeService();
      await expect(
        svc.removeUser(TEST_ORG_ID, mockUser.id, mockAdmin.id)
      ).resolves.toBeUndefined();
      const remaining = await svc.getOrganizationUsers(TEST_ORG_ID);
      expect(remaining.find((u) => u.id === mockUser.id)).toBeUndefined();
    });

    it("throws PERMISSION_DENIED when admin removes an owner", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, mockOwner.id, mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when admin removes another admin", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, mockAdmin2.id, mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws CANNOT_REMOVE_SELF when admin tries to remove itself", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, mockAdmin.id, mockAdmin.id),
        "CANNOT_REMOVE_SELF"
      );
    });
  });

  describe("removeUser – last-owner protection", () => {
    it("throws LAST_OWNER when a second owner attempts to remove the only owner", async () => {
      // mockOrgUsers has one owner. Add secondOwner as an extra actor in the list.
      const { makeUser } = await import("../utils/userManagementHelpers");
      const secondOwner = makeUser({ id: "owner-extra", role: "owner" });
      const svc = createMockUserManagementService([...mockOrgUsers, secondOwner]);
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, mockOwner.id, secondOwner.id),
        "LAST_OWNER"
      );
    });

    it("succeeds removing an owner when at least one other owner remains", async () => {
      const svc = createMockUserManagementService([...mockOrgUsersMultiOwner]);
      await expect(
        svc.removeUser(TEST_ORG_ID, mockOwner2.id, mockOwner.id)
      ).resolves.toBeUndefined();
    });
  });
});
