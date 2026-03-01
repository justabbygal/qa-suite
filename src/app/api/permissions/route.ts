/**
 * GET /api/permissions
 *
 * Returns all registered modules with their permissions for the caller's
 * organisation. Any authenticated user may read permissions.
 *
 * Query params:
 *   organizationId — used as a fallback when the x-organization-id header is
 *                    absent (e.g. during development before Better Auth
 *                    middleware is fully wired up).
 *
 * Returns: RegisteredModule[] (array, no wrapper)
 *          Shape expected by the usePermissionState hook.
 *
 * Required headers (injected by Better Auth middleware):
 *   Authorization:      Bearer <token>
 *   x-user-id:          <uuid>
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getModules } from "@/lib/modules/moduleService";
import {
  UnauthorizedError,
  UserError,
  toUserError,
} from "@/lib/errors/user-errors";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const actorId = request.headers.get("x-user-id");

    // Accept organization ID from either the auth-middleware header or the
    // query param (the hook passes it as a query param for dev convenience).
    const organizationId =
      request.headers.get("x-organization-id") ??
      new URL(request.url).searchParams.get("organizationId");

    if (!authHeader?.startsWith("Bearer ") || !actorId || !organizationId) {
      throw new UnauthorizedError();
    }

    const supabase = getSupabaseAdmin();
    const modules = await getModules(supabase, organizationId);

    // Return the array directly — the hook expects RegisteredModule[], not a
    // wrapped { modules: [...] } object.
    return NextResponse.json(modules);
  } catch (error) {
    const ue = toUserError(error);

    if (!(error instanceof UserError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "permissions-api",
          event: "get_permissions_error",
          error: ue.message,
        })
      );
    }

    return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
  }
}
