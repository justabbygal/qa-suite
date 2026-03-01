/** The three roles available within an organization, ordered from most to least privileged. */
export type Role = 'Owner' | 'Admin' | 'User';

/** Ordered array of all roles. Useful for iterating permission definitions. */
export const ROLES: Role[] = ['Owner', 'Admin', 'User'];

/**
 * Two-layer access control state for a single role on a single module.
 *
 * Business rule: `settingsAccess` is automatically set to `false` when
 * `featureAccess` is `false`. You cannot configure settings for a feature
 * you cannot access.
 */
export interface PermissionAccess {
  /** Whether this role can use the feature at all. */
  featureAccess: boolean;
  /** Whether this role can configure the feature's settings. Only meaningful when `featureAccess` is `true`. */
  settingsAccess: boolean;
}

/** Permission state for all three roles. Used in {@link ModuleManifest} and {@link RegisteredModule}. */
export type RolePermissions = Record<Role, PermissionAccess>;

/**
 * Manifest that a module provides when registering with the permission system.
 *
 * Supply this when calling `registerModule()` from the registration client.
 *
 * @example
 * ```typescript
 * const manifest: ModuleManifest = {
 *   module: 'test-runner',          // kebab-case slug — must be unique per org
 *   displayName: 'Test Runner',     // human-readable name shown in the UI
 *   hasSettings: true,              // true if the module has a settings page
 *   defaultAccess: {
 *     Owner: { featureAccess: true,  settingsAccess: true  },
 *     Admin: { featureAccess: true,  settingsAccess: false },
 *     User:  { featureAccess: false, settingsAccess: false },
 *   },
 * };
 * ```
 */
export interface ModuleManifest {
  /**
   * Kebab-case identifier for the module. Must be unique within an organization.
   * Allowed characters: lowercase letters, digits, and hyphens (no leading or trailing hyphens).
   * @example 'test-runner', 'audit-logs', 'integrations-engine'
   */
  module: string;
  /** Human-readable name displayed in the permissions UI. Must be non-empty. */
  displayName: string;
  /** Whether the module exposes a settings page that can be separately permission-gated. */
  hasSettings: boolean;
  /**
   * Default permission state applied when the module is first registered for an organization.
   * All three roles must be specified. The `settingsAccess` constraint is automatically
   * enforced: if `featureAccess` is `false`, `settingsAccess` is forced to `false`.
   */
  defaultAccess: RolePermissions;
}

/**
 * A module that has been successfully registered with the permission system.
 * Returned by `registerModule()`, `updateModule()`, and the modules API.
 */
export interface RegisteredModule {
  /** UUID of this registration record. */
  id: string;
  /** Kebab-case slug identifying the module. */
  module: string;
  /** Human-readable name shown in the UI. */
  displayName: string;
  /** Whether the module has a configurable settings page. */
  hasSettings: boolean;
  /** UUID of the organization this registration belongs to. */
  organizationId: string;
  /** Current permission state for all three roles. */
  permissions: RolePermissions;
  /** ISO-8601 timestamp of when the module was first registered. */
  createdAt: string;
  /** ISO-8601 timestamp of the most recent update. */
  updatedAt: string;
}

/**
 * Partial update payload for an existing module registration.
 * All fields are optional — only provided fields are changed.
 * When `permissions` is supplied, it is deep-merged with the existing permissions,
 * so you can update a single role without affecting others.
 */
export interface ModuleUpdatePayload {
  /** New human-readable display name. Must be non-empty if provided. */
  displayName?: string;
  /** Toggle whether the module exposes a settings page. */
  hasSettings?: boolean;
  /**
   * Partial permission overrides. Merged with the current permissions server-side.
   * The `settingsAccess ⊆ featureAccess` constraint is automatically enforced after merging.
   */
  permissions?: Partial<RolePermissions>;
}
