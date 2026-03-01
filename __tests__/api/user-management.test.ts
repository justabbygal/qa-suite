/**
 * User Management API Integration Tests
 *
 * Exercises the full surface of the MockUserManagementService against
 * every combination of actor roles, target roles, and edge cases.
 *
 * Covered areas:
 *  - getOrganizationUsers / getUserById
 *  - inviteUser (permission gating + duplicate detection)
 *  - updateUserRole (role-change rules)
 *  - removeUser (self-removal, last-owner protection, privilege checks)
 *  - Invite lifecycle: getPendingInvites / resendInvite / cancelInvite
 *  - Real-time subscriptions
 *  - Multi-tenant isolation
 *  - UI permission gating alignment (resolvePermission / shouldShowElement)
 *  - Performance / large data sets
 */

import {
  createMockUserManagementService,
  expectErrorCode,
  makeUser,
  makeInvite,
  canManageUsers,
  ownerCount,
  activeUsers,
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
  mockPendingInvites,
  mockPendingUserInvite,
  mockPendingAdminInvite,
  TEST_ORG_ID,
  OTHER_ORG_ID,
  generateLargeUserList,
} from "../fixtures/userData";

import {
  resolvePermission,
  shouldShowElement,
} from "@/lib/permissions/service";
import {
  registerModule,
  clearRegistry,
} from "@/lib/permissions/registry";
import type { ModuleManifest } from "@/lib/permissions/types";

// ---------------------------------------------------------------------------
// Module-registry setup for permission-gating tests
// ---------------------------------------------------------------------------

const USER_MGMT_MODULE: ModuleManifest = {
  module: "user-management",
  displayName: "User Management",
  hasSettings: true,
  defaultAccess: {
    owner: { featureAccess: true, settingsAccess: true },
    admin: { featureAccess: true, settingsAccess: false },
    user: { featureAccess: false, settingsAccess: false },
  },
};

beforeAll(() => {
  registerModule(USER_MGMT_MODULE);
});

afterAll(() => {
  clearRegistry();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(
  users = [...mockOrgUsers],
  invites = [...mockPendingInvites]
) {
  return createMockUserManagementService(users, invites);
}

// ---------------------------------------------------------------------------
// getOrganizationUsers
// ---------------------------------------------------------------------------

describe("getOrganizationUsers", () => {
  it("returns all users for the given org", async () => {
    const svc = makeService();
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(users).toHaveLength(mockOrgUsers.length);
  });

  it("returns an empty array for an org with no users", async () => {
    const svc = makeService([]);
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(users).toEqual([]);
  });

  it("isolates data across organizations", async () => {
    const otherOrgUser = makeUser({ role: "user", organizationId: OTHER_ORG_ID });
    const svc = makeService([...mockOrgUsers, otherOrgUser]);

    const testOrgUsers = await svc.getOrganizationUsers(TEST_ORG_ID);
    const otherOrgUsers = await svc.getOrganizationUsers(OTHER_ORG_ID);

    expect(testOrgUsers).toHaveLength(mockOrgUsers.length);
    expect(otherOrgUsers).toHaveLength(1);
    expect(otherOrgUsers[0].id).toBe(otherOrgUser.id);
  });

  it("returns users with correct role distribution", async () => {
    const svc = makeService();
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);

    expect(users.filter((u) => u.role === "owner")).toHaveLength(1);
    expect(users.filter((u) => u.role === "admin")).toHaveLength(2);
    expect(users.filter((u) => u.role === "user")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getUserById
// ---------------------------------------------------------------------------

describe("getUserById", () => {
  it("returns the correct user when found", async () => {
    const svc = makeService();
    const user = await svc.getUserById(TEST_ORG_ID, mockOwner.id);
    expect(user).not.toBeNull();
    expect(user!.id).toBe(mockOwner.id);
    expect(user!.role).toBe("owner");
  });

  it("returns null for a non-existent user ID", async () => {
    const svc = makeService();
    const user = await svc.getUserById(TEST_ORG_ID, "nonexistent-id");
    expect(user).toBeNull();
  });

  it("returns null when the user exists but belongs to a different org", async () => {
    const foreignUser = makeUser({ role: "user", organizationId: OTHER_ORG_ID });
    const svc = makeService([...mockOrgUsers, foreignUser]);
    const result = await svc.getUserById(TEST_ORG_ID, foreignUser.id);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// inviteUser
// ---------------------------------------------------------------------------

describe("inviteUser", () => {
  describe("owner actor", () => {
    it("can invite a user-role member", async () => {
      const svc = makeService();
      const invite = await svc.inviteUser(TEST_ORG_ID, "new@example.com", "user", mockOwner.id);
      expect(invite.email).toBe("new@example.com");
      expect(invite.role).toBe("user");
      expect(invite.status).toBe("pending");
      expect(invite.organizationId).toBe(TEST_ORG_ID);
    });

    it("can invite an admin-role member", async () => {
      const svc = makeService();
      const invite = await svc.inviteUser(TEST_ORG_ID, "newadmin@example.com", "admin", mockOwner.id);
      expect(invite.role).toBe("admin");
    });

    it("can invite an owner-role member", async () => {
      const svc = makeService();
      const invite = await svc.inviteUser(TEST_ORG_ID, "newowner@example.com", "owner", mockOwner.id);
      expect(invite.role).toBe("owner");
    });
  });

  describe("admin actor", () => {
    it("can invite a user-role member", async () => {
      const svc = makeService();
      const invite = await svc.inviteUser(TEST_ORG_ID, "new@example.com", "user", mockAdmin.id);
      expect(invite.role).toBe("user");
    });

    it("throws PERMISSION_DENIED when inviting with admin role", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.inviteUser(TEST_ORG_ID, "x@example.com", "admin", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when inviting with owner role", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.inviteUser(TEST_ORG_ID, "x@example.com", "owner", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });
  });

  describe("user actor", () => {
    it("throws PERMISSION_DENIED when trying to invite anyone", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.inviteUser(TEST_ORG_ID, "x@example.com", "user", mockUser.id),
        "PERMISSION_DENIED"
      );
    });
  });

  describe("duplicate detection", () => {
    it("throws DUPLICATE_INVITE if a pending invite for that email already exists", async () => {
      const svc = makeService();
      // mockPendingUserInvite is for "newuser@example.com"
      await expectErrorCode(
        () =>
          svc.inviteUser(TEST_ORG_ID, mockPendingUserInvite.email, "user", mockOwner.id),
        "DUPLICATE_INVITE"
      );
    });

    it("allows re-inviting an email whose previous invite was cancelled", async () => {
      const cancelledInvite = makeInvite({
        email: "reinvite@example.com",
        role: "user",
        status: "cancelled",
      });
      const svc = makeService(mockOrgUsers, [cancelledInvite]);
      const invite = await svc.inviteUser(
        TEST_ORG_ID,
        "reinvite@example.com",
        "user",
        mockOwner.id
      );
      expect(invite.status).toBe("pending");
    });
  });

  describe("invite metadata", () => {
    it("created invite has an expiry 7 days in the future", async () => {
      const svc = makeService();
      const before = Date.now();
      const invite = await svc.inviteUser(TEST_ORG_ID, "x@example.com", "user", mockOwner.id);
      const after = Date.now();

      const expiresMs = new Date(invite.expiresAt).getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
      expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
    });

    it("invite token is non-empty", async () => {
      const svc = makeService();
      const invite = await svc.inviteUser(TEST_ORG_ID, "x@example.com", "user", mockOwner.id);
      expect(invite.token).toBeTruthy();
      expect(invite.token.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// updateUserRole
// ---------------------------------------------------------------------------

describe("updateUserRole", () => {
  describe("owner actor", () => {
    it("can promote a user to admin", async () => {
      const svc = makeService();
      const updated = await svc.updateUserRole(TEST_ORG_ID, mockUser.id, "admin", mockOwner.id);
      expect(updated.role).toBe("admin");
    });

    it("can demote an admin to user", async () => {
      const svc = makeService();
      const updated = await svc.updateUserRole(TEST_ORG_ID, mockAdmin.id, "user", mockOwner.id);
      expect(updated.role).toBe("user");
    });

    it("persists the updated role in subsequent reads", async () => {
      const svc = makeService();
      await svc.updateUserRole(TEST_ORG_ID, mockUser.id, "admin", mockOwner.id);
      const user = await svc.getUserById(TEST_ORG_ID, mockUser.id);
      expect(user!.role).toBe("admin");
    });

    it("throws PERMISSION_DENIED when owner tries to change own role", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockOwner.id, "user", mockOwner.id),
        "PERMISSION_DENIED"
      );
    });
  });

  describe("admin actor", () => {
    it("can keep a user in the 'user' role (no-op reassign)", async () => {
      const svc = makeService();
      const updated = await svc.updateUserRole(TEST_ORG_ID, mockUser.id, "user", mockAdmin.id);
      expect(updated.role).toBe("user");
    });

    it("throws PERMISSION_DENIED when promoting user to admin", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockUser.id, "admin", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when promoting user to owner", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockUser.id, "owner", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when targeting another admin", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockAdmin2.id, "user", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when targeting an owner", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockOwner.id, "user", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when changing own role", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockAdmin.id, "user", mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });
  });

  describe("user actor", () => {
    it("throws PERMISSION_DENIED when attempting any role change", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockUser2.id, "user", mockUser.id),
        "PERMISSION_DENIED"
      );
    });
  });

  describe("not-found handling", () => {
    it("throws NOT_FOUND when the target user does not exist", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, "ghost-id", "user", mockOwner.id),
        "NOT_FOUND"
      );
    });

    it("throws NOT_FOUND when the requesting user does not exist", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, mockUser.id, "admin", "ghost-actor"),
        "NOT_FOUND"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// removeUser
// ---------------------------------------------------------------------------

describe("removeUser", () => {
  describe("owner actor", () => {
    it("can remove a regular user", async () => {
      const svc = makeService();
      await svc.removeUser(TEST_ORG_ID, mockUser.id, mockOwner.id);
      const remaining = await svc.getOrganizationUsers(TEST_ORG_ID);
      expect(remaining.find((u) => u.id === mockUser.id)).toBeUndefined();
    });

    it("can remove an admin", async () => {
      const svc = makeService();
      await svc.removeUser(TEST_ORG_ID, mockAdmin.id, mockOwner.id);
      const remaining = await svc.getOrganizationUsers(TEST_ORG_ID);
      expect(remaining.find((u) => u.id === mockAdmin.id)).toBeUndefined();
    });

    it("throws CANNOT_REMOVE_SELF when owner tries to remove itself", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, mockOwner.id, mockOwner.id),
        "CANNOT_REMOVE_SELF"
      );
    });

    it("throws LAST_OWNER when trying to remove the only owner", async () => {
      // mockOwner2 is not in mockOrgUsers; add it so the actor exists in the service
      const secondOwner = makeUser({ id: "owner-extra", role: "owner" });
      const svc = createMockUserManagementService([...mockOrgUsers, secondOwner]);
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, mockOwner.id, secondOwner.id),
        "LAST_OWNER"
      );
    });

    it("can remove a second owner when two owners exist", async () => {
      const svc = createMockUserManagementService([...mockOrgUsersMultiOwner]);
      await svc.removeUser(TEST_ORG_ID, mockOwner2.id, mockOwner.id);
      const remaining = await svc.getOrganizationUsers(TEST_ORG_ID);
      expect(remaining.find((u) => u.id === mockOwner2.id)).toBeUndefined();
    });
  });

  describe("admin actor", () => {
    it("can remove a regular user", async () => {
      const svc = makeService();
      await svc.removeUser(TEST_ORG_ID, mockUser.id, mockAdmin.id);
      const remaining = await svc.getOrganizationUsers(TEST_ORG_ID);
      expect(remaining.find((u) => u.id === mockUser.id)).toBeUndefined();
    });

    it("throws PERMISSION_DENIED when removing an owner", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, mockOwner.id, mockAdmin.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when removing another admin", async () => {
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

  describe("user actor", () => {
    it("throws PERMISSION_DENIED when removing another user", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, mockUser2.id, mockUser.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws PERMISSION_DENIED when removing an admin", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, mockAdmin.id, mockUser.id),
        "PERMISSION_DENIED"
      );
    });

    it("throws CANNOT_REMOVE_SELF when user tries to remove itself", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, mockUser.id, mockUser.id),
        "CANNOT_REMOVE_SELF"
      );
    });
  });

  describe("not-found handling", () => {
    it("throws NOT_FOUND when the target user does not exist", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, "ghost-id", mockOwner.id),
        "NOT_FOUND"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Pending invites – getPendingInvites
// ---------------------------------------------------------------------------

describe("getPendingInvites", () => {
  it("returns only pending invites for the given org", async () => {
    const svc = makeService();
    const pending = await svc.getPendingInvites(TEST_ORG_ID);
    expect(pending.length).toBe(mockPendingInvites.length);
    pending.forEach((i) => {
      expect(i.status).toBe("pending");
      expect(i.organizationId).toBe(TEST_ORG_ID);
    });
  });

  it("returns an empty array when no pending invites exist", async () => {
    const svc = makeService(mockOrgUsers, []);
    const pending = await svc.getPendingInvites(TEST_ORG_ID);
    expect(pending).toEqual([]);
  });

  it("does not include cancelled or expired invites", async () => {
    const cancelled = makeInvite({ email: "c@example.com", role: "user", status: "cancelled" });
    const expired = makeInvite({ email: "e@example.com", role: "user", status: "expired" });
    const svc = makeService(mockOrgUsers, [cancelled, expired, mockPendingUserInvite]);
    const pending = await svc.getPendingInvites(TEST_ORG_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe(mockPendingUserInvite.email);
  });
});

// ---------------------------------------------------------------------------
// Pending invites – resendInvite
// ---------------------------------------------------------------------------

describe("resendInvite", () => {
  it("owner can resend a pending invite", async () => {
    const svc = makeService();
    const resent = await svc.resendInvite(
      TEST_ORG_ID,
      mockPendingUserInvite.id,
      mockOwner.id
    );
    expect(resent.status).toBe("pending");
    // Expiry should be refreshed
    const newExpiry = new Date(resent.expiresAt).getTime();
    const originalExpiry = new Date(mockPendingUserInvite.expiresAt).getTime();
    expect(newExpiry).toBeGreaterThanOrEqual(originalExpiry);
  });

  it("admin can resend a pending invite", async () => {
    const svc = makeService();
    const resent = await svc.resendInvite(
      TEST_ORG_ID,
      mockPendingUserInvite.id,
      mockAdmin.id
    );
    expect(resent.status).toBe("pending");
  });

  it("throws PERMISSION_DENIED when a regular user tries to resend", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.resendInvite(TEST_ORG_ID, mockPendingUserInvite.id, mockUser.id),
      "PERMISSION_DENIED"
    );
  });

  it("throws NOT_FOUND for a non-existent invite ID", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.resendInvite(TEST_ORG_ID, "ghost-invite", mockOwner.id),
      "NOT_FOUND"
    );
  });
});

// ---------------------------------------------------------------------------
// Pending invites – cancelInvite
// ---------------------------------------------------------------------------

describe("cancelInvite", () => {
  it("owner can cancel a pending invite", async () => {
    const svc = makeService();
    await svc.cancelInvite(TEST_ORG_ID, mockPendingUserInvite.id, mockOwner.id);
    const pending = await svc.getPendingInvites(TEST_ORG_ID);
    expect(pending.find((i) => i.id === mockPendingUserInvite.id)).toBeUndefined();
  });

  it("admin can cancel a pending invite", async () => {
    const svc = makeService();
    await svc.cancelInvite(TEST_ORG_ID, mockPendingUserInvite.id, mockAdmin.id);
    const pending = await svc.getPendingInvites(TEST_ORG_ID);
    expect(pending.find((i) => i.id === mockPendingUserInvite.id)).toBeUndefined();
  });

  it("throws PERMISSION_DENIED when a regular user tries to cancel", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.cancelInvite(TEST_ORG_ID, mockPendingUserInvite.id, mockUser.id),
      "PERMISSION_DENIED"
    );
  });

  it("cancelled invite no longer appears in getPendingInvites", async () => {
    const svc = makeService();
    await svc.cancelInvite(TEST_ORG_ID, mockPendingAdminInvite.id, mockOwner.id);
    const pending = await svc.getPendingInvites(TEST_ORG_ID);
    const found = pending.find((i) => i.id === mockPendingAdminInvite.id);
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Real-time subscriptions
// ---------------------------------------------------------------------------

describe("subscribeToUserChanges", () => {
  it("fires the callback with updated user list after a role change", async () => {
    const svc = makeService();
    const received: typeof mockOrgUsers[] = [];

    const unsub = svc.subscribeToUserChanges(TEST_ORG_ID, (users) => {
      received.push(users);
    });

    await svc.updateUserRole(TEST_ORG_ID, mockUser.id, "admin", mockOwner.id);
    // Trigger the update manually
    svc._triggerUserUpdate(svc._users);

    expect(received.length).toBeGreaterThan(0);
    unsub();
  });

  it("unsubscribe stops future callbacks from firing", async () => {
    const svc = makeService();
    let callCount = 0;

    const unsub = svc.subscribeToUserChanges(TEST_ORG_ID, () => {
      callCount++;
    });
    unsub();

    svc._triggerUserUpdate(svc._users);
    expect(callCount).toBe(0);
  });

  it("multiple subscribers all receive the update", () => {
    const svc = makeService();
    let count1 = 0;
    let count2 = 0;

    const unsub1 = svc.subscribeToUserChanges(TEST_ORG_ID, () => { count1++; });
    const unsub2 = svc.subscribeToUserChanges(TEST_ORG_ID, () => { count2++; });

    svc._triggerUserUpdate(svc._users);

    expect(count1).toBe(1);
    expect(count2).toBe(1);

    unsub1();
    unsub2();
  });
});

describe("subscribeToInviteChanges", () => {
  it("fires the callback when invites are updated", () => {
    const svc = makeService();
    const received: typeof mockPendingInvites[] = [];

    const unsub = svc.subscribeToInviteChanges(TEST_ORG_ID, (invites) => {
      received.push(invites);
    });

    svc._triggerInviteUpdate(svc._invites);
    expect(received.length).toBe(1);
    unsub();
  });

  it("unsubscribe stops invite callbacks from firing", () => {
    const svc = makeService();
    let callCount = 0;

    const unsub = svc.subscribeToInviteChanges(TEST_ORG_ID, () => { callCount++; });
    unsub();

    svc._triggerInviteUpdate(svc._invites);
    expect(callCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// UI permission gating – resolvePermission / shouldShowElement
// ---------------------------------------------------------------------------

describe("UI permission gating for user-management module", () => {
  it.each([
    ["owner", true, true],
    ["admin", true, false],
    ["user", false, false],
  ] as const)(
    "%s: canUse=%s, canConfigure=%s",
    (role, expectedCanUse, expectedCanConfigure) => {
      const perm = resolvePermission(role, "user-management");
      expect(perm.canUse).toBe(expectedCanUse);
      expect(perm.canConfigure).toBe(expectedCanConfigure);
    }
  );

  it("shouldShowElement returns true for owner (feature only)", () => {
    const perm = resolvePermission("owner", "user-management");
    expect(shouldShowElement(perm)).toBe(true);
  });

  it("shouldShowElement(requireSettings=true) returns true for owner", () => {
    const perm = resolvePermission("owner", "user-management");
    expect(shouldShowElement(perm, true)).toBe(true);
  });

  it("shouldShowElement returns true for admin (feature only)", () => {
    const perm = resolvePermission("admin", "user-management");
    expect(shouldShowElement(perm)).toBe(true);
  });

  it("shouldShowElement(requireSettings=true) returns false for admin", () => {
    const perm = resolvePermission("admin", "user-management");
    expect(shouldShowElement(perm, true)).toBe(false);
  });

  it("shouldShowElement returns false for user", () => {
    const perm = resolvePermission("user", "user-management");
    expect(shouldShowElement(perm)).toBe(false);
  });

  it("canManageUsers aligns with resolvePermission.canUse for all roles", () => {
    const roles = ["owner", "admin", "user"] as const;
    for (const role of roles) {
      const perm = resolvePermission(role, "user-management");
      expect(canManageUsers(role)).toBe(perm.canUse);
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-tenant isolation
// ---------------------------------------------------------------------------

describe("multi-tenant isolation", () => {
  it("getOrganizationUsers does not return users from a different org", async () => {
    const foreignUser = makeUser({ role: "owner", organizationId: OTHER_ORG_ID });
    const svc = makeService([...mockOrgUsers, foreignUser]);

    const testOrgResult = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(testOrgResult.map((u) => u.id)).not.toContain(foreignUser.id);
  });

  it("getPendingInvites does not return invites from a different org", async () => {
    const foreignInvite = makeInvite({
      email: "foreign@example.com",
      role: "user",
      organizationId: OTHER_ORG_ID,
    });
    const svc = makeService(mockOrgUsers, [...mockPendingInvites, foreignInvite]);

    const pending = await svc.getPendingInvites(TEST_ORG_ID);
    expect(pending.map((i) => i.id)).not.toContain(foreignInvite.id);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("allows inviting after the previous invite for that email was cancelled", async () => {
    const email = "reinvite@example.com";
    const cancelled = makeInvite({ email, role: "user", status: "cancelled" });
    const svc = makeService(mockOrgUsers, [cancelled]);

    const invite = await svc.inviteUser(TEST_ORG_ID, email, "user", mockOwner.id);
    expect(invite.status).toBe("pending");
  });

  it("removeUser returns void (resolves undefined) on success", async () => {
    const svc = makeService();
    const result = await svc.removeUser(TEST_ORG_ID, mockUser.id, mockOwner.id);
    expect(result).toBeUndefined();
  });

  it("cancelInvite returns void on success", async () => {
    const svc = makeService();
    const result = await svc.cancelInvite(
      TEST_ORG_ID,
      mockPendingUserInvite.id,
      mockOwner.id
    );
    expect(result).toBeUndefined();
  });

  it("ownerCount helper reflects service state", async () => {
    const svc = makeService();
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(ownerCount(users)).toBe(1);
  });

  it("activeUsers helper filters correctly", async () => {
    const suspended = makeUser({ role: "user", status: "suspended" });
    const svc = makeService([...mockOrgUsers, suspended]);
    const all = await svc.getOrganizationUsers(TEST_ORG_ID);
    const active = activeUsers(all);
    expect(active.length).toBe(mockOrgUsers.length); // suspended not included
  });
});

// ---------------------------------------------------------------------------
// Performance – large data sets
// ---------------------------------------------------------------------------

describe("performance – large user lists", () => {
  it("handles 500 users without errors", async () => {
    const largeList = generateLargeUserList(500);
    const svc = createMockUserManagementService(largeList);
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(users).toHaveLength(500);
  });

  it("correctly identifies the single owner in a 500-user list", async () => {
    const largeList = generateLargeUserList(500);
    const svc = createMockUserManagementService(largeList);
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(ownerCount(users)).toBe(1);
  });

  it("owner removal is still blocked (LAST_OWNER) in a 500-user list", async () => {
    const largeList = generateLargeUserList(500);
    // Add a second owner as actor
    const secondOwner = makeUser({ id: "extra-owner", role: "owner" });
    const svc = createMockUserManagementService([...largeList, secondOwner]);
    await expectErrorCode(
      () => svc.removeUser(TEST_ORG_ID, largeList[0].id, secondOwner.id),
      "LAST_OWNER"
    );
  });
});
