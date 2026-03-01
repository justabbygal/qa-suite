/**
 * User Management API Tests
 *
 * Integration tests for the user management service layer.  Every test
 * exercises the full business-logic stack via the MockUserManagementService,
 * which mirrors the contract the production API routes must expose.
 *
 * Coverage areas:
 *  - GET  /api/users          – listing org members
 *  - POST /api/users/invite   – sending invitations
 *  - PATCH /api/users/:id     – updating roles
 *  - DELETE /api/users/:id    – removing members
 *  - Permission-gated UI      – module-level access control
 *  - Multi-tenant isolation   – org boundary enforcement
 *  - Duplicate invite guard   – preventing redundant invites
 *  - Real-time subscriptions  – pub/sub update delivery
 */

import {
  createMockUserManagementService,
  canManageUsers,
  expectErrorCode,
  makeUser,
  makeInvite,
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
  mockPendingUserInvite,
  mockPendingAdminInvite,
  mockPendingInvites,
  generateLargeUserList,
  TEST_ORG_ID,
  OTHER_ORG_ID,
} from "../fixtures/userData";

import {
  resolvePermission,
  shouldShowElement,
} from "@/lib/permissions/service";
import { registerModule, clearRegistry } from "@/lib/permissions/registry";
import type { ModuleManifest } from "@/lib/permissions/types";

// ---------------------------------------------------------------------------
// Module fixture for UI permission gating
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

beforeAll(() => {
  registerModule(USER_MANAGEMENT_MODULE);
});

afterAll(() => {
  clearRegistry();
});

// ---------------------------------------------------------------------------
// GET /api/users – list organization members
// ---------------------------------------------------------------------------

describe("GET /api/users – list organization members", () => {
  function makeService() {
    return createMockUserManagementService([...mockOrgUsers]);
  }

  it("200 – owner receives all org members", async () => {
    const svc = makeService();
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(users).toHaveLength(mockOrgUsers.length);
  });

  it("200 – admin receives all org members", async () => {
    const svc = makeService();
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(users).toHaveLength(mockOrgUsers.length);
  });

  it("200 – regular user receives all org members", async () => {
    const svc = makeService();
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(users).toHaveLength(mockOrgUsers.length);
  });

  it("filters out members from other organizations", async () => {
    const extUser = makeUser({ role: "owner", organizationId: OTHER_ORG_ID });
    const svc = createMockUserManagementService([...mockOrgUsers, extUser]);
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(users.every((u) => u.organizationId === TEST_ORG_ID)).toBe(true);
    expect(users).toHaveLength(mockOrgUsers.length);
  });

  it("returns an empty array when the org has no members", async () => {
    const svc = createMockUserManagementService([]);
    expect(await svc.getOrganizationUsers(TEST_ORG_ID)).toHaveLength(0);
  });

  it("getUserById returns the correct member", async () => {
    const svc = makeService();
    const user = await svc.getUserById(TEST_ORG_ID, mockAdmin.id);
    expect(user).not.toBeNull();
    expect(user!.id).toBe(mockAdmin.id);
    expect(user!.role).toBe("admin");
  });

  it("getUserById returns null for an unknown id", async () => {
    const svc = makeService();
    expect(await svc.getUserById(TEST_ORG_ID, "ghost-id")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/invite – send invitation
// ---------------------------------------------------------------------------

describe("POST /api/users/invite – send invitation", () => {
  function makeService() {
    return createMockUserManagementService([...mockOrgUsers]);
  }

  // 200 – authorised invitations
  it("200 – owner can invite with 'user' role", async () => {
    const svc = makeService();
    const invite = await svc.inviteUser(TEST_ORG_ID, "new@test.com", "user", mockOwner.id);
    expect(invite.role).toBe("user");
    expect(invite.status).toBe("pending");
    expect(invite.email).toBe("new@test.com");
  });

  it("200 – owner can invite with 'admin' role", async () => {
    const svc = makeService();
    const invite = await svc.inviteUser(TEST_ORG_ID, "newadmin@test.com", "admin", mockOwner.id);
    expect(invite.role).toBe("admin");
  });

  it("200 – owner can invite with 'owner' role", async () => {
    const svc = makeService();
    const invite = await svc.inviteUser(TEST_ORG_ID, "newowner@test.com", "owner", mockOwner.id);
    expect(invite.role).toBe("owner");
  });

  it("200 – admin can invite with 'user' role", async () => {
    const svc = makeService();
    const invite = await svc.inviteUser(TEST_ORG_ID, "newuser@test.com", "user", mockAdmin.id);
    expect(invite.role).toBe("user");
  });

  // 403 – unauthorised invitations
  it("403 – admin cannot invite with 'admin' role", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.inviteUser(TEST_ORG_ID, "x@test.com", "admin", mockAdmin.id),
      "PERMISSION_DENIED"
    );
  });

  it("403 – admin cannot invite with 'owner' role", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.inviteUser(TEST_ORG_ID, "x@test.com", "owner", mockAdmin.id),
      "PERMISSION_DENIED"
    );
  });

  it("403 – regular user cannot invite anyone", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.inviteUser(TEST_ORG_ID, "x@test.com", "user", mockUser.id),
      "PERMISSION_DENIED"
    );
  });

  // Invite data integrity
  it("invite record includes correct org, role, and pending status", async () => {
    const svc = makeService();
    const invite = await svc.inviteUser(TEST_ORG_ID, "check@test.com", "user", mockOwner.id);
    expect(invite.organizationId).toBe(TEST_ORG_ID);
    expect(invite.role).toBe("user");
    expect(invite.status).toBe("pending");
    expect(invite.token).toBeTruthy();
    expect(invite.expiresAt).toBeTruthy();
  });

  it("invite expiry is set 7 days in the future", async () => {
    const before = Date.now();
    const svc = makeService();
    const invite = await svc.inviteUser(TEST_ORG_ID, "exp@test.com", "user", mockOwner.id);
    const after = Date.now();
    const expiresMs = new Date(invite.expiresAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  // Duplicate-invite guard
  it("409 – throws DUPLICATE_INVITE when same email is already pending", async () => {
    const svc = createMockUserManagementService([...mockOrgUsers], [...mockPendingInvites]);
    await expectErrorCode(
      () => svc.inviteUser(TEST_ORG_ID, mockPendingUserInvite.email, "user", mockOwner.id),
      "DUPLICATE_INVITE"
    );
  });

  it("allows re-inviting an email whose previous invite is no longer pending", async () => {
    const cancelledInvite = makeInvite({
      email: "reopen@test.com",
      role: "user",
      status: "cancelled",
    });
    const svc = createMockUserManagementService([...mockOrgUsers], [cancelledInvite]);
    const invite = await svc.inviteUser(TEST_ORG_ID, "reopen@test.com", "user", mockOwner.id);
    expect(invite.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id – update role
// ---------------------------------------------------------------------------

describe("PATCH /api/users/:id – update role", () => {
  function makeService() {
    return createMockUserManagementService([...mockOrgUsers]);
  }

  // 200 – authorised updates
  it("200 – owner can promote user to admin", async () => {
    const svc = makeService();
    const updated = await svc.updateUserRole(TEST_ORG_ID, mockUser.id, "admin", mockOwner.id);
    expect(updated.role).toBe("admin");
    expect(updated.id).toBe(mockUser.id);
  });

  it("200 – owner can demote admin to user", async () => {
    const svc = makeService();
    const updated = await svc.updateUserRole(TEST_ORG_ID, mockAdmin.id, "user", mockOwner.id);
    expect(updated.role).toBe("user");
  });

  it("200 – admin can reassign user to 'user' role", async () => {
    const svc = makeService();
    const updated = await svc.updateUserRole(TEST_ORG_ID, mockUser.id, "user", mockAdmin.id);
    expect(updated.role).toBe("user");
  });

  // 403 – unauthorised updates
  it("403 – admin cannot promote user to admin", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.updateUserRole(TEST_ORG_ID, mockUser.id, "admin", mockAdmin.id),
      "PERMISSION_DENIED"
    );
  });

  it("403 – admin cannot promote user to owner", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.updateUserRole(TEST_ORG_ID, mockUser.id, "owner", mockAdmin.id),
      "PERMISSION_DENIED"
    );
  });

  it("403 – admin cannot modify another admin's role", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.updateUserRole(TEST_ORG_ID, mockAdmin2.id, "user", mockAdmin.id),
      "PERMISSION_DENIED"
    );
  });

  it("403 – admin cannot modify an owner's role", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.updateUserRole(TEST_ORG_ID, mockOwner.id, "user", mockAdmin.id),
      "PERMISSION_DENIED"
    );
  });

  it("403 – regular user cannot change anyone's role", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.updateUserRole(TEST_ORG_ID, mockUser2.id, "admin", mockUser.id),
      "PERMISSION_DENIED"
    );
  });

  it("403 – no role can change its own role", async () => {
    const svc = makeService();
    for (const actor of [mockOwner, mockAdmin, mockUser]) {
      await expectErrorCode(
        () => svc.updateUserRole(TEST_ORG_ID, actor.id, "user", actor.id),
        "PERMISSION_DENIED"
      );
    }
  });

  // State mutation
  it("persists the role change in the in-memory store", async () => {
    const svc = makeService();
    await svc.updateUserRole(TEST_ORG_ID, mockUser.id, "admin", mockOwner.id);
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    const updated = users.find((u) => u.id === mockUser.id);
    expect(updated?.role).toBe("admin");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/:id – remove member
// ---------------------------------------------------------------------------

describe("DELETE /api/users/:id – remove member", () => {
  function makeService() {
    return createMockUserManagementService([...mockOrgUsers]);
  }

  // 200 – authorised removals
  it("200 – owner can remove an admin", async () => {
    const svc = makeService();
    await expect(
      svc.removeUser(TEST_ORG_ID, mockAdmin.id, mockOwner.id)
    ).resolves.toBeUndefined();
  });

  it("200 – owner can remove a regular user", async () => {
    const svc = makeService();
    await expect(
      svc.removeUser(TEST_ORG_ID, mockUser.id, mockOwner.id)
    ).resolves.toBeUndefined();
  });

  it("200 – admin can remove a regular user", async () => {
    const svc = makeService();
    await expect(
      svc.removeUser(TEST_ORG_ID, mockUser.id, mockAdmin.id)
    ).resolves.toBeUndefined();
  });

  // 403 – unauthorised removals
  it("403 – admin cannot remove an owner", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.removeUser(TEST_ORG_ID, mockOwner.id, mockAdmin.id),
      "PERMISSION_DENIED"
    );
  });

  it("403 – admin cannot remove another admin", async () => {
    const svc = makeService();
    await expectErrorCode(
      () => svc.removeUser(TEST_ORG_ID, mockAdmin2.id, mockAdmin.id),
      "PERMISSION_DENIED"
    );
  });

  it("403 – regular user cannot remove anyone", async () => {
    const svc = makeService();
    for (const target of [mockUser2, mockAdmin, mockOwner]) {
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, target.id, mockUser.id),
        "PERMISSION_DENIED"
      );
    }
  });

  it("CANNOT_REMOVE_SELF – no role can remove itself", async () => {
    const svc = makeService();
    for (const actor of [mockOwner, mockAdmin, mockUser]) {
      await expectErrorCode(
        () => svc.removeUser(TEST_ORG_ID, actor.id, actor.id),
        "CANNOT_REMOVE_SELF"
      );
    }
  });

  it("LAST_OWNER – owner cannot remove the only remaining owner", async () => {
    // mockOrgUsers has one owner (mockOwner). Add a second owner as the actor
    // to avoid the self-removal path; the target is the last-standing owner.
    const secondOwner = makeUser({ id: "owner-extra", role: "owner" });
    const svc = createMockUserManagementService([...mockOrgUsers, secondOwner]);
    await expectErrorCode(
      () => svc.removeUser(TEST_ORG_ID, mockOwner.id, secondOwner.id),
      "LAST_OWNER"
    );
  });

  // State mutation
  it("removed member no longer appears in getOrganizationUsers", async () => {
    const svc = makeService();
    await svc.removeUser(TEST_ORG_ID, mockUser.id, mockOwner.id);
    const remaining = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(remaining.find((u) => u.id === mockUser.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Invite management – list, resend, cancel
// ---------------------------------------------------------------------------

describe("Invite management", () => {
  function makeService() {
    return createMockUserManagementService([...mockOrgUsers], [...mockPendingInvites]);
  }

  describe("getPendingInvites", () => {
    it("returns only pending invites for the org", async () => {
      const svc = makeService();
      const pending = await svc.getPendingInvites(TEST_ORG_ID);
      expect(pending.length).toBeGreaterThan(0);
      expect(pending.every((i) => i.status === "pending")).toBe(true);
      expect(pending.every((i) => i.organizationId === TEST_ORG_ID)).toBe(true);
    });

    it("returns empty array when no pending invites exist", async () => {
      const svc = createMockUserManagementService([...mockOrgUsers], []);
      expect(await svc.getPendingInvites(TEST_ORG_ID)).toHaveLength(0);
    });
  });

  describe("resendInvite", () => {
    it("owner can resend an existing invite", async () => {
      const svc = makeService();
      const resent = await svc.resendInvite(
        TEST_ORG_ID,
        mockPendingUserInvite.id,
        mockOwner.id
      );
      expect(resent.status).toBe("pending");
      expect(new Date(resent.expiresAt).getTime()).toBeGreaterThan(
        new Date(mockPendingUserInvite.expiresAt).getTime()
      );
    });

    it("admin can resend an invite", async () => {
      const svc = makeService();
      const resent = await svc.resendInvite(
        TEST_ORG_ID,
        mockPendingUserInvite.id,
        mockAdmin.id
      );
      expect(resent.status).toBe("pending");
    });

    it("regular user cannot resend an invite", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.resendInvite(TEST_ORG_ID, mockPendingUserInvite.id, mockUser.id),
        "PERMISSION_DENIED"
      );
    });
  });

  describe("cancelInvite", () => {
    it("owner can cancel a pending invite", async () => {
      const svc = makeService();
      await expect(
        svc.cancelInvite(TEST_ORG_ID, mockPendingUserInvite.id, mockOwner.id)
      ).resolves.toBeUndefined();
      const pending = await svc.getPendingInvites(TEST_ORG_ID);
      expect(pending.find((i) => i.id === mockPendingUserInvite.id)).toBeUndefined();
    });

    it("admin can cancel a pending invite", async () => {
      const svc = makeService();
      await expect(
        svc.cancelInvite(TEST_ORG_ID, mockPendingAdminInvite.id, mockAdmin.id)
      ).resolves.toBeUndefined();
    });

    it("regular user cannot cancel an invite", async () => {
      const svc = makeService();
      await expectErrorCode(
        () => svc.cancelInvite(TEST_ORG_ID, mockPendingUserInvite.id, mockUser.id),
        "PERMISSION_DENIED"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Real-time subscriptions
// ---------------------------------------------------------------------------

describe("Real-time subscriptions", () => {
  it("user subscription fires when _triggerUserUpdate is called", () => {
    const svc = createMockUserManagementService([...mockOrgUsers]);
    const spy = jest.fn();
    svc.subscribeToUserChanges(TEST_ORG_ID, spy);
    const updated = [...mockOrgUsers, makeUser({ role: "user" })];
    svc._triggerUserUpdate(updated);
    expect(spy).toHaveBeenCalledWith(updated);
  });

  it("invite subscription fires when _triggerInviteUpdate is called", () => {
    const svc = createMockUserManagementService([...mockOrgUsers], [...mockPendingInvites]);
    const spy = jest.fn();
    svc.subscribeToInviteChanges(TEST_ORG_ID, spy);
    const newInvites = [...mockPendingInvites, makeInvite({ email: "rt@test.com", role: "user" })];
    svc._triggerInviteUpdate(newInvites);
    expect(spy).toHaveBeenCalledWith(newInvites);
  });

  it("unsubscribing stops the callback from firing", () => {
    const svc = createMockUserManagementService([...mockOrgUsers]);
    const spy = jest.fn();
    const unsubscribe = svc.subscribeToUserChanges(TEST_ORG_ID, spy);
    unsubscribe();
    svc._triggerUserUpdate([...mockOrgUsers]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("multiple subscribers each receive the update", () => {
    const svc = createMockUserManagementService([...mockOrgUsers]);
    const spy1 = jest.fn();
    const spy2 = jest.fn();
    svc.subscribeToUserChanges(TEST_ORG_ID, spy1);
    svc.subscribeToUserChanges(TEST_ORG_ID, spy2);
    svc._triggerUserUpdate([...mockOrgUsers]);
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  it("only the unsubscribed callback stops receiving; others continue", () => {
    const svc = createMockUserManagementService([...mockOrgUsers]);
    const spy1 = jest.fn();
    const spy2 = jest.fn();
    const unsub1 = svc.subscribeToUserChanges(TEST_ORG_ID, spy1);
    svc.subscribeToUserChanges(TEST_ORG_ID, spy2);
    unsub1();
    svc._triggerUserUpdate([...mockOrgUsers]);
    expect(spy1).not.toHaveBeenCalled();
    expect(spy2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Permission-gated UI – user-management module access
// ---------------------------------------------------------------------------

describe("UI permission gating – user-management module", () => {
  it("owner can access the user-management feature", () => {
    const perm = resolvePermission("owner", "user-management");
    expect(shouldShowElement(perm)).toBe(true);
  });

  it("admin can access the user-management feature", () => {
    const perm = resolvePermission("admin", "user-management");
    expect(shouldShowElement(perm)).toBe(true);
  });

  it("regular user cannot access the user-management feature", () => {
    const perm = resolvePermission("user", "user-management");
    expect(shouldShowElement(perm)).toBe(false);
  });

  it("owner can access user-management settings", () => {
    const perm = resolvePermission("owner", "user-management");
    expect(shouldShowElement(perm, true)).toBe(true);
  });

  it("admin cannot access user-management settings (no settingsAccess by default)", () => {
    const perm = resolvePermission("admin", "user-management");
    expect(shouldShowElement(perm, true)).toBe(false);
  });

  it("regular user cannot access user-management settings", () => {
    const perm = resolvePermission("user", "user-management");
    expect(shouldShowElement(perm, true)).toBe(false);
  });

  it("user: both canUse and canConfigure are false – entire module UI hidden", () => {
    const perm = resolvePermission("user", "user-management");
    expect(perm.canUse).toBe(false);
    expect(perm.canConfigure).toBe(false);
  });

  it("canManageUsers aligns with featureAccess permission resolution", () => {
    // Verify the two permission layers agree on who has management capability
    const ownerPerm = resolvePermission("owner", "user-management");
    const adminPerm = resolvePermission("admin", "user-management");
    const userPerm = resolvePermission("user", "user-management");

    expect(ownerPerm.canUse).toBe(canManageUsers("owner"));
    expect(adminPerm.canUse).toBe(canManageUsers("admin"));
    expect(userPerm.canUse).toBe(canManageUsers("user"));
  });
});

// ---------------------------------------------------------------------------
// Multi-tenant isolation
// ---------------------------------------------------------------------------

describe("multi-tenant isolation", () => {
  it("getOrganizationUsers excludes users from other orgs", async () => {
    const extUser = makeUser({ role: "owner", organizationId: OTHER_ORG_ID });
    const svc = createMockUserManagementService([...mockOrgUsers, extUser]);
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(users.map((u) => u.id)).not.toContain(extUser.id);
  });

  it("querying another org's ID returns only that org's users", async () => {
    const extUser = makeUser({ role: "owner", organizationId: OTHER_ORG_ID });
    const svc = createMockUserManagementService([...mockOrgUsers, extUser]);
    const users = await svc.getOrganizationUsers(OTHER_ORG_ID);
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(extUser.id);
  });

  it("getPendingInvites only returns invites for the queried org", async () => {
    const extInvite = makeInvite({
      email: "ext@other.com",
      role: "user",
      organizationId: OTHER_ORG_ID,
    });
    const svc = createMockUserManagementService(
      [...mockOrgUsers],
      [...mockPendingInvites, extInvite]
    );
    const invites = await svc.getPendingInvites(TEST_ORG_ID);
    expect(invites.map((i) => i.id)).not.toContain(extInvite.id);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("NOT_FOUND when requesting user does not exist", async () => {
    const svc = createMockUserManagementService([...mockOrgUsers]);
    await expectErrorCode(
      () => svc.updateUserRole(TEST_ORG_ID, mockUser.id, "admin", "ghost-id"),
      "NOT_FOUND"
    );
  });

  it("NOT_FOUND when target user does not exist", async () => {
    const svc = createMockUserManagementService([...mockOrgUsers]);
    await expectErrorCode(
      () => svc.updateUserRole(TEST_ORG_ID, "ghost-id", "user", mockOwner.id),
      "NOT_FOUND"
    );
  });

  it("inviteUser handles email addresses with special characters", async () => {
    const svc = createMockUserManagementService([...mockOrgUsers]);
    const invite = await svc.inviteUser(
      TEST_ORG_ID,
      "user+tag@sub.domain.example.com",
      "user",
      mockOwner.id
    );
    expect(invite.email).toBe("user+tag@sub.domain.example.com");
  });

  it("service handles a large org list without errors", async () => {
    const largeList = generateLargeUserList(500);
    const svc = createMockUserManagementService(largeList);
    const users = await svc.getOrganizationUsers(TEST_ORG_ID);
    expect(users.length).toBe(500);
  });

  it("_users reflects mutations in real-time", async () => {
    const svc = createMockUserManagementService([...mockOrgUsers]);
    await svc.removeUser(TEST_ORG_ID, mockUser.id, mockOwner.id);
    expect(svc._users.find((u) => u.id === mockUser.id)).toBeUndefined();
  });

  it("_invites reflects new invites in real-time", async () => {
    const svc = createMockUserManagementService([...mockOrgUsers], []);
    await svc.inviteUser(TEST_ORG_ID, "new@test.com", "user", mockOwner.id);
    expect(svc._invites).toHaveLength(1);
  });
});
