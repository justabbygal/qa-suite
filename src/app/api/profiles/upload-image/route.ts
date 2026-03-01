/**
 * POST /api/profiles/upload-image
 *
 * Accepts multipart/form-data with:
 *   image     - Blob   (required) Main profile image, max 5 MB.
 *   thumbnail - Blob   (optional) Square thumbnail.
 *   userId    - string (required) ID of the user whose avatar is being updated.
 *
 * Required headers (injected by Better Auth middleware):
 *   Authorization:      Bearer <token>
 *   x-user-id:          <uuid>  (the actor performing the upload)
 *   x-organization-id:  <uuid>
 *   x-user-role:        Owner | Admin | User
 *
 * Permissions:
 *   Owner / Admin - may update any user's avatar.
 *   User          - may only update their own avatar.
 *
 * On success:
 *   - Uploads image and thumbnail to Supabase Storage.
 *   - Updates avatar_url in the profiles table.
 *   - Deletes the previous avatar files (best-effort).
 *   - Returns { data: { avatarUrl, thumbnailUrl } }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  validateImageBuffer,
  UPLOAD_ALLOWED_FORMATS,
  UPLOAD_MAX_SIZE_MB,
} from '@/lib/validation/imageValidation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserRole = 'Owner' | 'Admin' | 'User';

// ---------------------------------------------------------------------------
// Error response helper
// ---------------------------------------------------------------------------

function errorResponse(
  code: string,
  userMessage: string,
  httpStatus: number,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message: userMessage,
        userMessage,
        retryable: httpStatus >= 500,
        ...(details && { details }),
      },
    },
    { status: httpStatus },
  );
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set<UserRole>(['Owner', 'Admin', 'User']);

function isValidRole(role: string | null): role is UserRole {
  return role !== null && VALID_ROLES.has(role as UserRole);
}

function canManageAvatar(actorId: string, actorRole: UserRole, targetUserId: string): boolean {
  if (actorRole === 'Owner' || actorRole === 'Admin') return true;
  return actorId === targetUserId;
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
// Storage helpers
// ---------------------------------------------------------------------------

const AVATAR_BUCKET = 'avatars';

function mainAvatarPath(organizationId: string, userId: string, ext: string): string {
  return `${organizationId}/${userId}/avatar-${Date.now()}.${ext}`;
}

function thumbAvatarPath(organizationId: string, userId: string): string {
  return `${organizationId}/${userId}/avatar-thumb-${Date.now()}.webp`;
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[mimeType] ?? 'jpg';
}

function storagePathFromUrl(url: string): string | null {
  const marker = `/${AVATAR_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

// ---------------------------------------------------------------------------
// Old-image cleanup (best-effort)
// ---------------------------------------------------------------------------

async function deleteOldAvatars(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  userId: string,
  currentAvatarUrl: string | null,
): Promise<void> {
  if (!currentAvatarUrl) return;

  const mainPath = storagePathFromUrl(currentAvatarUrl);
  if (!mainPath) return;

  const prefix = `${organizationId}/${userId}/`;
  const filename = mainPath.startsWith(prefix) ? mainPath.slice(prefix.length) : '';
  const thumbFilename = filename.replace(/^avatar-(\d+)\.\w+$/, 'avatar-thumb-$1.webp');
  const thumbPath =
    thumbFilename && thumbFilename !== filename ? `${prefix}${thumbFilename}` : null;

  const pathsToDelete = [mainPath, ...(thumbPath ? [thumbPath] : [])];

  await supabase.storage
    .from(AVATAR_BUCKET)
    .remove(pathsToDelete)
    .catch((err: unknown) =>
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: 'upload-image-api',
          event: 'old_avatar_delete_failed',
          userId,
          error: err instanceof Error ? err.message : String(err),
        }),
      ),
    );
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth
  const authHeader = request.headers.get('authorization');
  const actorId = request.headers.get('x-user-id');
  const organizationId = request.headers.get('x-organization-id');
  const rawRole = request.headers.get('x-user-role');

  if (!authHeader?.startsWith('Bearer ') || !actorId || !organizationId) {
    return errorResponse('UNAUTHORIZED', 'You must be signed in to upload a profile image.', 401);
  }

  if (!isValidRole(rawRole)) {
    return errorResponse('UNAUTHORIZED', 'Your session is invalid. Please sign in again.', 401);
  }

  const actorRole = rawRole;

  // Parse form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('INVALID_REQUEST', 'The request body could not be parsed.', 400);
  }

  const imageFile = formData.get('image');
  const thumbnailFile = formData.get('thumbnail');
  const userId = formData.get('userId');

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return errorResponse('INVALID_REQUEST', 'A userId is required.', 400);
  }

  if (!imageFile || !(imageFile instanceof Blob)) {
    return errorResponse('INVALID_REQUEST', 'An image file is required.', 400);
  }

  // Authorization
  if (!canManageAvatar(actorId, actorRole, userId)) {
    return errorResponse(
      'FORBIDDEN',
      "You do not have permission to update this user's profile image.",
      403,
    );
  }

  // Server-side validation: main image
  const imageBuffer = await imageFile.arrayBuffer();
  const imageContentType = imageFile instanceof File ? imageFile.type : '';
  const imageValidation = validateImageBuffer(imageBuffer, imageContentType);

  if (!imageValidation.valid) {
    const { code, message } = imageValidation.error!;
    return errorResponse(code, message, code === 'FILE_TOO_LARGE' ? 413 : 422, {
      field: 'image',
      allowedFormats: UPLOAD_ALLOWED_FORMATS,
      maxSizeMb: UPLOAD_MAX_SIZE_MB,
    });
  }

  // Server-side validation: thumbnail (optional, non-fatal on failure)
  let thumbBuffer: ArrayBuffer | null = null;
  let thumbContentType = 'image/webp';

  if (thumbnailFile && thumbnailFile instanceof Blob) {
    const buf = await thumbnailFile.arrayBuffer();
    const ct = thumbnailFile instanceof File ? thumbnailFile.type : 'image/webp';
    const thumbValidation = validateImageBuffer(buf, ct);
    if (thumbValidation.valid) {
      thumbBuffer = buf;
      thumbContentType = ct;
    } else {
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: 'upload-image-api',
          event: 'thumbnail_validation_failed',
          userId,
          error: thumbValidation.error?.message,
        }),
      );
    }
  }

  const supabase = getSupabaseAdmin();

  // Fetch current avatar URL for later cleanup
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  const currentAvatarUrl: string | null = profileRow?.avatar_url ?? null;

  // Upload main image
  const mainMime = imageContentType.split(';')[0].trim().toLowerCase() || 'image/jpeg';
  const mainExt = mimeToExt(mainMime);
  const mainStoragePath = mainAvatarPath(organizationId, userId, mainExt);

  const { error: mainUploadErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(mainStoragePath, imageBuffer, {
      contentType: mainMime,
      upsert: false,
    });

  if (mainUploadErr) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: 'upload-image-api',
        event: 'main_image_upload_failed',
        userId,
        error: mainUploadErr.message,
      }),
    );
    return errorResponse('STORAGE_ERROR', 'Failed to save your image. Please try again.', 503);
  }

  const {
    data: { publicUrl: avatarUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(mainStoragePath);

  // Upload thumbnail (optional, non-fatal)
  let thumbnailUrl = avatarUrl;

  if (thumbBuffer) {
    const thumbStoragePath = thumbAvatarPath(organizationId, userId);
    const { error: thumbUploadErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(thumbStoragePath, thumbBuffer, {
        contentType: thumbContentType,
        upsert: false,
      });

    if (thumbUploadErr) {
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          service: 'upload-image-api',
          event: 'thumbnail_upload_failed',
          userId,
          error: thumbUploadErr.message,
        }),
      );
    } else {
      const {
        data: { publicUrl },
      } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(thumbStoragePath);
      thumbnailUrl = publicUrl;
    }
  }

  // Update profile record
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('organization_id', organizationId);

  if (updateErr) {
    await supabase.storage.from(AVATAR_BUCKET).remove([mainStoragePath]).catch(() => {});
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: 'upload-image-api',
        event: 'profile_update_failed',
        userId,
        error: updateErr.message,
      }),
    );
    return errorResponse(
      'DATABASE_ERROR',
      'Your image was uploaded but we could not update your profile. Please try again.',
      503,
    );
  }

  // Delete old avatar files (best-effort)
  await deleteOldAvatars(supabase, organizationId, userId, currentAvatarUrl);

  return NextResponse.json({ data: { avatarUrl, thumbnailUrl } });
}
