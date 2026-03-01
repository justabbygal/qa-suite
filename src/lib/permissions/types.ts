/** The three roles in order of decreasing privilege. */
export type Role = "owner" | "admin" | "user";

/** Two-layer access control for a single module × role combination. */
export interface PermissionAccess {
  /** Whether this role can access the feature at all. */
  featureAccess: boolean;
  /**
   * Whether this role can configure the feature's settings.
   * Only meaningful when featureAccess is true.
   */
  settingsAccess: boolean;
}

/** Default access grants for every role in a module. */
export interface ModuleDefaultAccess {
  owner: PermissionAccess;
  admin: PermissionAccess;
  user: PermissionAccess;
}

/** Registration manifest that each module must provide. */
export interface ModuleManifest {
  /** Kebab-case identifier (e.g. "user-management"). */
  module: string;
  /** Human-readable display name. */
  displayName: string;
  /** Whether this module exposes configurable settings. */
  hasSettings: boolean;
  /** Default access grants per role. */
  defaultAccess: ModuleDefaultAccess;
}

/** Organization-level permission override for a specific module + role. */
export interface PermissionOverride {
  organizationId: string;
  module: string;
  role: Role;
  featureAccess: boolean;
  settingsAccess: boolean;
}

/** The resolved, effective permission for a user on a specific module. */
export interface ResolvedPermission {
  /** User can access the feature. */
  canUse: boolean;
  /** User can configure the feature's settings. */
  canConfigure: boolean;
}

/** A user within an organization. */
export interface OrgUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
}

/** Generic result returned by user-management operations. */
export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
