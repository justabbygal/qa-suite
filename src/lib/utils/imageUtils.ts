import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_MB,
  type ImageValidationResult,
} from '@/modules/user-management/types/profile';

export type { ImageValidationResult };

/** Validates a File for use as a profile avatar (type + size checks). */
export function validateImageFile(file: File): ImageValidationResult {
  if (!isAllowedImageType(file.type)) {
    const allowed = ALLOWED_IMAGE_TYPES.map((t) => t.split('/')[1]).join(', ');
    return {
      valid: false,
      error: `Invalid file type. Allowed formats: ${allowed}.`,
    };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds the ${MAX_IMAGE_SIZE_MB} MB limit.`,
    };
  }

  return { valid: true };
}

/** Returns true when the MIME type is in the allowed-image-types list. */
export function isAllowedImageType(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_TYPES)[number]);
}

/** Human-readable file size string (B / KB / MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** Creates an object URL for local preview. Caller must revoke when done. */
export function createImagePreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

/** Revokes an object URL created with createImagePreviewUrl. */
export function revokeImagePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Reads the natural dimensions of an image File without adding it to the DOM.
 * Resolves with { width, height } on success; rejects if the image fails to load.
 */
export function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = createImagePreviewUrl(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      revokeImagePreviewUrl(url);
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
      revokeImagePreviewUrl(url);
    };
    img.src = url;
  });
}
