/**
 * POST /api/modules/register
 *
 * Registers a new module with its manifest for an organization.
 * Only Owners and Admins may register modules.
 *
 * Required headers (injected by Better Auth middleware):
 *   Authorization:      Bearer <token>
 *   x-user-id:          <uuid>
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User
 *
 * Request body:
 *   { manifest: ModuleManifest }
 *
 * Returns: { module: RegisteredModule }  (201)
 *
 * Error responses:
 *   400 - Invalid JSON body or missing manifest
 *   401 - Missing or invalid authentication
 *   403 - User role is not Owner or Admin
 *   409 - Module already registered for this organization
 *   422 - Manifest fails validation (field-level errors included)
 *   503 - Database error
 *   500 - Unexpected error
 *
 * Note: Organization scope is enforced via the x-organization-id header, so
 * cross-organization registration is structurally prevented.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ModuleServiceError, registerModule } from "@/lib/modules/moduleService";
import {
  UnauthorizedError,
  ForbiddenError,
  UserError,
  UserErrorCode,
  toUserError,
} from "@/lib/errors/user-errors";
import {
  validateModuleManifest,
  formatZodErrors,
} from "@/lib/validations/module-manifest";

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
 * Validates auth headers and enforces Owner-or-Admin gate.
 * Returns the verified organizationId on success, throws on failure.
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
// POST /api/modules/register
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
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
      "register"
    );

    // ------------------------------------------------------------------
    // Parse body
    // ------------------------------------------------------------------
    let body: unknown;
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

    const { manifest } = (body ?? {}) as { manifest?: unknown };

    if (!manifest) {
      throw new UserError({
        code: UserErrorCode.INVALID_REQUEST,
        message: "manifest is required",
        userMessage: "A module manifest is required in the request body.",
        httpStatus: 400,
        retryable: false,
      });
    }

    // ------------------------------------------------------------------
    // Validate manifest
    // ------------------------------------------------------------------
    const validation = validateModuleManifest(manifest);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Manifest validation failed",
            userMessage: "The module manifest contains invalid fields.",
            errors: formatZodErrors(validation.error),
            retryable: false,
          },
        },
        { status: 422 }
      );
    }

    // ------------------------------------------------------------------
    // Register module
    // ------------------------------------------------------------------
    const supabase = getSupabaseAdmin();
    const module = await registerModule(supabase, validation.data, orgId);

    return NextResponse.json({ module }, { status: 201 });
  } catch (error) {
    if (error instanceof ModuleServiceError) {
      if (error.code === "DUPLICATE") {
        return NextResponse.json(
          {
            error: {
              code: "DUPLICATE_MODULE",
              message: error.message,
              userMessage:
                "This module is already registered for your organization.",
              retryable: false,
            },
          },
          { status: 409 }
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
          service: "modules-register-api",
          event: "post_register_error",
          error: ue.message,
        })
      );
    }

    return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
  }
}
