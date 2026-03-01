/**
 * Public-facing TypeScript types for the module registration system.
 *
 * Core domain types are re-exported from the modules library so that API
 * routes and consuming modules have a single, stable import path.
 * API request/response shapes are defined here.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core domain types (re-exported from service layer)
// ─────────────────────────────────────────────────────────────────────────────

export type {
  Role,
  PermissionAccess,
  RolePermissions,
  ModuleManifest,
  RegisteredModule,
  ModuleUpdatePayload,
} from '@/lib/modules/types';

export { ROLES } from '@/lib/modules/types';

// ─────────────────────────────────────────────────────────────────────────────
// Error codes
// ─────────────────────────────────────────────────────────────────────────────

export type ModuleErrorCode =
  | 'VALIDATION_ERROR'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'DATABASE_ERROR';

// ─────────────────────────────────────────────────────────────────────────────
// API request types
// ─────────────────────────────────────────────────────────────────────────────

import type { ModuleManifest, ModuleUpdatePayload } from '@/lib/modules/types';

/** Request body for POST /api/modules */
export interface ModuleRegistrationRequest {
  manifest: ModuleManifest;
  organizationId: string;
}

/** Request body for PUT /api/modules/[id] */
export type ModuleUpdateRequest = ModuleUpdatePayload;

// ─────────────────────────────────────────────────────────────────────────────
// API response types
// ─────────────────────────────────────────────────────────────────────────────

import type { RegisteredModule } from '@/lib/modules/types';

/** Successful response from POST /api/modules */
export interface ModuleRegistrationResponse {
  module: RegisteredModule;
}

/** Successful response from GET /api/modules/[id] and PUT /api/modules/[id] */
export interface ModuleResponse {
  module: RegisteredModule;
}

/** Successful response from GET /api/modules */
export interface ModuleListResponse {
  modules: RegisteredModule[];
}

/** Successful response from DELETE /api/modules/[id] */
export interface ModuleDeleteResponse {
  success: true;
}

/** Error response returned by all module API routes */
export interface ModuleErrorResponse {
  error: string;
  code?: ModuleErrorCode;
  /** Field-level validation error messages, present for VALIDATION_ERROR responses */
  details?: string[];
}
