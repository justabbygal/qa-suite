/**
 * POST /api/modules/register
 *
 * Registers a new module with its manifest and default permissions.
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
 * Returns: { module: RegisteredModule } (201)
 *
 * Error responses:
 *   400 - Missing/invalid request body or manifest
 *   401 - Missing or invalid authentication
 *   403 - User role is not Owner or Admin
 *   409 - Module with the same identifier is already registered for this org
 *   422 - Manifest fails validation (bad module ID format, missing fields, etc.)
 *   500 - Unexpected server error
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ModuleServiceError,
  registerModule,
} from "@/lib/modules/moduleService";
import type { ModuleManifest } from "@/lib/modules/types";
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

// ---------------------------------------------------------------------------
// POST /api/modules/register
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    // Only Owner and Admin may register modules.
    if (rawActorRole === "User") {
      throw new ForbiddenError("Only Owners and Admins may register modules.");
    }

    // ------------------------------------------------------------------
    // Parse body
    // ------------------------------------------------------------------
    let body: { manifest?: unknown };
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
      !body.manifest ||
      typeof body.manifest !== "object" ||
      Array.isArray(body.manifest)
    ) {
      throw new UserError({
        code: UserErrorCode.INVALID_REQUEST,
        message: 'Missing or invalid "manifest" field',
        userMessage:
          'The "manifest" field is required and must be an object.',
        httpStatus: 400,
        retryable: false,
      });
    }

    // ------------------------------------------------------------------
    // Register module
    // ------------------------------------------------------------------
    const supabase = getSupabaseAdmin();
    const module = await registerModule(
      supabase,
      body.manifest as ModuleManifest,
      organizationId
    );

    return NextResponse.json({ module }, { status: 201 });
  } catch (error) {
    // ModuleServiceError: surface validation and duplicate errors directly.
    if (error instanceof ModuleServiceError) {
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

      if (error.code === "DUPLICATE") {
        return NextResponse.json(
          {
            error: {
              code: "DUPLICATE_MODULE",
              message: error.message,
              userMessage: error.message,
              retryable: false,
            },
          },
          { status: 409 }
        );
      }
    }

    const ue = toUserError(error);

    if (!(error instanceof UserError) && !(error instanceof ModuleServiceError)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: "modules-register-api",
          event: "register_module_error",
          error: ue.message,
        })
      );
    }

    return NextResponse.json(ue.toApiResponse(), { status: ue.httpStatus });
  }
}
