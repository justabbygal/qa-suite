/**
 * GET /api/audit/permissions
 *
 * Returns a paginated list of permission audit log entries for an organization.
 * Entries are ordered newest-first.
 *
 * Query parameters:
 *   organizationId  (required) — scopes the log to a single organization.
 *   module          (optional) — filter by module slug.
 *   role            (optional) — filter by role: owner | admin | user.
 *   changedField    (optional) — filter by field: feature_access | settings_access.
 *   actorId         (optional) — filter by actor user ID.
 *   dateFrom        (optional) — ISO 8601 start of date range (inclusive).
 *   dateTo          (optional) — ISO 8601 end of date range (inclusive).
 *   page            (optional) — 1-based page number (default: 1).
 *   pageSize        (optional) — rows per page, max 100 (default: 50).
 *
 * Authorization:
 *   Owner and Admin roles may read the audit log.
 *   User role is rejected with 403.
 *
 * Required headers (injected by Better Auth middleware):
 *   Authorization:      Bearer <token>
 *   x-user-id:          <uuid>
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPermissionAuditLog } from "@/lib/models/permissions";
import type {
  PermissionAuditLogFilters,
  PermissionLevel,
  PermissionRole,
} from "@/lib/types/permissions";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

const VALID_ROLES = new Set<PermissionRole>(["owner", "admin", "user"]);
const VALID_FIELDS = new Set<PermissionLevel>([
  "feature_access",
  "settings_access",
]);

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ------------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------------
  const authHeader = request.headers.get("authorization");
  const actorId = request.headers.get("x-user-id");
  const orgFromHeader = request.headers.get("x-organization-id");
  const actorRole = request.headers.get("x-user-role");

  if (!authHeader?.startsWith("Bearer ") || !actorId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 }
    );
  }

  // User role cannot read audit logs.
  if (actorRole === "User") {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Only Owners and Admins may view the audit log.",
        },
      },
      { status: 403 }
    );
  }

  // ------------------------------------------------------------------
  // Parse query params
  // ------------------------------------------------------------------
  const { searchParams } = request.nextUrl;

  const organizationId =
    searchParams.get("organizationId") ?? orgFromHeader ?? "";

  if (!organizationId) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "organizationId is required.",
        },
      },
      { status: 400 }
    );
  }

  const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
  const rawPageSize = parseInt(
    searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE),
    10
  );

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const rawRole = searchParams.get("role");
  const rawField = searchParams.get("changedField");

  const filters: PermissionAuditLogFilters = {};

  if (searchParams.has("module")) {
    filters.module = searchParams.get("module") ?? undefined;
  }
  if (rawRole && VALID_ROLES.has(rawRole as PermissionRole)) {
    filters.role = rawRole as PermissionRole;
  }
  if (rawField && VALID_FIELDS.has(rawField as PermissionLevel)) {
    filters.changedField = rawField as PermissionLevel;
  }
  if (searchParams.has("actorId")) {
    filters.actorId = searchParams.get("actorId") ?? undefined;
  }
  if (searchParams.has("dateFrom")) {
    filters.dateFrom = searchParams.get("dateFrom") ?? undefined;
  }
  if (searchParams.has("dateTo")) {
    filters.dateTo = searchParams.get("dateTo") ?? undefined;
  }

  // ------------------------------------------------------------------
  // Query
  // ------------------------------------------------------------------
  try {
    const supabase = getSupabaseAdmin();
    const result = await getPermissionAuditLog(supabase, organizationId, filters, {
      page,
      pageSize,
    });

    return NextResponse.json({
      data: result.data,
      total: result.total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: "audit-permissions-api",
        event: "fetch_error",
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      })
    );

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch audit log.",
        },
      },
      { status: 500 }
    );
  }
}
