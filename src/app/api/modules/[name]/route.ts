/**
 * PUT    /api/modules/[name]
 * DELETE /api/modules/[name]
 *
 * Endpoints for updating and deregistering modules by their kebab-case slug.
 * Only Owners and Admins may update or delete modules.
 *
 * URL param:
 *   name — kebab-case module identifier (m.module from RegisteredModule)
 *
 * Required headers (injected by Better Auth middleware):
 *   Authorization:      Bearer <token>
 *   x-user-id:          <uuid>
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User
 *
 * PUT request body: ModuleUpdatePayload
 *   { displayName?: string, hasSettings?: boolean, permissions?: Partial<RolePermissions> }
 *
 * PUT returns:    { module: RegisteredModule }  (200)
 * DELETE returns: { success: true }             (200)
 *
 * Error responses:
 *   400 - Invalid JSON body (PUT)
 *   401 - Missing or invalid authentication
 *   403 - User role is not Owner or Admin
 *   404 - Module not found in this organization
 *   422 - Update payload fails validation
 *   500/503 - Unexpected or database error
 *
 * Note: Module scope is enforced by looking up (name, organizationId) together,
 * so cross-organization access is structurally prevented.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ModuleServiceError,
  getModuleByName,
  updateModule,
  deregisterModule,
} from "@/lib/modules/moduleService";
import type { ModuleUpdatePayload } from "@/lib/modules/types";
import {
  UnauthorizedError,
  ForbiddenError,
  UserError,
  UserErrorCode,
  toUserError,
} from "@/lib/errors/user-errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ActorRole = "Owner" | "Admin" | "User";

const VALID_ACTOR_ROLES = new Set<ActorRole>(["Owner", "Admin", "User"]);

function isValidActorRole(role: string | null): role is ActorRole {
  return role !== null && VALID_ACTOR_ROLES.has(role as ActorRole);
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function extractAuth(request: NextRequest) {
  return {
    authHeader: request.headers.get("authorization"),
    actorId: request.headers.get("x-user-id"),
    organizationId: request.headers.get("x-organization-id"),
    rawActorRole: request.headers.get("x-user-role"),
  };
}

/**
 * Validates auth headers and enforces Owner/Admin-only access.
 * Returns the organizationId on success; throws on failure.
 */
function requireOwnerOrAdmin(
  authHeader: string | null,
  actorId: string | null,
  organizationId: string | null,
  rawActorRole: string | null,
  action: string
): string {
  if (!authHeader?.startsWith("Bearer ") || !actorId || !organizationId) {
    throw new UnauthorizedError();
  }

  if (!isValidActorRole(rawActorRole)) {
    throw new UnauthorizedError();
  }

  if (rawActorRole === "User") {
    throw new ForbiddenError(`Only Owners and Admins may ${action} modules.`);
  }

  return organizationId;
}

// ---------------------------------------------------------------------------
// PUT /api/modules/[name]
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: { name: string } }
): Promise<NextResponse> {
  try {
    // ------------------------------------------------------------------
    // Auth
    // ------------------------------------------------------------------
    const { authHeader, actorId, organizationId, rawActorRole } =
      extractAuth(request);
    const orgId = requireOwnerOrAdmin(
      authHeader,
      actorId,
      organizationId,
      rawActorRole,
      "update"
    );

    // ------------------------------------------------------------------
    // Parse body
    // ------------------------------------------------------------------
    let body: ModuleUpdatePayload;
    try {
      body = await request.json();
    } catch {
      throw new UserError({
        code: UserErrorCode.INVALID_REQUEST,
        message: "Invalid JSON body",
        userMessage: "The request body must be valid JSON.",
        httpStatus: 400,
        retryable: false,
      });
    }

    // ------------------------------------------------------------------
    // Fetch module (enforces org scope)
    // ------------------------------------------------------------------
    const supabase = getSupabaseAdmin();
    const { name } = params;

    const currentModule = await getModuleByName(supabase, name, orgId);

    if (!currentModule) {
      throw new UserError({
        code: UserErrorCode.USER_NOT_FOUND,
        message: `Module not found: ${name}`,
        userMessage: "The requested module could not be found.",
        httpStatus: 404,
        retryable: false,
        details: { moduleName: name },
      });
    }

    // ------------------------------------------------------------------
    // Update module
    // ------------------------------------------------------------------
    const updated = await updateModule(supabase, currentModule.id, body);

    return NextResponse.json({ module: updated });
  } catch (error) {
    if (error instanceof ModuleServiceError) {
      if (error.code === "NOT_FOUND") {
        return NextResponse.json(
          {
            error: {
              code: "MODULE_NOT_FOUND",
              message: error.message,
              userMessage: "The requested module could not be found.",
              retryable: false,
            },
          },
          { status: 404 }
        );
      }

      if (error.code === "VALIDATION_ERROR") {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
              userMessage: error.message,
              retryable: false,
            },
          },
          { status: 422 }
        );
      }
    }

    const ue = toUserError(error);

    if (!(error instanceof UserError) && !(error instanceof ModuleServiceError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "modules-name-api",
          event: "put_module_error",
          moduleName: params.name,
          error: ue.message,
        })
      );
    }

    return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/modules/[name]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: { name: string } }
): Promise<NextResponse> {
  try {
    // ------------------------------------------------------------------
    // Auth
    // ------------------------------------------------------------------
    const { authHeader, actorId, organizationId, rawActorRole } =
      extractAuth(request);
    const orgId = requireOwnerOrAdmin(
      authHeader,
      actorId,
      organizationId,
      rawActorRole,
      "deregister"
    );

    // ------------------------------------------------------------------
    // Fetch module (enforces org scope)
    // ------------------------------------------------------------------
    const supabase = getSupabaseAdmin();
    const { name } = params;

    const currentModule = await getModuleByName(supabase, name, orgId);

    if (!currentModule) {
      throw new UserError({
        code: UserErrorCode.USER_NOT_FOUND,
        message: `Module not found: ${name}`,
        userMessage: "The requested module could not be found.",
        httpStatus: 404,
        retryable: false,
        details: { moduleName: name },
      });
    }

    // ------------------------------------------------------------------
    // Deregister module
    // ------------------------------------------------------------------
    await deregisterModule(supabase, currentModule.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ModuleServiceError) {
      if (error.code === "DATABASE_ERROR") {
        return NextResponse.json(
          {
            error: {
              code: "DATABASE_ERROR",
              message: error.message,
              userMessage: "A database error occurred. Please try again.",
              retryable: true,
            },
          },
          { status: 503 }
        );
      }
    }

    const ue = toUserError(error);

    if (!(error instanceof UserError) && !(error instanceof ModuleServiceError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "modules-name-api",
          event: "delete_module_error",
          moduleName: params.name,
          error: ue.message,
        })
      );
    }

    return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
  }
}
