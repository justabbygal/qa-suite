/**
 * Permission Resolution Examples
 *
 * Shows how to resolve and use permissions in Server Components,
 * API routes, and Client Components.
 */

import {
  resolvePermission,
  shouldShowElement,
  canManageUser,
  canAssignRole,
  hasAtLeastRole,
} from '@/lib/permissions/service';
import type { Role, PermissionOverride, ResolvedPermission } from '@/lib/permissions/types';

// ─── Basic resolution ─────────────────────────────────────────────────────

/**
 * Resolve a user's effective permission for a module.
 * orgOverrides typically come from GET /api/permissions?organizationId=...
 */
function exampleBasicResolution(userRole: Role, orgOverrides: PermissionOverride[]) {
  // Resolves against org overrides first, then in-memory registry defaults
  const permission: ResolvedPermission = resolvePermission(
    userRole,
    'integrations-engine',
    orgOverrides,
  );

  if (permission.canUse) {
    console.log('User can access the integrations engine');
  }

  if (permission.canConfigure) {
    console.log('User can configure the integrations engine');
  }
}

// ─── Route guard in a Next.js Server Component ────────────────────────────

/**
 * Pattern for protecting a page route.
 * Place this logic at the top of your page.tsx.
 */
async function exampleRouteGuard(userRole: Role, orgOverrides: PermissionOverride[]) {
  const { redirect } = await import('next/navigation');

  const permission = resolvePermission(userRole, 'reporting', orgOverrides);

  if (!permission.canUse) {
    // User's role does not have featureAccess for this module
    redirect('/403');
  }

  // Continue rendering the page...
  return { canConfigure: permission.canConfigure };
}

// ─── API route guard ──────────────────────────────────────────────────────

/**
 * Pattern for protecting an API route handler.
 */
function exampleApiGuard(userRole: Role, orgOverrides: PermissionOverride[]) {
  const { NextResponse } = require('next/server');

  const permission = resolvePermission(userRole, 'test-management', orgOverrides);

  if (!permission.canUse) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Continue processing the request...
}

// ─── Conditional UI rendering ─────────────────────────────────────────────

/**
 * shouldShowElement helper for toggling UI based on permission.
 *
 * @param permission   - Resolved permission for the current user
 * @param requireSettings - Pass true to require canConfigure (not just canUse)
 */
function exampleConditionalUI(permission: ResolvedPermission) {
  // Show the main feature area to anyone with featureAccess
  const showFeature = shouldShowElement(permission);

  // Show the settings panel only to those with settingsAccess
  const showSettings = shouldShowElement(permission, /* requireSettings */ true);

  return { showFeature, showSettings };
}

// ─── Role hierarchy helpers ───────────────────────────────────────────────

function exampleRoleHierarchy() {
  const actorRole: Role = 'admin';
  const targetRole: Role = 'user';

  // Can this admin manage (edit/remove) a user?
  const canManage = canManageUser(actorRole, targetRole);       // true (admin > user)

  // Can this admin assign the "user" role to a new member?
  const canAssign = canAssignRole(actorRole, 'user');            // true (admin > user)

  // Would an admin be blocked from assigning "owner"?
  const cannotAssignOwner = canAssignRole(actorRole, 'owner');  // false (admin < owner)

  // Does the actor have at least admin level?
  const isAdminOrAbove = hasAtLeastRole(actorRole, 'admin');    // true

  return { canManage, canAssign, cannotAssignOwner, isAdminOrAbove };
}

// ─── Permission key pattern ───────────────────────────────────────────────

/**
 * The usePermissionState hook (client-side) uses dot-notation permission keys.
 * This example shows how checkPermission() maps keys to resolved values.
 *
 * Permission key format:  "<module-id>.<accessType>"
 *   accessType:  "featureAccess" | "settingsAccess"
 *
 * Example keys:
 *   "integrations-engine.featureAccess"
 *   "integrations-engine.settingsAccess"
 *   "reporting.featureAccess"
 */
function examplePermissionKeys() {
  // In a client component using usePermissionState:
  //
  //   const { checkPermission } = usePermissionState();
  //   const userRole = useUserRole();   // returns 'Owner' | 'Admin' | 'User'
  //
  //   const canUseIntegrations     = checkPermission('integrations-engine.featureAccess', userRole);
  //   const canConfigIntegrations  = checkPermission('integrations-engine.settingsAccess', userRole);
  //
  // checkPermission resolves against the hook's loaded RegisteredModule data,
  // which comes from GET /api/permissions and includes org-level overrides.
}

// ─── Resolution when module is unregistered ───────────────────────────────

function exampleUnregisteredModule(orgOverrides: PermissionOverride[]) {
  // If a module ID is not in the in-memory registry, resolvePermission
  // returns { canUse: false, canConfigure: false } — safe fail-closed behaviour.
  const permission = resolvePermission('owner', 'non-existent-module', orgOverrides);

  console.log(permission.canUse);       // false
  console.log(permission.canConfigure); // false
}
