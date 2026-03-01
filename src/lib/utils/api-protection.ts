/**
 * Higher-order functions for protecting Next.js App Router route handlers.
 *
 * These wrappers compose the guards from lib/middleware/permissions with route
 * handlers, eliminating repetitive auth boilerplate from every route file.
 * The authenticated session context is injected as a third argument so
 * handlers never need to re-parse headers.
 *
 * Usage:
 *
 *   // Require any authenticated user
 *   export const GET = withAuth(async (req, ctx, session) => {
 *     return NextResponse.json({ userId: session.userId });
 *   });
 *
 *   // Require minimum role
 *   export const DELETE = withRole("admin", async (req, ctx, session) => {
 *     ...
 *   });
 *
 *   // Require a specific module permission
 *   export const POST = withPermission(
 *     "analytics.settingsAccess",
 *     async (req, ctx, session) => { ... }
 *   );
 *
 *   // Compose multiple guards (all must pass)
 *   export const PUT = withGuards(
 *     [requireRole("admin"), requirePermission("billing.featureAccess")],
 *     async (req, ctx, session) => { ... }
 *   );
 */

import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/lib/permissions/types";
import {
  requireAuth,
  requireRole as requireRoleGuard,
  requirePermission as requirePermissionGuard,
  type SessionContext,
  type MiddlewareResult,
} from "@/lib/middleware/permissions";
import { toUserError } from "@/lib/errors/user-errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dynamic route segment params (e.g. { moduleId: "abc-123" }). */
export type RouteParams = Record<string, string | string[]>;

/** Next.js App Router route context passed as the second handler argument. */
export interface RouteContext<P extends RouteParams = RouteParams> {
  params: P;
}

/**
 * A protected route handler. Receives the standard Next.js arguments plus the
 * authenticated session injected by the wrapper.
 */
export type ProtectedHandler<P extends RouteParams = RouteParams> = (
  request: NextRequest,
  context: RouteContext<P>,
  session: SessionContext
) => Promise<NextResponse>;

/** Any synchronous or asynchronous guard function. */
export type Guard = (
  request: NextRequest
) => MiddlewareResult | Promise<MiddlewareResult>;

// ---------------------------------------------------------------------------
// Core wrappers
// ---------------------------------------------------------------------------

/**
 * Requires a valid authenticated session. Returns 401 when authentication
 * headers are missing or malformed.
 *
 * @example
 * export const GET = withAuth(async (req, ctx, session) => {
 *   return NextResponse.json({ userId: session.userId });
 * });
 */
export function withAuth<P extends RouteParams = RouteParams>(
  handler: ProtectedHandler<P>
): (request: NextRequest, context: RouteContext<P>) => Promise<NextResponse> {
  return async (request, context) => {
    try {
      const result = requireAuth(request);
      if (!result.ok) return result.response;
      return await handler(request, context, result.context);
    } catch (error) {
      const ue = toUserError(error);
      return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
    }
  };
}

/**
 * Requires the caller to have at least `minimumRole`. Returns 401 if
 * unauthenticated, 403 if the role is insufficient.
 *
 * Role hierarchy (highest → lowest): owner > admin > user
 *
 * @param minimumRole - Lowest role that is permitted (e.g. "admin").
 *
 * @example
 * export const DELETE = withRole("owner", async (req, ctx, session) => {
 *   ...
 * });
 */
export function withRole<P extends RouteParams = RouteParams>(
  minimumRole: Role,
  handler: ProtectedHandler<P>
): (request: NextRequest, context: RouteContext<P>) => Promise<NextResponse> {
  const guard = requireRoleGuard(minimumRole);
  return async (request, context) => {
    try {
      const result = guard(request);
      if (!result.ok) return result.response;
      return await handler(request, context, result.context);
    } catch (error) {
      const ue = toUserError(error);
      return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
    }
  };
}

/**
 * Requires a specific module permission. Returns 401 if unauthenticated, 403
 * if the permission is denied.
 *
 * Permission keys use dot-notation:
 *   "<moduleId>.featureAccess"   — user can access the feature
 *   "<moduleId>.settingsAccess"  — user can configure the feature settings
 *
 * @param permissionKey - e.g. "analytics.featureAccess"
 *
 * @example
 * export const POST = withPermission(
 *   "analytics.settingsAccess",
 *   async (req, ctx, session) => { ... }
 * );
 */
export function withPermission<P extends RouteParams = RouteParams>(
  permissionKey: string,
  handler: ProtectedHandler<P>
): (request: NextRequest, context: RouteContext<P>) => Promise<NextResponse> {
  const guard = requirePermissionGuard(permissionKey);
  return async (request, context) => {
    try {
      const result = await guard(request);
      if (!result.ok) return result.response;
      return await handler(request, context, result.context);
    } catch (error) {
      const ue = toUserError(error);
      return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
    }
  };
}

/**
 * Composes multiple guards, running them in order. All guards must pass for
 * the handler to be invoked. The session context from the last guard is
 * forwarded to the handler.
 *
 * Useful when you need to combine a role check with a permission check without
 * nesting multiple wrappers.
 *
 * @param guards - Ordered list of guard functions (sync or async).
 * @param handler - Route handler called only when all guards pass.
 *
 * @example
 * import { requireRole, requirePermission } from "@/lib/middleware/permissions";
 *
 * export const PUT = withGuards(
 *   [requireRole("admin"), requirePermission("billing.featureAccess")],
 *   async (req, ctx, session) => { ... }
 * );
 */
export function withGuards<P extends RouteParams = RouteParams>(
  guards: Guard[],
  handler: ProtectedHandler<P>
): (request: NextRequest, context: RouteContext<P>) => Promise<NextResponse> {
  return async (request, context) => {
    try {
      let lastContext: SessionContext | undefined;

      for (const guard of guards) {
        const result = await guard(request);
        if (!result.ok) return result.response;
        lastContext = result.context;
      }

      if (!lastContext) {
        // No guards were provided — deny by default
        return NextResponse.json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "No guards configured",
              userMessage: "Authentication required.",
              retryable: false,
            },
          },
          { status: 401 }
        );
      }

      return await handler(request, context, lastContext);
    } catch (error) {
      const ue = toUserError(error);
      return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
    }
  };
}

// ---------------------------------------------------------------------------
// Common permission pattern shortcuts
// ---------------------------------------------------------------------------

/**
 * Shortcut: requires the caller to be an Owner.
 * Equivalent to `withRole("owner", handler)`.
 *
 * @example
 * export const DELETE = withOwnerOnly(async (req, ctx, session) => { ... });
 */
export function withOwnerOnly<P extends RouteParams = RouteParams>(
  handler: ProtectedHandler<P>
): (request: NextRequest, context: RouteContext<P>) => Promise<NextResponse> {
  return withRole("owner", handler);
}

/**
 * Shortcut: requires the caller to be an Admin or Owner.
 * Equivalent to `withRole("admin", handler)`.
 *
 * @example
 * export const PATCH = withAdminOrAbove(async (req, ctx, session) => { ... });
 */
export function withAdminOrAbove<P extends RouteParams = RouteParams>(
  handler: ProtectedHandler<P>
): (request: NextRequest, context: RouteContext<P>) => Promise<NextResponse> {
  return withRole("admin", handler);
}
