/**
 * Zod validation schemas for module registration manifests and API payloads.
 *
 * These schemas are the authoritative source for runtime validation.  They
 * mirror the TypeScript types in `src/lib/modules/types.ts` and provide
 * descriptive, field-level error messages suitable for surfacing to callers.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kebab-case pattern: one or more lowercase-alphanumeric segments separated
 * by single hyphens.  No leading or trailing hyphens are permitted.
 *
 * Examples: "user-management", "integrations-engine", "qa2"
 */
const KEBAB_CASE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ─────────────────────────────────────────────────────────────────────────────
// Permission access schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates a single role's two-layer access grant.
 * Enforces the business rule: settingsAccess cannot be true when
 * featureAccess is false.
 */
export const permissionAccessSchema = z
  .object({
    featureAccess: z.boolean({
      required_error: 'featureAccess is required',
      invalid_type_error: 'featureAccess must be a boolean',
    }),
    settingsAccess: z.boolean({
      required_error: 'settingsAccess is required',
      invalid_type_error: 'settingsAccess must be a boolean',
    }),
  })
  .refine((data) => !(data.settingsAccess && !data.featureAccess), {
    message: 'settingsAccess cannot be true when featureAccess is false',
    path: ['settingsAccess'],
  });

// ─────────────────────────────────────────────────────────────────────────────
// Role permissions schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the complete set of access grants across all three roles.
 * All roles must be present.
 */
export const rolePermissionsSchema = z.object(
  {
    Owner: permissionAccessSchema,
    Admin: permissionAccessSchema,
    User: permissionAccessSchema,
  },
  {
    required_error: 'defaultAccess is required',
    invalid_type_error: 'defaultAccess must be an object',
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Module manifest schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates a full module registration manifest.
 *
 * Rules enforced:
 * - `module`       — required, non-empty, kebab-case
 * - `displayName`  — required, non-empty after trimming
 * - `hasSettings`  — required boolean
 * - `defaultAccess`— all three roles present, access constraints satisfied
 */
export const moduleManifestSchema = z.object({
  module: z
    .string({
      required_error: 'module identifier is required',
      invalid_type_error: 'module identifier must be a string',
    })
    .min(1, 'module identifier cannot be empty')
    .regex(
      KEBAB_CASE_REGEX,
      'module identifier must be kebab-case (lowercase letters, numbers, and hyphens; no leading or trailing hyphens)'
    ),
  displayName: z
    .string({
      required_error: 'displayName is required',
      invalid_type_error: 'displayName must be a string',
    })
    .min(1, 'displayName cannot be empty')
    .trim(),
  hasSettings: z.boolean({
    required_error: 'hasSettings is required',
    invalid_type_error: 'hasSettings must be a boolean',
  }),
  defaultAccess: rolePermissionsSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// Module update payload schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates a partial update request.  All fields are optional but, when
 * provided, must satisfy the same rules as during registration.
 */
export const moduleUpdatePayloadSchema = z
  .object({
    displayName: z
      .string({ invalid_type_error: 'displayName must be a string' })
      .min(1, 'displayName cannot be empty')
      .trim()
      .optional(),
    hasSettings: z
      .boolean({ invalid_type_error: 'hasSettings must be a boolean' })
      .optional(),
    permissions: z
      .object({
        Owner: permissionAccessSchema.optional(),
        Admin: permissionAccessSchema.optional(),
        User: permissionAccessSchema.optional(),
      })
      .optional(),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────────────────────

export type ValidatedPermissionAccess = z.infer<typeof permissionAccessSchema>;
export type ValidatedRolePermissions = z.infer<typeof rolePermissionsSchema>;
export type ValidatedModuleManifest = z.infer<typeof moduleManifestSchema>;
export type ValidatedModuleUpdatePayload = z.infer<typeof moduleUpdatePayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses an unknown value as a ModuleManifest.
 * Returns a Zod SafeParseReturnType so callers can inspect errors without
 * catching exceptions.
 */
export function validateModuleManifest(
  data: unknown
): z.SafeParseReturnType<ValidatedModuleManifest> {
  return moduleManifestSchema.safeParse(data);
}

/**
 * Parses an unknown value as a ModuleUpdatePayload.
 */
export function validateModuleUpdatePayload(
  data: unknown
): z.SafeParseReturnType<ValidatedModuleUpdatePayload> {
  return moduleUpdatePayloadSchema.safeParse(data);
}

/**
 * Flattens a ZodError into an array of human-readable error strings.
 * Each entry is prefixed with the dot-notation field path when available.
 *
 * Example output: ["module: module identifier must be kebab-case", "hasSettings is required"]
 */
export function formatZodErrors(error: z.ZodError): string[] {
  return error.errors.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });
}
