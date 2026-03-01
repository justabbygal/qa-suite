/**
 * Client-side image processing utilities.
 *
 * These functions use the Canvas API and must only be called in browser
 * environments (inside React components, event handlers, or hooks).
 * They will throw if called during server-side rendering.
 *
 * Typical flow:
 *   1. User selects a file via <input type="file" />.
 *   2. Call `validateImageFile(file)` from imageValidation.ts.
 *   3. Call `processProfileImage(file)` to resize + compress + generate thumbnail.
 *   4. Upload `main` and `thumbnail` blobs to POST /api/profiles/upload-image.
 *      For files > 1 MB, use `uploadWithProgress` to show a progress indicator.
 */

import {
  UPLOAD_MAX_DIMENSION_PX,
  UPLOAD_THUMBNAIL_SIZE_PX,
  requiresProgressIndicator,
} from '../validation/imageValidation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessedImage {
  /** Resized and compressed main image, max 400 × 400 px. */
  main: Blob;
  /** Square center-cropped thumbnail, 80 × 80 px. */
  thumbnail: Blob;
  /** MIME type of the output blobs. */
  mimeType: 'image/webp' | 'image/jpeg' | 'image/png';
  /** Actual width of the main image after resize. */
  width: number;
  /** Actual height of the main image after resize. */
  height: number;
}

export interface UploadProgressEvent {
  /** Bytes uploaded so far. */
  loaded: number;
  /** Total bytes to upload. */
  total: number;
  /** Integer 0–100. */
  percentage: number;
}

export interface UploadImageResponse {
  avatarUrl: string;
  thumbnailUrl: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Loads a File/Blob into an HTMLImageElement. Revokes the object URL after load. */
function loadImage(source: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(source);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image. The file may be corrupt or unsupported.'));
    };
    img.src = objectUrl;
  });
}

/** Converts a canvas to a Blob with the given MIME type and quality. */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`canvas.toBlob returned null for type "${mimeType}"`));
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Calculates the output dimensions that fit within `maxDimension` on each
 * axis while preserving the original aspect ratio. Returns the original
 * dimensions unchanged if the image is already small enough.
 */
function fitDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const scale = Math.min(maxDimension / width, maxDimension / height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/** Draws `img` onto a new canvas at the given dimensions and returns it. */
function drawToCanvas(
  img: HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not obtain a 2D canvas context.');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/**
 * Selects the output MIME type for a source image.
 * PNG sources stay as PNG to preserve transparency.
 * Everything else is encoded as WebP (with JPEG as an automatic fallback
 * when `canvasToBlob` does not support WebP in the current browser).
 */
function chooseOutputMime(sourceMime: string): 'image/webp' | 'image/png' {
  return sourceMime === 'image/png' ? 'image/png' : 'image/webp';
}

// ---------------------------------------------------------------------------
// Public API: individual operations
// ---------------------------------------------------------------------------

/**
 * Resizes an image to fit within `maxDimension × maxDimension` pixels while
 * preserving its aspect ratio, then compresses it.
 *
 * @param file        - Source image File.
 * @param maxDimension - Maximum width or height in pixels (default: 400).
 * @param quality      - Encoder quality 0–1 (default: 0.85).
 * @returns Compressed Blob in WebP (or PNG for PNG sources).
 */
export async function resizeImage(
  file: File,
  maxDimension = UPLOAD_MAX_DIMENSION_PX,
  quality = 0.85,
): Promise<Blob> {
  const img = await loadImage(file);
  const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight, maxDimension);
  const canvas = drawToCanvas(img, width, height);
  const mimeType = chooseOutputMime(file.type);
  // Fall back to JPEG if the browser does not support the preferred type
  return canvasToBlob(canvas, mimeType, quality).catch(() =>
    canvasToBlob(canvas, 'image/jpeg', quality),
  );
}

/**
 * Generates a square thumbnail by center-cropping then scaling the image.
 *
 * @param file    - Source image File.
 * @param size    - Output size in pixels (default: 80).
 * @param quality - Encoder quality 0–1 (default: 0.8).
 * @returns Compressed square Blob in WebP (fallback: JPEG).
 */
export async function generateThumbnail(
  file: File,
  size = UPLOAD_THUMBNAIL_SIZE_PX,
  quality = 0.8,
): Promise<Blob> {
  const img = await loadImage(file);
  const { naturalWidth: w, naturalHeight: h } = img;
  // Center crop: take the largest centered square
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not obtain a 2D canvas context.');
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

  return canvasToBlob(canvas, 'image/webp', quality).catch(() =>
    canvasToBlob(canvas, 'image/jpeg', quality),
  );
}

// ---------------------------------------------------------------------------
// Public API: combined profile image processing
// ---------------------------------------------------------------------------

/**
 * Processes a profile image in a single pass:
 *   1. Resizes the main image to fit within 400 × 400 px.
 *   2. Generates an 80 × 80 square thumbnail via center crop.
 *
 * Both blobs are ready to append to a FormData for upload.
 *
 * @param file - Source image selected by the user.
 * @returns ProcessedImage with `main`, `thumbnail`, and dimension metadata.
 *
 * @example
 * const processed = await processProfileImage(file);
 * const form = new FormData();
 * form.append('image', processed.main, `avatar.${processed.mimeType.split('/')[1]}`);
 * form.append('thumbnail', processed.thumbnail, 'avatar-thumb.webp');
 */
export async function processProfileImage(file: File): Promise<ProcessedImage> {
  const img = await loadImage(file);
  const { naturalWidth: origW, naturalHeight: origH } = img;

  // --- Main image (resize to fit 400×400) ---
  const { width, height } = fitDimensions(origW, origH, UPLOAD_MAX_DIMENSION_PX);
  const mainCanvas = drawToCanvas(img, width, height);
  const outputMime = chooseOutputMime(file.type);
  const main = await canvasToBlob(mainCanvas, outputMime, 0.85).catch(() =>
    canvasToBlob(mainCanvas, 'image/jpeg', 0.85),
  );

  // --- Thumbnail (center crop → 80×80 square) ---
  const side = Math.min(origW, origH);
  const sx = (origW - side) / 2;
  const sy = (origH - side) / 2;
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = UPLOAD_THUMBNAIL_SIZE_PX;
  thumbCanvas.height = UPLOAD_THUMBNAIL_SIZE_PX;
  const ctx = thumbCanvas.getContext('2d');
  if (!ctx) throw new Error('Could not obtain a 2D canvas context.');
  ctx.drawImage(img, sx, sy, side, side, 0, 0, UPLOAD_THUMBNAIL_SIZE_PX, UPLOAD_THUMBNAIL_SIZE_PX);
  const thumbnail = await canvasToBlob(thumbCanvas, 'image/webp', 0.8).catch(() =>
    canvasToBlob(thumbCanvas, 'image/jpeg', 0.8),
  );

  return {
    main,
    thumbnail,
    mimeType: outputMime as ProcessedImage['mimeType'],
    width,
    height,
  };
}

// ---------------------------------------------------------------------------
// Public API: upload with progress
// ---------------------------------------------------------------------------

/**
 * Uploads a FormData payload to the given URL using XMLHttpRequest so that
 * upload progress events are available. Automatically parses the JSON
 * response and rejects with a user-friendly message on failure.
 *
 * Use this for files larger than 1 MB where a progress indicator is needed.
 *
 * @param url        - Destination endpoint.
 * @param formData   - Payload to send.
 * @param onProgress - Optional callback invoked during upload.
 * @returns Parsed JSON response body.
 */
export async function uploadWithProgress<T = unknown>(
  url: string,
  formData: FormData,
  onProgress?: (event: UploadProgressEvent) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percentage: Math.round((e.loaded / e.total) * 100),
          });
        }
      });
    }

    xhr.addEventListener('load', () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('The server returned an unexpected response. Please try again.'));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
      } else {
        const apiBody = body as { error?: { userMessage?: string } };
        const message =
          apiBody?.error?.userMessage ??
          `Upload failed (HTTP ${xhr.status}). Please try again.`;
        reject(new Error(message));
      }
    });

    xhr.addEventListener('error', () =>
      reject(new Error('A network error occurred during upload. Please check your connection.')),
    );
    xhr.addEventListener('abort', () =>
      reject(new Error('The upload was cancelled.')),
    );

    xhr.open('POST', url);
    xhr.send(formData);
  });
}

// ---------------------------------------------------------------------------
// Public API: combined convenience helper
// ---------------------------------------------------------------------------

/**
 * Processes a profile image file and uploads it to the API in one call.
 *
 * For files over 1 MB, pass an `onProgress` callback to drive a progress bar.
 *
 * @param file      - Raw image file from the user.
 * @param uploadUrl - URL of the upload endpoint (e.g. `/api/profiles/upload-image`).
 * @param userId    - ID of the user whose avatar is being updated.
 * @param onProgress - Optional progress callback (recommended for files > 1 MB).
 * @returns Object containing `avatarUrl` and `thumbnailUrl`.
 *
 * @example
 * const { avatarUrl, thumbnailUrl } = await processAndUploadProfileImage(
 *   file,
 *   '/api/profiles/upload-image',
 *   currentUserId,
 *   ({ percentage }) => setProgress(percentage),
 * );
 */
export async function processAndUploadProfileImage(
  file: File,
  uploadUrl: string,
  userId: string,
  onProgress?: (event: UploadProgressEvent) => void,
): Promise<UploadImageResponse> {
  const processed = await processProfileImage(file);

  const ext = processed.mimeType.split('/')[1];
  const formData = new FormData();
  formData.append('image', processed.main, `avatar.${ext}`);
  formData.append('thumbnail', processed.thumbnail, 'avatar-thumb.webp');
  formData.append('userId', userId);

  // Only use XHR progress tracking when the file is large enough to warrant it.
  // For small files, the overhead of XHR vs fetch is unnecessary.
  const useProgress = onProgress !== undefined && requiresProgressIndicator(file.size);

  const response = await uploadWithProgress<{ data: UploadImageResponse }>(
    uploadUrl,
    formData,
    useProgress ? onProgress : undefined,
  );

  return response.data;
}
