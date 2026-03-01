/**
 * Image Upload Tests - User Profile Avatar Management
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

function makeFile(name: string, type: string, sizeBytes: number): File {
  const blob = new Blob(['x'.repeat(sizeBytes)], { type });
  return new File([blob], name, { type });
}

const ONE_MB = 1024 * 1024;
const FIVE_MB = 5 * ONE_MB;

describe('validateImageFile', () => {
  describe('accepted MIME types', () => {
    const validTypes: Array<[string, string]> = [
      ['image/jpeg', 'photo.jpg'],
      ['image/png', 'screenshot.png'],
      ['image/gif', 'animation.gif'],
      ['image/webp', 'modern.webp'],
    ];

    it.each(validTypes)('accepts %s', (mimeType, filename) => {
      const result = validateImageFile(makeFile(filename, mimeType, ONE_MB));
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('rejected MIME types', () => {
    const invalidTypes: Array<[string, string]> = [
      ['application/pdf', 'doc.pdf'],
      ['image/svg+xml', 'vector.svg'],
      ['image/tiff', 'scan.tiff'],
      ['image/bmp', 'bitmap.bmp'],
      ['application/octet-stream', 'binary.bin'],
      ['text/plain', 'readme.txt'],
      ['video/mp4', 'video.mp4'],
    ];

    it.each(invalidTypes)('rejects %s', (mimeType, filename) => {
      const result = validateImageFile(makeFile(filename, mimeType, ONE_MB));
      expect(result.valid).toBe(false);
      expect(result.error).toContain(mimeType);
    });

    it('error message lists all allowed extensions', () => {
      const result = validateImageFile(makeFile('doc.pdf', 'application/pdf', ONE_MB));
      expect(result.error).toContain('jpeg');
      expect(result.error).toContain('png');
      expect(result.error).toContain('gif');
      expect(result.error).toContain('webp');
    });
  });

  describe('file size validation', () => {
    it('accepts file exactly at limit', () => {
      expect(validateImageFile(makeFile('x.jpg', 'image/jpeg', MAX_IMAGE_SIZE_BYTES)).valid).toBe(true);
    });
    it('accepts file one byte under limit', () => {
      expect(validateImageFile(makeFile('x.jpg', 'image/jpeg', MAX_IMAGE_SIZE_BYTES - 1)).valid).toBe(true);
    });
    it('rejects file one byte over limit', () => {
      const result = validateImageFile(makeFile('x.jpg', 'image/jpeg', MAX_IMAGE_SIZE_BYTES + 1));
      expect(result.valid).toBe(false);
    });
    it('rejects 10 MB file', () => {
      const result = validateImageFile(makeFile('huge.jpg', 'image/jpeg', 10 * ONE_MB));
      expect(result.valid).toBe(false);
      expect(result.error).toContain(`${MAX_IMAGE_SIZE_MB} MB`);
    });
    it('accepts 1-byte file', () => {
      expect(validateImageFile(makeFile('tiny.png', 'image/png', 1)).valid).toBe(true);
    });
    it('accepts zero-byte file of valid type', () => {
      expect(validateImageFile(makeFile('empty.png', 'image/png', 0)).valid).toBe(true);
    });
  });

  describe('type check precedes size check', () => {
    it('reports type error (not size error) when both are invalid', () => {
      const result = validateImageFile(makeFile('big.pdf', 'application/pdf', 10 * ONE_MB));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('application/pdf');
    });
  });
});

describe('isAllowedImageType', () => {
  it.each(ALLOWED_IMAGE_TYPES)('returns true for %s', (mime) => {
    expect(isAllowedImageType(mime)).toBe(true);
  });
  it('returns false for image/svg+xml', () => expect(isAllowedImageType('image/svg+xml')).toBe(false));
  it('returns false for application/pdf', () => expect(isAllowedImageType('application/pdf')).toBe(false));
  it('returns false for empty string', () => expect(isAllowedImageType('')).toBe(false));
  it('is case-sensitive', () => expect(isAllowedImageType('IMAGE/JPEG')).toBe(false));
});

describe('isFileSizeValid', () => {
  it('true for 0', () => expect(isFileSizeValid(0)).toBe(true));
  it('true for 1', () => expect(isFileSizeValid(1)).toBe(true));
  it('true for exactly MAX', () => expect(isFileSizeValid(MAX_IMAGE_SIZE_BYTES)).toBe(true));
  it('false for MAX + 1', () => expect(isFileSizeValid(MAX_IMAGE_SIZE_BYTES + 1)).toBe(false));
  it('false for very large value', () => expect(isFileSizeValid(100 * ONE_MB)).toBe(false));
});

describe('getFileExtension', () => {
  const cases: Array<[string, string]> = [
    ['image/jpeg', 'jpg'], ['image/png', 'png'],
    ['image/gif', 'gif'], ['image/webp', 'webp'],
  ];
  it.each(cases)('maps %s to %s', (mime, ext) => expect(getFileExtension(mime)).toBe(ext));
  it('returns "jpg" for unknown type', () => expect(getFileExtension('image/unknown')).toBe('jpg'));
  it('returns "jpg" for empty string', () => expect(getFileExtension('')).toBe('jpg'));
});

describe('generateAvatarPath', () => {
  const ORG = 'org-123', USER = 'user-456', TS = 1700000000000;

  it('starts with organization ID', () => {
    expect(generateAvatarPath(ORG, USER, 'image/jpeg', TS).startsWith(ORG + '/')).toBe(true);
  });
  it('contains user ID segment', () => {
    expect(generateAvatarPath(ORG, USER, 'image/jpeg', TS)).toContain(`/${USER}/`);
  });
  it('contains timestamp', () => {
    expect(generateAvatarPath(ORG, USER, 'image/jpeg', TS)).toContain(String(TS));
  });
  it('ends with .jpg for jpeg', () => expect(generateAvatarPath(ORG, USER, 'image/jpeg', TS)).toMatch(/\.jpg$/));
  it('ends with .png for png', () => expect(generateAvatarPath(ORG, USER, 'image/png', TS)).toMatch(/\.png$/));
  it('ends with .webp for webp', () => expect(generateAvatarPath(ORG, USER, 'image/webp', TS)).toMatch(/\.webp$/));
  it('ends with .gif for gif', () => expect(generateAvatarPath(ORG, USER, 'image/gif', TS)).toMatch(/\.gif$/));
  it('is deterministic', () => {
    expect(generateAvatarPath(ORG, USER, 'image/jpeg', TS))
      .toBe(generateAvatarPath(ORG, USER, 'image/jpeg', TS));
  });
  it('differs for different users', () => {
    expect(generateAvatarPath(ORG, 'user-a', 'image/jpeg', TS))
      .not.toBe(generateAvatarPath(ORG, 'user-b', 'image/jpeg', TS));
  });
  it('differs for different orgs', () => {
    expect(generateAvatarPath('org-a', USER, 'image/jpeg', TS))
      .not.toBe(generateAvatarPath('org-b', USER, 'image/jpeg', TS));
  });
  it('uses live timestamp when omitted', () => {
    const before = Date.now();
    const path = generateAvatarPath(ORG, USER, 'image/jpeg');
    const after = Date.now();
    const match = path.match(/avatar-(\d+)\./);
    expect(match).not.toBeNull();
    const ts = Number(match![1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('formatFileSize', () => {
  it('formats 0 bytes', () => expect(formatFileSize(0)).toBe('0 B'));
  it('formats 1 byte', () => expect(formatFileSize(1)).toBe('1 B'));
  it('formats 1023 bytes', () => expect(formatFileSize(1023)).toBe('1023 B'));
  it('formats 1024 as 1.0 KB', () => expect(formatFileSize(1024)).toBe('1.0 KB'));
  it('formats 1536 as 1.5 KB', () => expect(formatFileSize(1536)).toBe('1.5 KB'));
  it('formats 1 MB', () => expect(formatFileSize(ONE_MB)).toBe('1.0 MB'));
  it('formats 5 MB', () => expect(formatFileSize(FIVE_MB)).toBe('5.0 MB'));
  it('formats 2.5 MB', () => expect(formatFileSize(2.5 * ONE_MB)).toBe('2.5 MB'));
});

describe('validate then generate path workflow', () => {
  it('generates correct path when validation passes', () => {
    const file = makeFile('avatar.png', 'image/png', ONE_MB);
    expect(validateImageFile(file).valid).toBe(true);
    expect(generateAvatarPath('org-1', 'user-1', file.type, 123456789))
      .toBe('org-1/user-1/avatar-123456789.png');
  });
  it('does not generate path when validation fails', () => {
    const file = makeFile('virus.exe', 'application/octet-stream', ONE_MB);
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
