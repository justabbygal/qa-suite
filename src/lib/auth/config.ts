/**
 * Better Auth server-side configuration.
 *
 * Initializes Better Auth with:
 *  - PostgreSQL connection (Supabase database via direct connection string)
 *  - Email/password authentication
 *  - Organization plugin for multi-tenant support
 *  - 7-day session expiry
 *
 * Must only be imported from server-side code (API routes, Server Actions).
 * Use `src/lib/auth/client.ts` for client-side auth operations.
 */

import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Enable SSL in production (Supabase requires it)
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// ---------------------------------------------------------------------------
// Auth configuration
// ---------------------------------------------------------------------------

export const auth = betterAuth({
  // PostgreSQL database via pg pool
  database: pool,

  // Base URL for constructing auth endpoint URLs (callbacks, redirects)
  baseURL: process.env.BETTER_AUTH_URL,

  // Secret used to sign session tokens and cookies
  secret: process.env.BETTER_AUTH_SECRET,

  // Email + password authentication
  emailAndPassword: {
    enabled: true,
    // Email verification is handled during the owner signup flow;
    // Better Auth email gate is disabled to allow immediate access.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  // Session management
  session: {
    // Sessions expire after 7 days of inactivity
    expiresIn: 60 * 60 * 24 * 7,
    // Re-issue session cookie if the session is older than 24 hours
    updateAge: 60 * 60 * 24,
  },

  // Plugins
  plugins: [
    // Multi-tenant organization support — creates organization, member,
    // invitation tables and exposes org management endpoints.
    organization({
      // Any authenticated user may create an organization.
      // The owner signup flow relies on this to bootstrap the first org.
      allowUserToCreateOrganization: true,
    }),
  ],
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Inferred type of the auth instance — used by auth client and API helpers. */
export type Auth = typeof auth;
