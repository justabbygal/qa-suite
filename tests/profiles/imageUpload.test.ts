/**
 * Image Upload Tests – User Profile Avatar Management
 *
 * Tests file validation, helper utilities, and storage path generation
 * for profile avatar uploads.  No network calls are made.
 */

import {
  validateImageFile,
  isAllowedImageType,
  isFileSizeValid,
  getFileExtension,
  generateAvatarPath,
  formatFileSize,
} from '@/modules/user-management/lib/imageUpload';
import {
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_MB,
  ALLOWED_IMAGE_TYPES,
} from '@/modules/user-management/types/profile';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFile(name: string, type: string, sizeBytes: number): File {
  const blob = new Blob(['x'.repeat(sizeBytes)], { type });
  return new File([blob], name, { type });
}

const ONE_MB = 1024 * 1024;
const FIVE_MB = 5 * ONE_MB;

// ─── validateImageFile ────────────────────────────────────────────────────────

describe('validateImageFile', () => {
  describe('accepted MIME types', () => {
    const validTypes: Array<[string, string]> = [
      ['image/jpeg', 'photo.jpg'],
      ['image/png', 'screenshot.png'],
      ['image/gif', 'animation.gif'],
      ['image/webp', 'modern.webp'],
    ];

    it.each(validTypes)('accepts %s', (mimeType, filename) => {
      const file = makeFile(filename, mimeType, ONE_MB);
      const result = validateImageFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('rejected MIME types', () => {
    const invalidTypes: Array<[string, string]> = [
      ['application/pdf', 'document.pdf'],
      ['image/svg+xml', 'vector.svg'],
      ['image/tiff', 'scan.tiff'],
      ['image/bmp', 'bitmap.bmp'],
      ['application/octet-stream', 'binary.bin'],
      ['text/plain', 'readme.txt'],
      ['video/mp4', 'video.mp4'],
      ['application/zip', 'archive.zip'],
    ];

    it.each(invalidTypes)('rejects %s', (mimeType, filename) => {
      const file = makeFile(filename, mimeType, ONE_MB);
      const result = validateImageFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain(mimeType);
    });

    it('error message lists all allowed extensions', () => {
      const file = makeFile('doc.pdf', 'application/pdf', ONE_MB);
      const result = validateImageFile(file);
      expect(result.error).toContain('jpeg');
      expect(result.error).toContain('png');
      expect(result.error).toContain('gif');
      expect(result.error).toContain('webp');
    });
  });

  describe('file size validation', () => {
    it('accepts a file exactly at the size limit', () => {
      const file = makeFile('large.jpg', 'image/jpeg', MAX_IMAGE_SIZE_BYTES);
      expect(validateImageFile(file).valid).toBe(true);
    });

    it('accepts a file one byte under the limit', () => {
      const file = makeFile('almostmax.jpg', 'image/jpeg', MAX_IMAGE_SIZE_BYTES - 1);
      expect(validateImageFile(file).valid).toBe(true);
    });

    it('rejects a file one byte over the limit', () => {
      const file = makeFile('toobig.jpg', 'image/jpeg', MAX_IMAGE_SIZE_BYTES + 1);
      const result = validateImageFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects a file that is 10 MB', () => {
      const file = makeFile('huge.jpg', 'image/jpeg', 10 * ONE_MB);
      const result = validateImageFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(`${MAX_IMAGE_SIZE_MB} MB`);
    });

    it('accepts a very small file (1 byte)', () => {
      const file = makeFile('tiny.png', 'image/png', 1);
      expect(validateImageFile(file).valid).toBe(true);
    });

    it('accepts a zero-byte file of a valid type', () => {
      const file = makeFile('empty.png', 'image/png', 0);
      expect(validateImageFile(file).valid).toBe(true);
    });
  });

  describe('type check precedes size check', () => {
    it('returns a type error (not a size error) when both constraints are violated', () => {
      const file = makeFile('big.pdf', 'application/pdf', 10 * ONE_MB);
      const result = validateImageFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('application/pdf');
    });
  });
});

// ─── isAllowedImageType ───────────────────────────────────────────────────────

describe('isAllowedImageType', () => {
  it.each(ALLOWED_IMAGE_TYPES)('returns true for %s', (mimeType) => {
    expect(isAllowedImageType(mimeType)).toBe(true);
  });

  it('returns false for image/svg+xml', () => {
    expect(isAllowedImageType('image/svg+xml')).toBe(false);
  });

  it('returns false for application/pdf', () => {
    expect(isAllowedImageType('application/pdf')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isAllowedImageType('')).toBe(false);
  });

  it('is case-sensitive (uppercase type is rejected)', () => {
    expect(isAllowedImageType('IMAGE/JPEG')).toBe(false);
  });
});

// ─── isFileSizeValid ──────────────────────────────────────────────────────────

describe('isFileSizeValid', () => {
  it('returns true for 0 bytes', () => expect(isFileSizeValid(0)).toBe(true));
  it('returns true for 1 byte', () => expect(isFileSizeValid(1)).toBe(true));
  it('returns true for exactly MAX bytes', () => {
    expect(isFileSizeValid(MAX_IMAGE_SIZE_BYTES)).toBe(true);
  });
  it('returns false for MAX + 1 bytes', () => {
    expect(isFileSizeValid(MAX_IMAGE_SIZE_BYTES + 1)).toBe(false);
  });
  it('returns false for a very large value', () => {
    expect(isFileSizeValid(100 * ONE_MB)).toBe(false);
  });
});

// ─── getFileExtension ─────────────────────────────────────────────────────────

describe('getFileExtension', () => {
  const cases: Array<[string, string]> = [
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
  ];

  it.each(cases)('maps %s to %s', (mimeType, ext) => {
    expect(getFileExtension(mimeType)).toBe(ext);
  });

  it('returns "jpg" as a safe fallback for an unknown type', () => {
    expect(getFileExtension('image/unknown')).toBe('jpg');
  });

  it('returns "jpg" for an empty string', () => {
    expect(getFileExtension('')).toBe('jpg');
  });
});

// ─── generateAvatarPath ───────────────────────────────────────────────────────

describe('generateAvatarPath', () => {
  const ORG_ID = 'org-123';
  const USER_ID = 'user-456';
  const TIMESTAMP = 1700000000000;

  it('includes the organization ID as the first path segment', () => {
    const path = generateAvatarPath(ORG_ID, USER_ID, 'image/jpeg', TIMESTAMP);
    expect(path.startsWith(ORG_ID + '/')).toBe(true);
  });

  it('includes the user ID as the second path segment', () => {
    const path = generateAvatarPath(ORG_ID, USER_ID, 'image/jpeg', TIMESTAMP);
    expect(path).toContain(`/${USER_ID}/`);
  });

  it('includes the timestamp in the filename', () => {
    const path = generateAvatarPath(ORG_ID, USER_ID, 'image/jpeg', TIMESTAMP);
    expect(path).toContain(String(TIMESTAMP));
  });

  it('uses the correct extension for jpeg', () => {
    expect(generateAvatarPath(ORG_ID, USER_ID, 'image/jpeg', TIMESTAMP)).toMatch(/\.jpg$/);
  });

  it('uses the correct extension for png', () => {
    expect(generateAvatarPath(ORG_ID, USER_ID, 'image/png', TIMESTAMP)).toMatch(/\.png$/);
  });

  it('uses the correct extension for webp', () => {
    expect(generateAvatarPath(ORG_ID, USER_ID, 'image/webp', TIMESTAMP)).toMatch(/\.webp$/);
  });

  it('uses the correct extension for gif', () => {
    expect(generateAvatarPath(ORG_ID, USER_ID, 'image/gif', TIMESTAMP)).toMatch(/\.gif$/);
  });

  it('produces a deterministic path given the same inputs', () => {
    const path1 = generateAvatarPath(ORG_ID, USER_ID, 'image/jpeg', TIMESTAMP);
    const path2 = generateAvatarPath(ORG_ID, USER_ID, 'image/jpeg', TIMESTAMP);
    expect(path1).toBe(path2);
  });

  it('produces unique paths for different users', () => {
    const p1 = generateAvatarPath(ORG_ID, 'user-aaa', 'image/jpeg', TIMESTAMP);
    const p2 = generateAvatarPath(ORG_ID, 'user-bbb', 'image/jpeg', TIMESTAMP);
    expect(p1).not.toBe(p2);
  });

  it('produces unique paths for different organisations', () => {
    const p1 = generateAvatarPath('org-aaa', USER_ID, 'image/jpeg', TIMESTAMP);
    const p2 = generateAvatarPath('org-bbb', USER_ID, 'image/jpeg', TIMESTAMP);
    expect(p1).not.toBe(p2);
  });

  it('uses a live timestamp when the timestamp argument is omitted', () => {
    const before = Date.now();
    const path = generateAvatarPath(ORG_ID, USER_ID, 'image/jpeg');
    const after = Date.now();
    const match = path.match(/avatar-(\d+)\./);
    expect(match).not.toBeNull();
    const ts = Number(match![1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─── formatFileSize ───────────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats 0 bytes', () => expect(formatFileSize(0)).toBe('0 B'));
  it('formats 1 byte', () => expect(formatFileSize(1)).toBe('1 B'));
  it('formats 1023 bytes', () => expect(formatFileSize(1023)).toBe('1023 B'));
  it('formats 1024 bytes as KB', () => expect(formatFileSize(1024)).toBe('1.0 KB'));
  it('formats 1536 bytes as 1.5 KB', () => expect(formatFileSize(1536)).toBe('1.5 KB'));
  it('formats 1 MB', () => expect(formatFileSize(ONE_MB)).toBe('1.0 MB'));
  it('formats 5 MB', () => expect(formatFileSize(FIVE_MB)).toBe('5.0 MB'));
  it('formats 2.5 MB', () => expect(formatFileSize(2.5 * ONE_MB)).toBe('2.5 MB'));
});

// ─── Integration: validate then generate path ─────────────────────────────────

describe('validate then generate path workflow', () => {
  it('generates a path only when validation passes', () => {
    const file = makeFile('avatar.png', 'image/png', ONE_MB);
    const result = validateImageFile(file);
    expect(result.valid).toBe(true);

    if (result.valid) {
      const path = generateAvatarPath('org-1', 'user-1', file.type, 123456789);
      expect(path).toBe('org-1/user-1/avatar-123456789.png');
    }
  });

  it('does not generate a path when validation fails', () => {
    const file = makeFile('virus.exe', 'application/octet-stream', ONE_MB);
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
