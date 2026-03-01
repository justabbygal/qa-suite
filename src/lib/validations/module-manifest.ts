/**
 * Module manifest validation.
 *
 * Focused validation API for module registration manifests. These are the
 * schemas used by the `/api/modules/register` endpoint and any other caller
 * that needs to validate manifest data at the boundary (HTTP, IPC, etc.).
 *
 * The authoritative schema definitions live in `lib/validation/module-schemas.ts`
 * and are re-exported here for a stable, purpose-scoped import path.
 */

export {
  moduleManifestSchema,
  permissionAccessSchema,
  rolePermissionsSchema,
  validateModuleManifest,
  formatZodErrors,
} from '@/lib/validation/module-schemas';

export type {
  ValidatedModuleManifest,
  ValidatedPermissionAccess,
  ValidatedRolePermissions,
} from '@/lib/validation/module-schemas';
