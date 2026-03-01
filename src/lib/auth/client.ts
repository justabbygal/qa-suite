/**
 * Better Auth client for frontend usage.
 *
 * Provides typed auth methods and hooks for React components.
 * Import hooks (useSession) only inside "use client" components.
 *
 * Usage:
 *   import { authClient } from "@/lib/auth/client"
 *   import { useSession, signIn, signOut } from "@/lib/auth/client"
 */

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // Must match BETTER_AUTH_URL on the server
  baseURL: process.env.NEXT_PUBLIC_APP_URL,

  plugins: [
    // Organization management: create orgs, invite members, switch active org
    organizationClient(),
  ],
});

// ---------------------------------------------------------------------------
// Named re-exports for ergonomic imports in components
// ---------------------------------------------------------------------------

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  organization,
} = authClient;
