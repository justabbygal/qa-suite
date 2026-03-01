// Test fixtures for user management integration tests

// ============================================================
// Types (mirrors what the user management module will export)
// ============================================================

export type UserManagementRole = "owner" | "admin" | "user";
export type UserStatus = "active" | "invited" | "suspended";
export type InviteStatus = "pending" | "accepted" | "expired" | "cancelled";

export interface OrganizationUser {
  id: string;
  email: string;
  name: string;
  role: UserManagementRole;
  organizationId: string;
  status: UserStatus;
  joinedAt: string;
  lastActiveAt?: string;
  avatarUrl?: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: UserManagementRole;
  organizationId: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: InviteStatus;
  token: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface UserManagementError {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================================
// Shared constants
// ============================================================

export const TEST_ORG_ID = "test-org-fruition-123";
export const OTHER_ORG_ID = "other-org-456";

// ============================================================
// Organization
// ============================================================

export const mockOrganization: Organization = {
  id: TEST_ORG_ID,
  name: "Fruition Test",
  slug: "fruition-test",
  createdAt: "2024-01-01T00:00:00.000Z",
};

// ============================================================
// Users – one per role archetype + extras for edge cases
// ============================================================

export const mockOwner: OrganizationUser = {
  id: "user-owner-1",
  email: "alice.owner@fruition.com",
  name: "Alice Owner",
  role: "owner",
  organizationId: TEST_ORG_ID,
  status: "active",
  joinedAt: "2024-01-01T00:00:00.000Z",
  lastActiveAt: "2024-03-01T00:00:00.000Z",
};

export const mockOwner2: OrganizationUser = {
  id: "user-owner-2",
  email: "eve.owner@fruition.com",
  name: "Eve Owner",
  role: "owner",
  organizationId: TEST_ORG_ID,
  status: "active",
  joinedAt: "2024-01-02T00:00:00.000Z",
  lastActiveAt: "2024-03-01T00:00:00.000Z",
};

export const mockAdmin: OrganizationUser = {
  id: "user-admin-1",
  email: "bob.admin@fruition.com",
  name: "Bob Admin",
  role: "admin",
  organizationId: TEST_ORG_ID,
  status: "active",
  joinedAt: "2024-01-15T00:00:00.000Z",
  lastActiveAt: "2024-03-01T00:00:00.000Z",
};

export const mockAdmin2: OrganizationUser = {
  id: "user-admin-2",
  email: "carol.admin@fruition.com",
  name: "Carol Admin",
  role: "admin",
  organizationId: TEST_ORG_ID,
  status: "active",
  joinedAt: "2024-01-20T00:00:00.000Z",
  lastActiveAt: "2024-03-01T00:00:00.000Z",
};

export const mockUser: OrganizationUser = {
  id: "user-regular-1",
  email: "charlie.user@fruition.com",
  name: "Charlie User",
  role: "user",
  organizationId: TEST_ORG_ID,
  status: "active",
  joinedAt: "2024-02-01T00:00:00.000Z",
  lastActiveAt: "2024-03-01T00:00:00.000Z",
};

export const mockUser2: OrganizationUser = {
  id: "user-regular-2",
  email: "diana.user@fruition.com",
  name: "Diana User",
  role: "user",
  organizationId: TEST_ORG_ID,
  status: "active",
  joinedAt: "2024-02-15T00:00:00.000Z",
  lastActiveAt: "2024-02-28T00:00:00.000Z",
};

/** Complete standard member list: 1 owner, 2 admins, 2 users */
export const mockOrgUsers: OrganizationUser[] = [
  mockOwner,
  mockAdmin,
  mockAdmin2,
  mockUser,
  mockUser2,
];

/** Member list with two owners (used for "last owner" edge case tests) */
export const mockOrgUsersMultiOwner: OrganizationUser[] = [
  mockOwner,
  mockOwner2,
  mockAdmin,
  mockUser,
];

// ============================================================
// Pending invitations
// ============================================================

export const mockPendingUserInvite: PendingInvite = {
  id: "invite-pending-1",
  email: "newuser@example.com",
  role: "user",
  organizationId: TEST_ORG_ID,
  invitedBy: mockOwner.id,
  invitedAt: "2024-03-01T00:00:00.000Z",
  expiresAt: "2024-03-08T00:00:00.000Z",
  status: "pending",
  token: "secure-token-abc123",
};

export const mockPendingAdminInvite: PendingInvite = {
  id: "invite-pending-2",
  email: "newadmin@example.com",
  role: "admin",
  organizationId: TEST_ORG_ID,
  invitedBy: mockOwner.id,
  invitedAt: "2024-02-28T00:00:00.000Z",
  expiresAt: "2024-03-06T00:00:00.000Z",
  status: "pending",
  token: "secure-token-def456",
};

export const mockExpiredInvite: PendingInvite = {
  id: "invite-expired-1",
  email: "expired@example.com",
  role: "user",
  organizationId: TEST_ORG_ID,
  invitedBy: mockAdmin.id,
  invitedAt: "2024-02-01T00:00:00.000Z",
  expiresAt: "2024-02-08T00:00:00.000Z",
  status: "expired",
  token: "expired-token-ghi789",
};

export const mockCancelledInvite: PendingInvite = {
  id: "invite-cancelled-1",
  email: "cancelled@example.com",
  role: "user",
  organizationId: TEST_ORG_ID,
  invitedBy: mockAdmin.id,
  invitedAt: "2024-02-15T00:00:00.000Z",
  expiresAt: "2024-02-22T00:00:00.000Z",
  status: "cancelled",
  token: "cancelled-token-jkl012",
};

export const mockPendingInvites: PendingInvite[] = [
  mockPendingUserInvite,
  mockPendingAdminInvite,
];

// ============================================================
// Error fixtures
// ============================================================

export const mockPermissionError: UserManagementError = {
  code: "PERMISSION_DENIED",
  message: "You do not have permission to perform this action",
};

export const mockSelfRemovalError: UserManagementError = {
  code: "CANNOT_REMOVE_SELF",
  message: "You cannot remove yourself from the organization",
};

export const mockLastOwnerError: UserManagementError = {
  code: "LAST_OWNER",
  message: "Cannot remove the last owner of the organization",
};

export const mockDuplicateInviteError: UserManagementError = {
  code: "DUPLICATE_INVITE",
  message: "An invitation for this email is already pending",
};

export const mockNotFoundError: UserManagementError = {
  code: "NOT_FOUND",
  message: "The requested resource was not found",
};

// ============================================================
// Performance test data generator
// ============================================================

export function generateLargeUserList(count: number): OrganizationUser[] {
  return Array.from({ length: count }, (_, i) => {
    let role: UserManagementRole;
    if (i === 0) {
      role = "owner";
    } else if (i < Math.max(2, Math.floor(count * 0.1))) {
      role = "admin";
    } else {
      role = "user";
    }
    return {
      id: `user-perf-${i}`,
      email: `user${i}@example.com`,
      name: `Test User ${i}`,
      role,
      organizationId: TEST_ORG_ID,
      status: "active" as UserStatus,
      joinedAt: new Date(2024, 0, 1 + (i % 365)).toISOString(),
      lastActiveAt: new Date(2024, 2, 1).toISOString(),
    };
  });
}
