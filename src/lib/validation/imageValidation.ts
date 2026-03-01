/**
 * Image upload validation rules shared between client and server.
 *
 * Client usage: call `validateImageFile(file)` before processing/uploading.
 * Server usage: call `validateImageBuffer(buffer, contentType)` as a backup check.
 *
 * Allowed formats: JPEG, PNG, WebP (not GIF).
 * Max size: 5 MB.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** MIME types accepted for profile image uploads. */
export const UPLOAD_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof UPLOAD_ALLOWED_MIME_TYPES)[number];

/** Human-readable format list for error messages. */
export const UPLOAD_ALLOWED_FORMATS = UPLOAD_ALLOWED_MIME_TYPES.map((t) =>
  t.replace('image/', '').toUpperCase(),
).join(', ');

/** Maximum upload size in bytes (5 MB). */
export const UPLOAD_MAX_SIZE_BYTES = 5 * 1024 * 1024;

/** Maximum upload size in megabytes (for messages). */
export const UPLOAD_MAX_SIZE_MB = 5;

/** Maximum dimension (width or height) after resize, in pixels. */
export const UPLOAD_MAX_DIMENSION_PX = 400;

/** Thumbnail square size in pixels. */
export const UPLOAD_THUMBNAIL_SIZE_PX = 80;

/** Files larger than this threshold should show an upload progress indicator. */
export const UPLOAD_PROGRESS_THRESHOLD_BYTES = 1 * 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ImageValidationErrorCode =
  | 'MISSING_FILE'
  | 'INVALID_TYPE'
  | 'FILE_TOO_LARGE';

export interface ImageValidationError {
  code: ImageValidationErrorCode;
  /** User-facing message safe to display in the UI. */
  message: string;
}

export interface ImageValidationResult {
  valid: boolean;
  error?: ImageValidationError;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/** Returns true when `mimeType` is in the allowed list. */
export function isAllowedMimeType(mimeType: string): mimeType is AllowedImageMimeType {
  return UPLOAD_ALLOWED_MIME_TYPES.includes(mimeType as AllowedImageMimeType);
}

/** Returns true when `bytes` is within the per-file size limit. */
export function isWithinSizeLimit(bytes: number): boolean {
  return bytes > 0 && bytes <= UPLOAD_MAX_SIZE_BYTES;
}

/** Returns true when a file of `bytes` should show a progress indicator. */
export function requiresProgressIndicator(bytes: number): boolean {
  return bytes > UPLOAD_PROGRESS_THRESHOLD_BYTES;
}

/** Human-readable file size string (B / KB / MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Client-side validation (File object)
// ---------------------------------------------------------------------------

/**
 * Validates a File object before processing or uploading.
 * Checks MIME type first, then file size.
 *
 * @example
 * const result = validateImageFile(file);
 * if (!result.valid) toast.error(result.error!.message);
 */
export function validateImageFile(file: File): ImageValidationResult {
  if (!isAllowedMimeType(file.type)) {
    const detected = file.type || 'unknown';
    return {
      valid: false,
      error: {
        code: 'INVALID_TYPE',
        message: `"${detected}" is not a supported image format. Please use ${UPLOAD_ALLOWED_FORMATS}.`,
      },
    };
  }

  if (!isWithinSizeLimit(file.size)) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `Your image (${sizeMb} MB) exceeds the ${UPLOAD_MAX_SIZE_MB} MB limit. Please choose a smaller file.`,
      },
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Server-side validation (ArrayBuffer / content-type header)
// ---------------------------------------------------------------------------

/**
 * Validates an uploaded image on the server using the declared content-type
 * and the raw buffer length. This is a backup check; the client should have
 * already validated before uploading.
 *
 * @param buffer   - Raw image bytes from the incoming request.
 * @param contentType - Value of the Content-Type / MIME type for the part.
 */
export function validateImageBuffer(
  buffer: ArrayBuffer,
  contentType: string,
): ImageValidationResult {
  // Strip parameters (e.g. "image/jpeg; name=photo.jpg" → "image/jpeg")
  const mimeType = contentType.split(';')[0].trim().toLowerCase();

  if (!isAllowedMimeType(mimeType)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_TYPE',
        message: `"${mimeType || 'unknown'}" is not an accepted format. Accepted: ${UPLOAD_ALLOWED_FORMATS}.`,
      },
    };
  }

  if (!isWithinSizeLimit(buffer.byteLength)) {
    const sizeMb = (buffer.byteLength / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `File size (${sizeMb} MB) exceeds the ${UPLOAD_MAX_SIZE_MB} MB server limit.`,
      },
    };
  }

  return { valid: true };
}
