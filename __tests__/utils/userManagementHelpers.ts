// Test utilities and business-logic helpers for user management integration tests

import {
  OrganizationUser,
  PendingInvite,
  UserManagementRole,
  UserStatus,
  InviteStatus,
  TEST_ORG_ID,
} from "../fixtures/userData";

// ============================================================
// Permission helpers
// These functions encode the role-based access rules that the
// real implementation must enforce.
// ============================================================

/** Returns true if the role has any user-management capability at all. */
export function canManageUsers(role: UserManagementRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Returns true if a user with `currentRole` may send an invitation for
 * a slot that will have `targetRole`.
 *
 * Owners may invite at any level.
 * Admins may only invite regular Users.
 * Users cannot invite anyone.
 */
export function canInviteRole(
  currentRole: UserManagementRole,
  targetRole: UserManagementRole
): boolean {
  if (currentRole === "owner") return true;
  if (currentRole === "admin") return targetRole === "user";
  return false;
}

/**
 * Checks whether `currentUser` is allowed to change `targetUser`'s role
 * to `newRole`.  Returns `{ allowed: true }` or `{ allowed: false, reason }`.
 */
export function canChangeUserRole(
  currentUser: OrganizationUser,
  targetUser: OrganizationUser,
  newRole: UserManagementRole
): { allowed: boolean; reason?: string } {
  if (currentUser.role === "user") {
    return { allowed: false, reason: "Users do not have management permissions" };
  }

  if (currentUser.id === targetUser.id) {
    return { allowed: false, reason: "You cannot change your own role" };
  }

  if (currentUser.role === "admin") {
    if (targetUser.role === "owner") {
      return { allowed: false, reason: "Admins cannot modify Owner roles" };
    }
    if (targetUser.role === "admin") {
      return { allowed: false, reason: "Admins cannot modify other Admin roles" };
    }
    if (newRole === "owner" || newRole === "admin") {
      return { allowed: false, reason: "Admins can only assign the User role" };
    }
  }

  return { allowed: true };
}

/**
 * Checks whether `currentUser` is allowed to remove `targetUser`.
 * Accepts the full `allUsers` list to detect the last-owner scenario.
 */
export function canRemoveUser(
  currentUser: OrganizationUser,
  targetUser: OrganizationUser,
  allUsers: OrganizationUser[]
): { allowed: boolean; reason?: string } {
  if (currentUser.role === "user") {
    return { allowed: false, reason: "Users do not have management permissions" };
  }

  if (currentUser.id === targetUser.id) {
    return { allowed: false, reason: "You cannot remove yourself from the organization" };
  }

  if (currentUser.role === "admin" && targetUser.role === "owner") {
    return { allowed: false, reason: "Admins cannot remove Owners" };
  }

  if (currentUser.role === "admin" && targetUser.role === "admin") {
    return { allowed: false, reason: "Admins cannot remove other Admins" };
  }

  if (targetUser.role === "owner") {
    const ownerCount = allUsers.filter((u) => u.role === "owner").length;
    if (ownerCount <= 1) {
      return { allowed: false, reason: "Cannot remove the last owner of the organization" };
    }
  }

  return { allowed: true };
}

// ============================================================
// In-memory service implementation
//
// Used by integration tests to exercise business rules without
// a real database.  Mirrors the API surface the production
// implementation must expose.
// ============================================================

export interface UserManagementService {
  getOrganizationUsers(organizationId: string): Promise<OrganizationUser[]>;
  getUserById(organizationId: string, userId: string): Promise<OrganizationUser | null>;
  updateUserRole(
    organizationId: string,
    userId: string,
    newRole: UserManagementRole,
    requestingUserId: string
  ): Promise<OrganizationUser>;
  removeUser(
    organizationId: string,
    userId: string,
    requestingUserId: string
  ): Promise<void>;
  inviteUser(
    organizationId: string,
    email: string,
    role: UserManagementRole,
    requestingUserId: string
  ): Promise<PendingInvite>;
  getPendingInvites(organizationId: string): Promise<PendingInvite[]>;
  resendInvite(
    organizationId: string,
    inviteId: string,
    requestingUserId: string
  ): Promise<PendingInvite>;
  cancelInvite(
    organizationId: string,
    inviteId: string,
    requestingUserId: string
  ): Promise<void>;
  subscribeToUserChanges(
    organizationId: string,
    callback: (users: OrganizationUser[]) => void
  ): () => void;
  subscribeToInviteChanges(
    organizationId: string,
    callback: (invites: PendingInvite[]) => void
  ): () => void;
}

export interface MockUserManagementService extends UserManagementService {
  /** Direct access to the current in-memory user list. */
  readonly _users: OrganizationUser[];
  /** Direct access to the current in-memory invite list. */
  readonly _invites: PendingInvite[];
  /** Simulate a real-time push that updates users and fires subscribers. */
  _triggerUserUpdate(users: OrganizationUser[]): void;
  /** Simulate a real-time push that updates invites and fires subscribers. */
  _triggerInviteUpdate(invites: PendingInvite[]): void;
}

function makeError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * Creates a self-contained, in-memory implementation of UserManagementService.
 * All permission rules from the helpers above are enforced.
 */
export function createMockUserManagementService(
  initialUsers: OrganizationUser[] = [],
  initialInvites: PendingInvite[] = []
): MockUserManagementService {
  let users = [...initialUsers];
  let invites = [...initialInvites];
  let userSubs: Array<(users: OrganizationUser[]) => void> = [];
  let inviteSubs: Array<(invites: PendingInvite[]) => void> = [];

  let idCounter = Date.now();
  function nextId(prefix: string) {
    return `${prefix}-${++idCounter}`;
  }

  return {
    get _users() {
      return users;
    },
    get _invites() {
      return invites;
    },

    _triggerUserUpdate(newUsers: OrganizationUser[]) {
      users = newUsers;
      userSubs.forEach((cb) => cb(newUsers));
    },

    _triggerInviteUpdate(newInvites: PendingInvite[]) {
      invites = newInvites;
      inviteSubs.forEach((cb) => cb(newInvites));
    },

    async getOrganizationUsers(organizationId) {
      return users.filter((u) => u.organizationId === organizationId);
    },

    async getUserById(organizationId, userId) {
      return (
        users.find((u) => u.organizationId === organizationId && u.id === userId) ?? null
      );
    },

    async updateUserRole(organizationId, userId, newRole, requestingUserId) {
      const requestingUser = users.find((u) => u.id === requestingUserId);
      const targetUser = users.find((u) => u.id === userId);

      if (!requestingUser || !targetUser) {
        throw makeError("User not found", "NOT_FOUND");
      }

      const check = canChangeUserRole(requestingUser, targetUser, newRole);
      if (!check.allowed) {
        throw makeError(check.reason!, "PERMISSION_DENIED");
      }

      const updated: OrganizationUser = { ...targetUser, role: newRole };
      users = users.map((u) => (u.id === userId ? updated : u));
      return updated;
    },

    async removeUser(organizationId, userId, requestingUserId) {
      const requestingUser = users.find((u) => u.id === requestingUserId);
      const targetUser = users.find((u) => u.id === userId);

      if (!requestingUser || !targetUser) {
        throw makeError("User not found", "NOT_FOUND");
      }

      const check = canRemoveUser(requestingUser, targetUser, users);
      if (!check.allowed) {
        const code = check.reason?.includes("yourself")
          ? "CANNOT_REMOVE_SELF"
          : check.reason?.includes("last owner")
          ? "LAST_OWNER"
          : "PERMISSION_DENIED";
        throw makeError(check.reason!, code);
      }

      users = users.filter((u) => u.id !== userId);
    },

    async inviteUser(organizationId, email, role, requestingUserId) {
      const requestingUser = users.find((u) => u.id === requestingUserId);
      if (!requestingUser) {
        throw makeError("Requesting user not found", "NOT_FOUND");
      }

      if (!canInviteRole(requestingUser.role, role)) {
        throw makeError(
          "Insufficient permissions to invite with this role",
          "PERMISSION_DENIED"
        );
      }

      const duplicate = invites.find((i) => i.email === email && i.status === "pending");
      if (duplicate) {
        throw makeError("An invitation for this email is already pending", "DUPLICATE_INVITE");
      }

      const now = new Date();
      const invite: PendingInvite = {
        id: nextId("invite"),
        email,
        role,
        organizationId,
        invitedBy: requestingUserId,
        invitedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "pending",
        token: `tok-${Math.random().toString(36).slice(2)}`,
      };
      invites = [...invites, invite];
      return invite;
    },

    async getPendingInvites(organizationId) {
      return invites.filter(
        (i) => i.organizationId === organizationId && i.status === "pending"
      );
    },

    async resendInvite(organizationId, inviteId, requestingUserId) {
      const requestingUser = users.find((u) => u.id === requestingUserId);
      const invite = invites.find((i) => i.id === inviteId);

      if (!requestingUser || !invite) {
        throw makeError("Not found", "NOT_FOUND");
      }

      if (!canManageUsers(requestingUser.role)) {
        throw makeError("Permission denied", "PERMISSION_DENIED");
      }

      const now = new Date();
      const updated: PendingInvite = {
        ...invite,
        invitedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "pending",
      };
      invites = invites.map((i) => (i.id === inviteId ? updated : i));
      return updated;
    },

    async cancelInvite(organizationId, inviteId, requestingUserId) {
      const requestingUser = users.find((u) => u.id === requestingUserId);
      const invite = invites.find((i) => i.id === inviteId);

      if (!requestingUser || !invite) {
        throw makeError("Not found", "NOT_FOUND");
      }

      if (!canManageUsers(requestingUser.role)) {
        throw makeError("Permission denied", "PERMISSION_DENIED");
      }

      invites = invites.map((i) =>
        i.id === inviteId ? { ...i, status: "cancelled" as InviteStatus } : i
      );
    },

    subscribeToUserChanges(_organizationId, callback) {
      userSubs.push(callback);
      return () => {
        userSubs = userSubs.filter((cb) => cb !== callback);
      };
    },

    subscribeToInviteChanges(_organizationId, callback) {
      inviteSubs.push(callback);
      return () => {
        inviteSubs = inviteSubs.filter((cb) => cb !== callback);
      };
    },
  };
}

// ============================================================
// Supabase mock builder
// ============================================================

export interface MockSupabaseQueryBuilder {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  in: jest.Mock;
  single: jest.Mock;
  limit: jest.Mock;
  order: jest.Mock;
}

/**
 * Builds a chainable Supabase query-builder mock that resolves with
 * `{ data, error }` on terminal calls (`.single()`, `.then()`).
 */
export function createMockQueryBuilder(
  data: unknown = null,
  error: unknown = null
): MockSupabaseQueryBuilder {
  const builder = {} as MockSupabaseQueryBuilder;
  const chain = () => builder;

  builder.select = jest.fn().mockReturnValue(chain());
  builder.insert = jest.fn().mockReturnValue(chain());
  builder.update = jest.fn().mockReturnValue(chain());
  builder.delete = jest.fn().mockReturnValue(chain());
  builder.eq = jest.fn().mockReturnValue(chain());
  builder.neq = jest.fn().mockReturnValue(chain());
  builder.in = jest.fn().mockReturnValue(chain());
  builder.single = jest.fn().mockResolvedValue({ data, error });
  builder.limit = jest.fn().mockReturnValue(chain());
  builder.order = jest.fn().mockReturnValue(chain());

  // Make builder itself thenable so `await from(...).select(...)` works.
  (builder as unknown as { then: jest.Mock }).then = jest
    .fn()
    .mockImplementation(
      (resolve: (v: { data: unknown; error: unknown }) => void) =>
        Promise.resolve(resolve({ data, error }))
    );

  return builder;
}

export interface MockRealtimeChannel {
  on: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
}

export function createMockRealtimeChannel(): MockRealtimeChannel {
  const ch = {} as MockRealtimeChannel;
  ch.on = jest.fn().mockReturnValue(ch);
  ch.subscribe = jest.fn().mockReturnValue(ch);
  ch.unsubscribe = jest.fn().mockResolvedValue({ error: null });
  return ch;
}

export function setupSupabaseMock() {
  const mockChannel = createMockRealtimeChannel();
  const mockSupabase = {
    from: jest.fn().mockReturnValue(createMockQueryBuilder()),
    channel: jest.fn().mockReturnValue(mockChannel),
    removeChannel: jest.fn().mockResolvedValue({ error: null }),
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: null }, error: null }),
      getSession: jest
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
    },
  };
  return { mockSupabase, mockChannel };
}

// ============================================================
// Assertion helpers
// ============================================================

/** Asserts that `fn` rejects with an error whose `.code` matches. */
export async function expectErrorCode(
  fn: () => Promise<unknown>,
  expectedCode: string
): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    const code = (err as { code?: string }).code;
    expect(code).toBe(expectedCode);
  }
  if (!threw) {
    throw new Error(`Expected function to throw with code "${expectedCode}" but it did not throw`);
  }
}

/** Returns the owner-count from a user list. */
export function ownerCount(users: OrganizationUser[]): number {
  return users.filter((u) => u.role === "owner").length;
}

/** Returns all active members (status === 'active'). */
export function activeUsers(users: OrganizationUser[]): OrganizationUser[] {
  return users.filter((u) => u.status === "active");
}

/** Factory: creates an OrganizationUser with sensible defaults, overriding any fields. */
export function makeUser(overrides: Partial<OrganizationUser> & { role: UserManagementRole }): OrganizationUser {
  return {
    id: `user-${Math.random().toString(36).slice(2)}`,
    email: `user-${Math.random().toString(36).slice(2)}@example.com`,
    name: "Test User",
    organizationId: TEST_ORG_ID,
    status: "active" as UserStatus,
    joinedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Factory: creates a PendingInvite with sensible defaults, overriding any fields. */
export function makeInvite(
  overrides: Partial<PendingInvite> & { email: string; role: UserManagementRole }
): PendingInvite {
  const now = new Date();
  return {
    id: `invite-${Math.random().toString(36).slice(2)}`,
    organizationId: TEST_ORG_ID,
    invitedBy: "user-owner-1",
    invitedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: "pending" as InviteStatus,
    token: `tok-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}
