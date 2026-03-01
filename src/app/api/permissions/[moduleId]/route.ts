/**
 * PATCH /api/permissions/[moduleId]
 *
 * Deep field-level merge of permissions for a single registered module.
 * Only Owners and Admins may update permissions.
 *
 * URL param:
 *   moduleId — UUID of the registered module (m.id from RegisteredModule).
 *
 * Request body:
 *   { permissions: Partial<Record<Role, Partial<PermissionAccess>>> }
 *   e.g. { permissions: { Owner: { featureAccess: true } } }
 *
 * Returns: RegisteredModule (directly, no wrapper)
 *          Shape expected by the usePermissionState hook.
 *
 * Business rules enforced:
 *   - settingsAccess is automatically coerced to false when featureAccess is
 *     false (applied via applyPermissionConstraints).
 *   - The module must belong to the caller's organisation.
 *   - Only Owner and Admin roles may write; User role is rejected with 403.
 *
 * Required headers (injected by Better Auth middleware):
 *   Authorization:      Bearer <token>
 *   x-user-id:          <uuid>
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ModuleServiceError,
  getModule,
  updateModule,
} from "@/lib/modules/moduleService";
import {
  applyPermissionConstraints,
  validatePermissions,
} from "@/lib/modules/permissionGenerator";
import type { Role, RolePermissions } from "@/lib/modules/types";
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
const MODULE_ROLES = new Set<Role>(["Owner", "Admin", "User"]);

function isValidActorRole(role: string | null): role is ActorRole {
  return role !== null && VALID_ACTOR_ROLES.has(role as ActorRole);
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// PATCH /api/permissions/[moduleId]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
): Promise<NextResponse> {
  try {
    // ------------------------------------------------------------------
    // Auth
    // ------------------------------------------------------------------
    const authHeader = request.headers.get("authorization");
    const actorId = request.headers.get("x-user-id");
    const organizationId = request.headers.get("x-organization-id");
    const rawActorRole = request.headers.get("x-user-role");

    if (!authHeader?.startsWith("Bearer ") || !actorId || !organizationId) {
      throw new UnauthorizedError();
    }

    if (!isValidActorRole(rawActorRole)) {
      throw new UnauthorizedError();
    }

    // Only Owner and Admin may modify permissions.
    if (rawActorRole === "User") {
      throw new ForbiddenError("Only Owners and Admins may update permissions.");
    }

    // ------------------------------------------------------------------
    // Parse body
    // ------------------------------------------------------------------
    let body: { permissions?: unknown };
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

    if (
      !body.permissions ||
      typeof body.permissions !== "object" ||
      Array.isArray(body.permissions)
    ) {
      throw new UserError({
        code: UserErrorCode.INVALID_REQUEST,
        message: 'Missing or invalid "permissions" field',
        userMessage:
          'The "permissions" field is required and must be an object.',
        httpStatus: 400,
        retryable: false,
      });
    }

    // ------------------------------------------------------------------
    // Fetch & verify module
    // ------------------------------------------------------------------
    const supabase = getSupabaseAdmin();
    const { moduleId } = params;

    const currentModule = await getModule(supabase, moduleId);

    if (!currentModule) {
      throw new UserError({
        code: UserErrorCode.USER_NOT_FOUND,
        message: `Module not found: ${moduleId}`,
        userMessage: "The requested module could not be found.",
        httpStatus: 404,
        retryable: false,
        details: { moduleId },
      });
    }

    // Scope check — module must belong to the caller's org.
    if (currentModule.organizationId !== organizationId) {
      throw new ForbiddenError(
        "You do not have permission to update this module."
      );
    }

    // ------------------------------------------------------------------
    // Deep field-level merge
    //
    // The hook sends partial payloads like { Owner: { featureAccess: true } }.
    // We must merge at the field level so unspecified fields are preserved.
    // ------------------------------------------------------------------
    const incoming = body.permissions as Record<
      string,
      Partial<{ featureAccess: boolean; settingsAccess: boolean }>
    >;

    const merged: RolePermissions = {
      Owner: { ...currentModule.permissions.Owner },
      Admin: { ...currentModule.permissions.Admin },
      User: { ...currentModule.permissions.User },
    };

    for (const [role, fields] of Object.entries(incoming)) {
      // Ignore unrecognised role keys.
      if (!MODULE_ROLES.has(role as Role)) continue;

      if (typeof fields !== "object" || fields === null) continue;

      merged[role as Role] = {
        ...merged[role as Role],
        ...(typeof fields.featureAccess === "boolean"
          ? { featureAccess: fields.featureAccess }
          : {}),
        ...(typeof fields.settingsAccess === "boolean"
          ? { settingsAccess: fields.settingsAccess }
          : {}),
      };
    }

    // Enforce business rule: settingsAccess must be false when featureAccess
    // is false.
    const constrained = applyPermissionConstraints(merged);

    // Validate the final permission state.
    const validation = validatePermissions(constrained);
    if (!validation.valid) {
      throw new UserError({
        code: UserErrorCode.INVALID_REQUEST,
        message: `Invalid permissions: ${validation.errors.join("; ")}`,
        userMessage: `The permission values are invalid: ${validation.errors.join(", ")}`,
        httpStatus: 422,
        retryable: false,
        details: { errors: validation.errors },
      });
    }

    // ------------------------------------------------------------------
    // Persist
    // ------------------------------------------------------------------
    // Pass the fully merged & constrained permissions so updateModule's
    // shallow merge produces the correct final state.
    const updated = await updateModule(supabase, moduleId, {
      permissions: constrained,
    });

    // Return the updated module directly — no wrapper.
    return NextResponse.json(updated);
  } catch (error) {
    const ue = toUserError(error);

    if (!(error instanceof UserError) && !(error instanceof ModuleServiceError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "permissions-api",
          event: "patch_permissions_error",
          moduleId: params.moduleId,
          error: ue.message,
        })
      );
    }

    // ModuleServiceError NOT_FOUND → 404
    if (error instanceof ModuleServiceError && error.code === "NOT_FOUND") {
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

    return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
  }
}
