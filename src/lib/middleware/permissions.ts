/**
 * Permission middleware for API route handlers.
 *
 * Provides composable guards that validate authentication, role hierarchy,
 * and specific module permissions. Session context is extracted from
 * Better Auth headers injected upstream:
 *
 *   Authorization:     Bearer <token>
 *   x-user-id:         <uuid>
 *   x-organization-id: <uuid>
 *   x-user-role:       Owner | Admin | User
 *
 * Permission keys use dot-notation:
 *   "<moduleId>.featureAccess"  — user can use the feature
 *   "<moduleId>.settingsAccess" — user can configure the feature
 *
 * Org-level permission overrides stored in the database are respected by
 * the requirePermission guard. Results are cached per-org for 30 seconds
 * to avoid redundant DB calls within a request burst.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/permissions/types";
import { hasAtLeastRole } from "@/lib/permissions/service";
import { getModules } from "@/lib/modules/moduleService";
import type { RegisteredModule } from "@/lib/modules/types";
import {
  cacheModules,
  getCachedModules,
  invalidateModuleCache,
  hasPermission as dynamicHasPermission,
} from "@/lib/services/dynamic-permission-resolver";
import {
  UnauthorizedError,
  ForbiddenError,
  toUserError,
} from "@/lib/errors/user-errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Authenticated session extracted from Better Auth request headers. */
export interface SessionContext {
  /** Authenticated user UUID. */
  userId: string;
  /** Organization the user belongs to. */
  organizationId: string;
  /** Normalized lowercase role: "owner" | "admin" | "user". */
  role: Role;
  /** Raw Bearer token (without the "Bearer " prefix). */
  token: string;
}

/** Guard passed — session context is available. */
export interface AuthResult {
  ok: true;
  context: SessionContext;
}

/** Guard failed — response is ready to return to the client. */
export interface ErrorResult {
  ok: false;
  response: NextResponse;
}

export type MiddlewareResult = AuthResult | ErrorResult;

// ---------------------------------------------------------------------------
// Session extraction
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set<string>(["owner", "admin", "user"]);

/**
 * Normalizes the role value from the x-user-role header (title-case) to the
 * lowercase Role type used by the permission service.
 */
function normalizeRole(raw: string | null): Role | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return VALID_ROLES.has(lower) ? (lower as Role) : null;
}

/**
 * Parses and validates the Better Auth session headers from a request.
 * Returns null when any required header is absent or malformed.
 */
export function extractSessionContext(
  request: NextRequest
): SessionContext | null {
  const authHeader = request.headers.get("authorization");
  const userId = request.headers.get("x-user-id");
  const organizationId = request.headers.get("x-organization-id");
  const rawRole = request.headers.get("x-user-role");

  if (
    !authHeader?.startsWith("Bearer ") ||
    !userId ||
    !organizationId ||
    !rawRole
  ) {
    return null;
  }

  const role = normalizeRole(rawRole);
  if (!role) return null;

  return {
    token: authHeader.slice(7),
    userId,
    organizationId,
    role,
  };
}

// ---------------------------------------------------------------------------
// Permission cache
// ---------------------------------------------------------------------------

/** TTL for cached module permission data used by this middleware. */
const MIDDLEWARE_CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Evicts cached module permissions for an organization.
 * Call this after any permission write to ensure guards see fresh data.
 *
 * Delegates to the dynamic permission resolver's shared cache so that
 * cache invalidations are reflected across all permission-check sites.
 */
export function invalidatePermissionCache(organizationId: string): void {
  invalidateModuleCache(organizationId);
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function fetchModulesForOrg(
  organizationId: string
): Promise<RegisteredModule[]> {
  const cached = getCachedModules(organizationId);
  if (cached) return cached;

  const supabase = getSupabaseAdmin();
  const modules = await getModules(supabase, organizationId);
  cacheModules(organizationId, modules, MIDDLEWARE_CACHE_TTL_MS);
  return modules;
}

// ---------------------------------------------------------------------------
// Error response helpers
// ---------------------------------------------------------------------------

function unauthorizedResponse(): NextResponse {
  return NextResponse.json(new UnauthorizedError().toApiResponse(), {
    status: 401,
  });
}

function forbiddenResponse(message?: string): NextResponse {
  return NextResponse.json(new ForbiddenError(message).toApiResponse(), {
    status: 403,
  });
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Validates that the request carries a complete, well-formed session.
 * Returns 401 when authentication headers are missing or invalid.
 *
 * @example
 * const result = requireAuth(request);
 * if (!result.ok) return result.response;
 * const { userId, role } = result.context;
 */
export function requireAuth(request: NextRequest): MiddlewareResult {
  const context = extractSessionContext(request);
  if (!context) {
    return { ok: false, response: unauthorizedResponse() };
  }
  return { ok: true, context };
}

/**
 * Returns a guard that allows only users with a privilege level at or above
 * `minimumRole`. Returns 401 if unauthenticated, 403 if the role is too low.
 *
 * Role hierarchy (highest to lowest): owner > admin > user
 *
 * @param minimumRole - Lowest role that should be permitted (e.g. "admin").
 *
 * @example
 * const guard = requireRole("admin");
 * const result = guard(request);
 * if (!result.ok) return result.response;
 */
export function requireRole(
  minimumRole: Role
): (request: NextRequest) => MiddlewareResult {
  return (request: NextRequest): MiddlewareResult => {
    const context = extractSessionContext(request);
    if (!context) {
      return { ok: false, response: unauthorizedResponse() };
    }

    if (!hasAtLeastRole(context.role, minimumRole)) {
      return {
        ok: false,
        response: forbiddenResponse(
          `This action requires at least the '${minimumRole}' role.`
        ),
      };
    }

    return { ok: true, context };
  };
}

/**
 * Returns an async guard that validates a specific module permission against
 * the organization's stored settings. Org-level overrides are respected.
 *
 * Permission keys use dot-notation:
 *   "<moduleId>.featureAccess"   — user can access the feature
 *   "<moduleId>.settingsAccess"  — user can configure the feature settings
 *
 * Both the module slug (e.g. "user-management") and its UUID are accepted
 * as the moduleId segment. Results are cached per-org for 30 seconds.
 *
 * @param permissionKey - Dot-notation key (e.g. "analytics.featureAccess").
 *
 * @example
 * const guard = requirePermission("analytics.settingsAccess");
 * const result = await guard(request);
 * if (!result.ok) return result.response;
 */
export function requirePermission(
  permissionKey: string
): (request: NextRequest) => Promise<MiddlewareResult> {
  const dotIndex = permissionKey.lastIndexOf(".");
  const moduleId = dotIndex > 0 ? permissionKey.slice(0, dotIndex) : "";
  const field = dotIndex > 0 ? permissionKey.slice(dotIndex + 1) : "";

  if (!moduleId || (field !== "featureAccess" && field !== "settingsAccess")) {
    // Misconfigured key — fail closed immediately (no async needed)
    return async () => ({
      ok: false,
      response: forbiddenResponse(
        `Server configuration error: invalid permission key '${permissionKey}'.`
      ),
    });
  }

  return async (request: NextRequest): Promise<MiddlewareResult> => {
    const context = extractSessionContext(request);
    if (!context) {
      return { ok: false, response: unauthorizedResponse() };
    }

    try {
      const modules = await fetchModulesForOrg(context.organizationId);

      // Delegate to the dynamic resolver which handles slug/UUID matching,
      // in-memory registry fallback, and the settingsAccess constraint.
      const permKey = `${moduleId}.${field}`;
      const allowed = dynamicHasPermission(modules, context.role, permKey);

      if (!allowed) {
        // Surface a more specific message when the module itself is not registered.
        const isRegistered = modules.some(
          (m) => m.module === moduleId || m.id === moduleId
        );
        if (!isRegistered) {
          return {
            ok: false,
            response: forbiddenResponse(
              `Permission check failed: module '${moduleId}' is not registered for this organization.`
            ),
          };
        }
        return {
          ok: false,
          response: forbiddenResponse(
            `You do not have ${field} permission for '${moduleId}'.`
          ),
        };
      }

      return { ok: true, context };
    } catch (error) {
      const ue = toUserError(error);
      return {
        ok: false,
        response: NextResponse.json(ue.toApiResponse(), {
          status: ue.httpStatus,
        }),
      };
    }
  };
}
