/**
 * Supabase client configuration with full TypeScript type inference.
 *
 * Exports two clients:
 *
 *   supabase   - Browser-safe client using the public anon key.
 *                For use in Client Components and browser-side hooks.
 *                RLS policies are enforced; no privileged access.
 *
 *   getAdminDb - Server-only factory that returns a client using the
 *                service-role key, bypassing RLS.
 *                Must ONLY be called from API routes or Server Actions.
 *
 * Both clients are typed against the Database interface defined in
 * src/types/database.ts, so all .from() calls, column names, and return
 * types are fully type-checked.
 *
 * Required environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL      - Supabase project URL (public, safe for browser)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY - Supabase anon key (public, safe for browser)
 *   SUPABASE_SERVICE_ROLE_KEY     - Supabase service-role key (server only, never expose)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Browser client (anon key, RLS enforced)
// ---------------------------------------------------------------------------

/**
 * Singleton Supabase client for use in Client Components.
 * Uses the public anon key — subject to RLS policies.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------------------------------------------------------------------------
// Server admin client (service-role key, bypasses RLS)
// ---------------------------------------------------------------------------

/**
 * Returns a Supabase client with the service-role key.
 *
 * This client bypasses Row Level Security and should ONLY be instantiated
 * inside server-side code (API routes, Server Actions, server components).
 * Never import or call this from client-side modules.
 */
export function getAdminDb(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        // Disable automatic token refresh — the admin client is short-lived
        // and only used for individual server-side operations.
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Convenience re-export of row types for use alongside the client
// ---------------------------------------------------------------------------

export type {
  Database,
  UserRow,
  OrganizationRow,
  OrganizationMemberRow,
  SessionRow,
  AccountRow,
  InvitationRow,
  ModulePermissionRow,
  PermissionAuditLogRow,
  UserRole,
  OrgMemberRole,
  PermissionRole,
  PermissionLevel,
  InvitationStatus,
} from "@/types/database";
