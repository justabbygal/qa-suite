import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_MB,
  type ImageValidationResult,
} from '../types/profile';

/**
 * Validates a File object for use as a profile avatar.
 * Checks MIME type and file size in order; returns the first failure found.
 */
export function validateImageFile(file: File): ImageValidationResult {
  if (!isAllowedImageType(file.type)) {
    const allowed = ALLOWED_IMAGE_TYPES.map((t) => t.split('/')[1]).join(', ');
    return {
      valid: false,
      error: `Invalid file type "${file.type}". Allowed types: ${allowed}`,
    };
  }

  if (!isFileSizeValid(file.size)) {
    return {
      valid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds the ${MAX_IMAGE_SIZE_MB} MB limit`,
    };
  }

  return { valid: true };
}

/** Returns true when the MIME type is in the allowed-image-types list. */
export function isAllowedImageType(
  mimeType: string,
): mimeType is (typeof ALLOWED_IMAGE_TYPES)[number] {
  return ALLOWED_IMAGE_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_TYPES)[number]);
}

/** Returns true when the file size is within the per-file limit. */
export function isFileSizeValid(bytes: number): boolean {
  return bytes <= MAX_IMAGE_SIZE_BYTES;
}

/** Maps a MIME type to the preferred file extension. Defaults to 'jpg'. */
export function getFileExtension(mimeType: string): string {
  const typeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return typeMap[mimeType] ?? 'jpg';
}

/**
 * Generates a deterministic storage path for an avatar file.
 * Format: `{organizationId}/{userId}/avatar-{timestamp}.{ext}`
 */
export function generateAvatarPath(
  organizationId: string,
  userId: string,
  mimeType: string,
  timestamp = Date.now(),
): string {
  const ext = getFileExtension(mimeType);
  return `${organizationId}/${userId}/avatar-${timestamp}.${ext}`;
}

/** Human-readable file size string (B / KB / MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
