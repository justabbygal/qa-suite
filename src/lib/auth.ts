/**
 * Better Auth configuration with the Organization plugin.
 *
 * Better Auth manages its own auth tables (auth_user, sessions, accounts,
 * verifications, organizations, organization_members, org_invitations) via
 * a direct PostgreSQL connection using the DATABASE_URL.
 *
 * The Supabase JS client (src/lib/db.ts) is used for all application-layer
 * queries and respects Row Level Security. Better Auth bypasses RLS for auth
 * operations via the direct pg connection.
 *
 * Table mapping (Better Auth default → project name):
 *   user          → auth_user            (avoids "user" reserved word + app users table)
 *   session       → sessions
 *   account       → accounts
 *   verification  → verifications
 *   organization  → organizations        (organization plugin)
 *   member        → organization_members (organization plugin)
 *   invitation    → org_invitations      (organization plugin; separate from app invitations)
 *
 * Column mapping: Better Auth uses camelCase internally; all database columns
 * use snake_case as defined in supabase/migrations/001_initial_schema.sql.
 *
 * Required environment variables:
 *   DATABASE_URL          - Direct PostgreSQL connection string (from Supabase)
 *                           Format: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
 *   BETTER_AUTH_SECRET    - Random secret (≥32 chars) for signing sessions
 *   NEXT_PUBLIC_APP_URL   - Public base URL (e.g. https://qa-suite.fruition.com)
 */

import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Database connection pool
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  // Supabase requires SSL in production (hosted deployments).
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
  // Small pool — only auth operations use this connection.
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ---------------------------------------------------------------------------
// Auth instance
// ---------------------------------------------------------------------------

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET!,

  database: pool,

  // ── Email / password ──────────────────────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    // Email verification gate is disabled for the owner bootstrap flow;
    // accounts created by the server-side signup service are pre-confirmed.
    requireEmailVerification: false,
  },

  // ── Advanced ──────────────────────────────────────────────────────────────
  advanced: {
    // Use UUID v4 to be consistent with the rest of the database schema.
    generateId: () => crypto.randomUUID(),
    defaultCookieAttributes: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },

  // ── User model (table: auth_user) ─────────────────────────────────────────
  user: {
    modelName: "auth_user",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  // ── Session model (table: sessions) ──────────────────────────────────────
  session: {
    modelName: "sessions",
    fields: {
      expiresAt: "expires_at",
      userId: "user_id",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      activeOrganizationId: "active_organization_id",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    // Cache decoded session in a short-lived cookie to reduce DB round-trips.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  // ── Account model (table: accounts) ──────────────────────────────────────
  account: {
    modelName: "accounts",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  // ── Verification model (table: verifications) ─────────────────────────────
  verification: {
    modelName: "verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  // ── Plugins ───────────────────────────────────────────────────────────────
  plugins: [
    organization({
      // Map Better Auth's organization plugin tables to project conventions.
      schema: {
        organization: {
          modelName: "organizations",
          fields: {
            createdAt: "created_at",
            updatedAt: "updated_at",
          },
        },
        member: {
          modelName: "organization_members",
          fields: {
            organizationId: "organization_id",
            userId: "user_id",
            createdAt: "created_at",
          },
        },
        invitation: {
          modelName: "org_invitations",
          fields: {
            organizationId: "organization_id",
            expiresAt: "expires_at",
            inviterId: "inviter_id",
            createdAt: "created_at",
          },
        },
      },

      // Application role hierarchy: Owner > Admin > member (User)
      roles: {
        owner: {
          permissions: {
            organization: ["update", "delete"],
            member: ["create", "update", "delete", "list"],
            invitation: ["create", "cancel", "list"],
          },
        },
        admin: {
          permissions: {
            organization: ["update"],
            member: ["create", "update", "delete", "list"],
            invitation: ["create", "cancel", "list"],
          },
        },
        member: {
          permissions: {
            organization: [],
            member: ["list"],
            invitation: [],
          },
        },
      },

      // Invitations expire after 7 days (per initiative spec).
      invitationExpiresIn: 60 * 60 * 24 * 7,

      // After Better Auth creates an organization, backfill owner_id.
      // Better Auth's organization table does not have a native owner_id field.
      async organizationCreatedHook(org, ctx) {
        if (ctx.user?.id) {
          await pool.query(
            "UPDATE organizations SET owner_id = $1 WHERE id = $2",
            [ctx.user.id, org.id]
          );
        }
      },
    }),
  ],
});

/** Inferred type of the auth instance — use in API route handlers. */
export type Auth = typeof auth;
