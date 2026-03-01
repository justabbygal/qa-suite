/**
 * Test database setup and configuration
 *
 * Provides an in-memory representation of the Supabase database for
 * integration tests.  Tests seed this state before running and call
 * resetTestDatabase() in afterEach so every test starts clean.
 */

// ---------------------------------------------------------------------------
// Record interfaces – mirror the real database schema
// ---------------------------------------------------------------------------

export interface MockUser {
  id: string;
  email: string;
  name: string;
  organization_id: string;
  role: "Owner" | "Admin" | "User";
  created_at: string;
  updated_at: string;
}

export interface MockOrganization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface MockOrganizationMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: "Owner" | "Admin" | "User";
  created_at: string;
}

// ---------------------------------------------------------------------------
// In-memory database
// ---------------------------------------------------------------------------

class TestDatabase {
  users: MockUser[] = [];
  organizations: MockOrganization[] = [];
  organization_members: MockOrganizationMember[] = [];

  reset(): void {
    this.users = [];
    this.organizations = [];
    this.organization_members = [];
  }

  seedUsers(users: MockUser[]): void {
    this.users.push(...users);
  }

  seedOrganizations(organizations: MockOrganization[]): void {
    this.organizations.push(...organizations);
  }

  seedOrganizationMembers(members: MockOrganizationMember[]): void {
    this.organization_members.push(...members);
  }

  findUserByEmail(email: string): MockUser | undefined {
    return this.users.find((u) => u.email === email);
  }

  findOrganizationByName(name: string): MockOrganization | undefined {
    return this.organizations.find((o) => o.name === name);
  }

  findOrganizationBySlug(slug: string): MockOrganization | undefined {
    return this.organizations.find((o) => o.slug === slug);
  }

  getMembersByUserId(userId: string): MockOrganizationMember[] {
    return this.organization_members.filter((m) => m.user_id === userId);
  }
}

/** Shared in-memory database instance used across all integration tests. */
export const testDatabase = new TestDatabase();

/** Convenience alias: wipe all tables between tests. */
export function resetTestDatabase(): void {
  testDatabase.reset();
}

// ---------------------------------------------------------------------------
// Seed presets – common starting states for tests
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

/** Seed a user that already exists (to trigger duplicate-email errors). */
export function seedExistingUser(
  email: string,
  overrides: Partial<MockUser> = {}
): MockUser {
  const user: MockUser = {
    id: "existing-user-id",
    email,
    name: "Existing User",
    organization_id: "existing-org-id",
    role: "Owner",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
  testDatabase.seedUsers([user]);
  return user;
}

/** Seed an organization that already exists (to trigger duplicate-org errors). */
export function seedExistingOrganization(
  name: string,
  overrides: Partial<MockOrganization> = {}
): MockOrganization {
  const org: MockOrganization = {
    id: "existing-org-id",
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    owner_id: "existing-user-id",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
  testDatabase.seedOrganizations([org]);
  return org;
}

/** Seed a full owner record: user + org + membership. */
export function seedOwnerWithOrganization(
  email: string,
  orgName: string
): { user: MockUser; org: MockOrganization; member: MockOrganizationMember } {
  const user = seedExistingUser(email);
  const org = seedExistingOrganization(orgName, { owner_id: user.id });

  const member: MockOrganizationMember = {
    id: "existing-member-id",
    user_id: user.id,
    organization_id: org.id,
    role: "Owner",
    created_at: NOW,
  };
  testDatabase.seedOrganizationMembers([member]);

  return { user, org, member };
}

// ---------------------------------------------------------------------------
// Mock Supabase client factory
// ---------------------------------------------------------------------------

/**
 * Returns a Jest mock of the Supabase client whose query responses reflect the
 * current state of `testDatabase`.
 *
 * Use this factory when you want to test code that calls Supabase directly
 * (e.g., an API route handler).  For component-level integration tests that
 * go through the HTTP API, mock `global.fetch` instead.
 */
export function createMockSupabaseClient() {
  /**
   * Build a chainable query builder for a given table name.
   * Supports the subset of the Supabase JS API used by the signup flow.
   */
  function makeQueryBuilder(tableName: string) {
    const state = {
      filters: {} as Record<string, unknown>,
      insertPayload: null as unknown,
    };

    const builder = {
      select: jest.fn().mockReturnThis(),

      insert: jest.fn().mockImplementation((data: unknown) => {
        state.insertPayload = data;
        return builder;
      }),

      eq: jest.fn().mockImplementation((field: string, value: unknown) => {
        state.filters[field] = value;
        return builder;
      }),

      /**
       * Resolves to a single matching row or null.
       * Simulates INSERT … RETURNING for mutations and SELECT … LIMIT 1 for
       * reads based on whether insertPayload has been set.
       */
      single: jest.fn().mockImplementation(async () => {
        if (state.insertPayload !== null) {
          // Simulate a successful insert returning the new row.
          const record = {
            id: `generated-${tableName}-id`,
            ...(state.insertPayload as object),
            created_at: NOW,
            updated_at: NOW,
          };
          return { data: record, error: null };
        }
        return findSingleRecord(tableName, state.filters);
      }),

      /** Like single() but returns null instead of an error when no row found. */
      maybeSingle: jest.fn().mockImplementation(async () => {
        return findSingleRecord(tableName, state.filters);
      }),
    };

    return builder;
  }

  /** Look up one record from the in-memory database that matches all filters. */
  function findSingleRecord(
    tableName: string,
    filters: Record<string, unknown>
  ) {
    const table =
      tableName === "users"
        ? testDatabase.users
        : tableName === "organizations"
          ? testDatabase.organizations
          : tableName === "organization_members"
            ? testDatabase.organization_members
            : ([] as unknown[]);

    const match = (table as Record<string, unknown>[]).find((row) =>
      Object.entries(filters).every(([key, value]) => row[key] === value)
    );

    return { data: match ?? null, error: null };
  }

  return {
    from: jest.fn().mockImplementation((table: string) =>
      makeQueryBuilder(table)
    ),
    auth: {
      signUp: jest.fn().mockResolvedValue({
        data: {
          user: { id: "new-auth-user-id", email: "test@example.com" },
          session: {
            access_token: "mock-access-token",
            refresh_token: "mock-refresh-token",
          },
        },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: "mock-access-token",
            user: { id: "new-auth-user-id" },
          },
        },
        error: null,
      }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
  };
}
