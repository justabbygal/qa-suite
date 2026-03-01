/**
 * Profile update API route.
 *
 * PATCH /api/profiles/[id]
 *
 * Handles two kinds of update in a single endpoint:
 *   - Profile fields (display_name, bio, job_title, department, phone, timezone)
 *   - Email address change (Owner only, always audit-logged)
 *
 * Required headers (injected by Better Auth middleware in production;
 * passed manually by the client in development):
 *   x-user-id:          <uuid>   — the actor performing the update
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User
 *
 * Permission rules:
 *   - Owner can update any user's profile fields and email.
 *   - Admin can update any user's profile fields (email is forbidden).
 *   - User can only update their own profile fields (email is forbidden).
 *
 * Returns the full updated UserProfile on success.
 * Returns { error: { code, userMessage } } on failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logAuditEvent, buildChangesMap } from '@/lib/audit/logger';
import type { UserProfile, ProfileUpdateData } from '@/modules/user-management/types/profile';
import {
  PROFILE_DISPLAY_NAME_MIN_LENGTH,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_PHONE_REGEX,
} from '@/modules/user-management/types/profile';

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

type ActorRole = 'Owner' | 'Admin' | 'User';
const VALID_ROLES = new Set<ActorRole>(['Owner', 'Admin', 'User']);

function isValidRole(role: string | null): role is ActorRole {
  return role !== null && VALID_ROLES.has(role as ActorRole);
}

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationError {
  field: string;
  message: string;
}

function validateProfileFields(data: ProfileUpdateData): ValidationError[] {
  const errors: ValidationError[] = [];

  if (data.display_name !== undefined) {
    const name = data.display_name.trim();
    if (name.length < PROFILE_DISPLAY_NAME_MIN_LENGTH) {
      errors.push({
        field: 'display_name',
        message: `Display name must be at least ${PROFILE_DISPLAY_NAME_MIN_LENGTH} characters`,
      });
    } else if (name.length > PROFILE_DISPLAY_NAME_MAX_LENGTH) {
      errors.push({
        field: 'display_name',
        message: `Display name must not exceed ${PROFILE_DISPLAY_NAME_MAX_LENGTH} characters`,
      });
    }
  }

  if (data.bio && data.bio.length > PROFILE_BIO_MAX_LENGTH) {
    errors.push({
      field: 'bio',
      message: `Bio must not exceed ${PROFILE_BIO_MAX_LENGTH} characters`,
    });
  }

  if (data.phone && data.phone.trim() !== '' && !PROFILE_PHONE_REGEX.test(data.phone)) {
    errors.push({ field: 'phone', message: 'Invalid phone number format' });
  }

  return errors;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function errorResponse(
  code: string,
  userMessage: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: { code, userMessage } }, { status });
}

// ---------------------------------------------------------------------------
// PATCH /api/profiles/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // -- Auth headers --
  const actorId = request.headers.get('x-user-id');
  const organizationId = request.headers.get('x-organization-id');
  const rawActorRole = request.headers.get('x-user-role');

  if (!actorId || !organizationId) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }
  if (!isValidRole(rawActorRole)) {
    return errorResponse('UNAUTHORIZED', 'Unrecognised role header', 401);
  }

  const actorRole = rawActorRole;
  const profileId = params.id;

  // -- Parse body --
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse('INVALID_REQUEST', 'Request body must be valid JSON', 400);
  }

  const supabase = getSupabaseAdmin();

  // -- Fetch the target profile --
  const { data: targetProfile, error: fetchErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (fetchErr) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: 'profiles-api',
        event: 'fetch_profile_failed',
        profileId,
        error: fetchErr.message,
      }),
    );
    return errorResponse('DATABASE_ERROR', 'Failed to fetch profile', 500);
  }

  if (!targetProfile) {
    return errorResponse('NOT_FOUND', 'Profile not found', 404);
  }

  const target = targetProfile as UserProfile;

  // -- Permission: Users can only edit their own profile --
  const isOwnProfile = actorId === target.user_id;
  if (actorRole === 'User' && !isOwnProfile) {
    return errorResponse('FORBIDDEN', 'You can only edit your own profile', 403);
  }

  // -------------------------------------------------------------------------
  // Branch A: email change
  // -------------------------------------------------------------------------

  if ('email' in body) {
    // Only Owners can change email
    if (actorRole !== 'Owner') {
      return errorResponse(
        'FORBIDDEN',
        'Only Owners can change a user\u2019s email address',
        403,
      );
    }

    const newEmail = typeof body.email === 'string' ? body.email.trim() : '';
    if (!isValidEmail(newEmail)) {
      return errorResponse('INVALID_REQUEST', 'Please enter a valid email address', 400);
    }

    if (newEmail === target.email) {
      return errorResponse(
        'INVALID_REQUEST',
        'The new email address must differ from the current one',
        400,
      );
    }

    const { data: updated, error: updateErr } = await supabase
      .from('profiles')
      .update({ email: newEmail, updated_at: new Date().toISOString() })
      .eq('id', profileId)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (updateErr) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: 'profiles-api',
          event: 'update_email_failed',
          profileId,
          error: updateErr.message,
        }),
      );
      return errorResponse('DATABASE_ERROR', 'Failed to update email address', 500);
    }

    // Audit log — email changes are always recorded
    await logAuditEvent({
      organization_id: organizationId,
      actor_id: actorId,
      actor_email: '', // TODO: populate from Better Auth session
      actor_name: '',  // TODO: populate from Better Auth session
      action: 'profile.email_updated',
      resource_type: 'profile',
      resource_id: profileId,
      resource_name: target.display_name,
      changes: buildChangesMap(
        { email: target.email },
        { email: newEmail },
      ),
      ip_address: request.headers.get('x-forwarded-for') ?? null,
      user_agent: request.headers.get('user-agent') ?? null,
    });

    return NextResponse.json(updated);
  }

  // -------------------------------------------------------------------------
  // Branch B: profile fields update
  // -------------------------------------------------------------------------

  const ALLOWED_FIELDS: Array<keyof ProfileUpdateData> = [
    'display_name',
    'bio',
    'job_title',
    'department',
    'phone',
    'timezone',
  ];

  // Only extract recognised, allowed fields from the body
  const updateData: ProfileUpdateData = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      (updateData as Record<string, unknown>)[field] = body[field] ?? null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return errorResponse('INVALID_REQUEST', 'No updatable fields provided', 400);
  }

  const validationErrors = validateProfileFields(updateData);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', userMessage: validationErrors[0].message, details: { fields: validationErrors } } },
      { status: 400 },
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from('profiles')
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (updateErr) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: 'profiles-api',
        event: 'update_profile_failed',
        profileId,
        error: updateErr.message,
      }),
    );
    return errorResponse('DATABASE_ERROR', 'Failed to update profile', 500);
  }

  return NextResponse.json(updated);
}
