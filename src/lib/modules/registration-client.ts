/**
 * Module Registration Client
 *
 * Client library for registering, updating, and deregistering modules with
 * the QA Suite permission system. Wraps the module registration API with
 * full TypeScript support, client-side pre-validation, and structured errors.
 *
 * @example Standalone register call
 * ```typescript
 * import { registerModule } from '@/lib/modules/registration-client';
 *
 * const registered = await registerModule(
 *   {
 *     module: 'audit-logs',
 *     displayName: 'Audit Logs',
 *     hasSettings: false,
 *     defaultAccess: {
 *       Owner: { featureAccess: true,  settingsAccess: false },
 *       Admin: { featureAccess: true,  settingsAccess: false },
 *       User:  { featureAccess: false, settingsAccess: false },
 *     },
 *   },
 *   organizationId
 * );
 * console.log('Registered with id:', registered.id);
 * ```
 *
 * @example Using the stateful client for multiple operations
 * ```typescript
 * import { createRegistrationClient } from '@/lib/modules/registration-client';
 *
 * const client = createRegistrationClient(organizationId, {
 *   auth: { token, userId, role: 'Owner' },
 * });
 *
 * const registered = await client.register(manifest);
 * await client.update(registered.module, { displayName: 'New Name' });
 * await client.deregister(registered.module);
 * ```
 */

import type { ModuleManifest, ModuleUpdatePayload, RegisteredModule, Role } from './types';
import { validateModuleManifest } from './permissionGenerator';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Authentication context required for write operations (update, deregister).
 * Obtain these values from the Better Auth session in your component or route.
 */
export interface RegistrationAuth {
  /** Bearer token from the current user session. */
  token: string;
  /** UUID of the authenticated user. */
  userId: string;
  /** Role of the user within the organization. */
  role: Role;
}

/**
 * Options accepted by {@link registerModule}.
 */
export interface ModuleRegistrationOptions {
  /**
   * Base URL prepended to all API paths.
   * Omit (or set to `''`) when calling from inside the Next.js app — relative
   * URLs work automatically. Set to the full origin (e.g. `https://app.example.com`)
   * when calling from an external script or CLI tool.
   * @default ''
   */
  baseUrl?: string;
}

/**
 * Options accepted by {@link updateModule} and {@link deregisterModule}.
 * Extends {@link ModuleRegistrationOptions} with required authentication.
 */
export interface ModuleMutationOptions extends ModuleRegistrationOptions {
  /** Authentication context. Required for all write operations. */
  auth: RegistrationAuth;
  /** UUID of the organization that owns the module. */
  organizationId: string;
}

/**
 * Options accepted by {@link createRegistrationClient}.
 */
export interface RegistrationClientOptions {
  /**
   * Base URL prepended to all API paths.
   * @default ''
   */
  baseUrl?: string;
  /**
   * Default authentication context used for write operations.
   * Can be overridden per-call via the `overrideAuth` parameter.
   */
  auth?: RegistrationAuth;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Thrown by all registration client operations on failure.
 *
 * Check `error.code` for programmatic handling and `error.retryable` to
 * decide whether to retry the operation.
 *
 * @example
 * ```typescript
 * import { registerModule, RegistrationClientError } from '@/lib/modules/registration-client';
 *
 * try {
 *   await registerModule(manifest, organizationId);
 * } catch (error) {
 *   if (error instanceof RegistrationClientError) {
 *     if (error.code === 'DUPLICATE') {
 *       // Module already registered — skip or update instead
 *     } else if (error.retryable) {
 *       // Transient server error — safe to retry
 *     }
 *   }
 *   throw error;
 * }
 * ```
 *
 * Common codes:
 * - `VALIDATION_ERROR`  — manifest or argument failed validation (client-side or server-side)
 * - `DUPLICATE`         — module already registered for this organization
 * - `NOT_FOUND`         — module does not exist in this organization
 * - `AUTH_REQUIRED`     — auth context missing from client options
 * - `UNAUTHORIZED`      — bearer token missing or invalid (HTTP 401)
 * - `FORBIDDEN`         — insufficient role for the operation (HTTP 403)
 * - `INVALID_RESPONSE`  — server returned non-JSON or unexpected body
 * - `API_ERROR`         — generic API failure
 */
export class RegistrationClientError extends Error {
  /** Machine-readable error code for programmatic handling. */
  readonly code: string;
  /** HTTP status code from the API response (0 for network-level failures). */
  readonly httpStatus: number;
  /** `true` when the operation can be safely retried. */
  readonly retryable: boolean;
  /** Additional context returned by the API, if any. */
  readonly details?: Record<string, unknown>;

  constructor(options: {
    message: string;
    code: string;
    httpStatus: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'RegistrationClientError';
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function preValidateManifest(manifest: ModuleManifest): void {
  const result = validateModuleManifest(manifest);
  if (!result.valid) {
    throw new RegistrationClientError({
      code: 'VALIDATION_ERROR',
      message: `Invalid module manifest: ${result.errors.join('; ')}`,
      httpStatus: 422,
      retryable: false,
      details: { errors: result.errors },
    });
  }
}

function requireNonEmpty(value: string | undefined | null, fieldName: string): void {
  if (!value?.trim()) {
    throw new RegistrationClientError({
      code: 'VALIDATION_ERROR',
      message: `${fieldName} is required`,
      httpStatus: 422,
      retryable: false,
    });
  }
}

function buildHeaders(auth?: RegistrationAuth, organizationId?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth && organizationId) {
    headers['Authorization'] = `Bearer ${auth.token}`;
    headers['x-user-id'] = auth.userId;
    headers['x-organization-id'] = organizationId;
    headers['x-user-role'] = auth.role;
  }

  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RegistrationClientError({
      code: 'INVALID_RESPONSE',
      message: 'Server returned a non-JSON response',
      httpStatus: response.status,
      retryable: response.status >= 500,
    });
  }

  if (!response.ok) {
    const err = (body as Record<string, unknown>)?.error;

    // Structured error object from the API
    if (err && typeof err === 'object') {
      const apiErr = err as Record<string, unknown>;
      throw new RegistrationClientError({
        code: (apiErr['code'] as string) ?? httpStatusToCode(response.status),
        message: (apiErr['message'] as string) ?? `Request failed with status ${response.status}`,
        httpStatus: response.status,
        retryable: Boolean(apiErr['retryable']),
        details: apiErr['details'] as Record<string, unknown> | undefined,
      });
    }

    // Plain string error (e.g. legacy routes)
    throw new RegistrationClientError({
      code: httpStatusToCode(response.status),
      message: typeof err === 'string' ? err : `Request failed with status ${response.status}`,
      httpStatus: response.status,
      retryable: response.status >= 500,
    });
  }

  return body as T;
}

function httpStatusToCode(status: number): string {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'DUPLICATE';
  if (status === 422) return 'VALIDATION_ERROR';
  return 'API_ERROR';
}

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    throw new RegistrationClientError({
      code: 'NETWORK_ERROR',
      message: `Network request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      httpStatus: 0,
      retryable: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Standalone functions — primary public API
// ---------------------------------------------------------------------------

/**
 * Registers a new module with the permission system for the given organization.
 *
 * The manifest is validated client-side before the API call is made, so
 * `VALIDATION_ERROR` is thrown immediately without a round-trip if the manifest
 * is malformed.
 *
 * If the module is already registered for this organization, the API returns a
 * `DUPLICATE` error. Use {@link updateModule} to modify an existing registration.
 *
 * @param manifest      - Module manifest describing identifier, display name, and default permissions.
 * @param organizationId - UUID of the organization to register the module for.
 * @param options        - Optional configuration (baseUrl).
 * @returns The newly created {@link RegisteredModule}.
 * @throws {RegistrationClientError} On validation failure, duplicate registration, or API errors.
 *
 * @example
 * ```typescript
 * const registered = await registerModule(
 *   {
 *     module: 'test-runner',
 *     displayName: 'Test Runner',
 *     hasSettings: true,
 *     defaultAccess: {
 *       Owner: { featureAccess: true,  settingsAccess: true  },
 *       Admin: { featureAccess: true,  settingsAccess: false },
 *       User:  { featureAccess: false, settingsAccess: false },
 *     },
 *   },
 *   'org-uuid-here'
 * );
 * ```
 */
export async function registerModule(
  manifest: ModuleManifest,
  organizationId: string,
  options?: ModuleRegistrationOptions
): Promise<RegisteredModule> {
  preValidateManifest(manifest);
  requireNonEmpty(organizationId, 'organizationId');

  const baseUrl = options?.baseUrl ?? '';
  const response = await safeFetch(`${baseUrl}/api/modules`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ manifest, organizationId }),
  });

  const body = await handleResponse<{ module: RegisteredModule }>(response);
  return body.module;
}

/**
 * Updates a registered module's display name, settings flag, or permissions.
 *
 * All fields in the update payload are optional — only provided fields are
 * changed. Permissions are deep-merged server-side, so omitted roles retain
 * their current values.
 *
 * Requires Owner or Admin role.
 *
 * @param moduleName - Kebab-case slug of the module to update (e.g. `'test-runner'`).
 * @param updates    - Partial update payload. At least one field should be provided.
 * @param options    - Configuration including required `auth` and `organizationId`.
 * @returns The updated {@link RegisteredModule}.
 * @throws {RegistrationClientError} On auth failure, not-found, validation error, or API errors.
 *
 * @example
 * ```typescript
 * const updated = await updateModule(
 *   'test-runner',
 *   {
 *     displayName: 'Test Runner v2',
 *     permissions: {
 *       User: { featureAccess: true, settingsAccess: false },
 *     },
 *   },
 *   { auth: { token, userId, role: 'Owner' }, organizationId }
 * );
 * ```
 */
export async function updateModule(
  moduleName: string,
  updates: ModuleUpdatePayload,
  options: ModuleMutationOptions
): Promise<RegisteredModule> {
  requireNonEmpty(moduleName, 'moduleName');

  const baseUrl = options.baseUrl ?? '';
  const response = await safeFetch(
    `${baseUrl}/api/modules/${encodeURIComponent(moduleName)}`,
    {
      method: 'PUT',
      headers: buildHeaders(options.auth, options.organizationId),
      body: JSON.stringify(updates),
    }
  );

  const body = await handleResponse<{ module: RegisteredModule }>(response);
  return body.module;
}

/**
 * Deregisters (permanently removes) a module from the permission system.
 *
 * This deletes the module record and all associated permissions for the given
 * organization. The operation is atomic and cannot be undone — re-register the
 * module with {@link registerModule} to restore it with fresh default permissions.
 *
 * Requires Owner or Admin role.
 *
 * @param moduleName - Kebab-case slug of the module to remove (e.g. `'test-runner'`).
 * @param options    - Configuration including required `auth` and `organizationId`.
 * @throws {RegistrationClientError} On auth failure, not-found, or API errors.
 *
 * @example
 * ```typescript
 * await deregisterModule(
 *   'test-runner',
 *   { auth: { token, userId, role: 'Owner' }, organizationId }
 * );
 * ```
 */
export async function deregisterModule(
  moduleName: string,
  options: ModuleMutationOptions
): Promise<void> {
  requireNonEmpty(moduleName, 'moduleName');

  const baseUrl = options.baseUrl ?? '';
  const response = await safeFetch(
    `${baseUrl}/api/modules/${encodeURIComponent(moduleName)}`,
    {
      method: 'DELETE',
      headers: buildHeaders(options.auth, options.organizationId),
    }
  );

  await handleResponse<{ success: true }>(response);
}

// ---------------------------------------------------------------------------
// RegistrationClient class — stateful wrapper for multi-operation scenarios
// ---------------------------------------------------------------------------

/**
 * Stateful client that retains organization and auth context across multiple
 * registration operations. Useful when a module needs to register itself on
 * startup and later update or remove its registration within the same session.
 *
 * Create an instance via {@link createRegistrationClient}.
 *
 * @example
 * ```typescript
 * const client = createRegistrationClient(organizationId, {
 *   auth: { token, userId, role: 'Admin' },
 * });
 *
 * const registered = await client.register(manifest);
 * await client.update(registered.module, { displayName: 'Updated Name' });
 * await client.deregister(registered.module);
 * ```
 */
export class RegistrationClient {
  private readonly organizationId: string;
  private readonly options: RegistrationClientOptions;

  constructor(organizationId: string, options: RegistrationClientOptions = {}) {
    requireNonEmpty(organizationId, 'organizationId');
    this.organizationId = organizationId;
    this.options = options;
  }

  /**
   * Registers a module with the permission system.
   *
   * @param manifest       - Module manifest to register.
   * @param overrideOptions - Optional per-call overrides (e.g. a different `baseUrl`).
   * @returns The newly created {@link RegisteredModule}.
   * @see {@link registerModule} for full parameter documentation.
   */
  async register(
    manifest: ModuleManifest,
    overrideOptions?: ModuleRegistrationOptions
  ): Promise<RegisteredModule> {
    return registerModule(manifest, this.organizationId, {
      baseUrl: overrideOptions?.baseUrl ?? this.options.baseUrl,
    });
  }

  /**
   * Updates a registered module's metadata or permissions.
   *
   * @param moduleName  - Kebab-case slug of the module to update.
   * @param updates     - Partial update payload.
   * @param overrideAuth - Override the default auth context for this call.
   * @returns The updated {@link RegisteredModule}.
   * @see {@link updateModule} for full parameter documentation.
   */
  async update(
    moduleName: string,
    updates: ModuleUpdatePayload,
    overrideAuth?: RegistrationAuth
  ): Promise<RegisteredModule> {
    const auth = overrideAuth ?? this.options.auth;
    if (!auth) {
      throw new RegistrationClientError({
        code: 'AUTH_REQUIRED',
        message:
          'Authentication is required to update a module. Provide `auth` in client options or pass it as the third argument.',
        httpStatus: 401,
        retryable: false,
      });
    }
    return updateModule(moduleName, updates, {
      auth,
      organizationId: this.organizationId,
      baseUrl: this.options.baseUrl,
    });
  }

  /**
   * Deregisters (removes) a module from the permission system.
   *
   * @param moduleName  - Kebab-case slug of the module to remove.
   * @param overrideAuth - Override the default auth context for this call.
   * @see {@link deregisterModule} for full parameter documentation.
   */
  async deregister(moduleName: string, overrideAuth?: RegistrationAuth): Promise<void> {
    const auth = overrideAuth ?? this.options.auth;
    if (!auth) {
      throw new RegistrationClientError({
        code: 'AUTH_REQUIRED',
        message:
          'Authentication is required to deregister a module. Provide `auth` in client options or pass it as the second argument.',
        httpStatus: 401,
        retryable: false,
      });
    }
    return deregisterModule(moduleName, {
      auth,
      organizationId: this.organizationId,
      baseUrl: this.options.baseUrl,
    });
  }
}

/**
 * Creates a {@link RegistrationClient} bound to a specific organization.
 *
 * @param organizationId - UUID of the organization context for all operations.
 * @param options        - Client configuration including optional default auth and baseUrl.
 * @returns A configured {@link RegistrationClient}.
 *
 * @example
 * ```typescript
 * import { createRegistrationClient } from '@/lib/modules/registration-client';
 *
 * // In a server action or API route, after authenticating the user:
 * const client = createRegistrationClient(session.organizationId, {
 *   auth: {
 *     token: session.token,
 *     userId: session.userId,
 *     role: session.role,
 *   },
 * });
 *
 * await client.register(myModuleManifest);
 * ```
 */
export function createRegistrationClient(
  organizationId: string,
  options?: RegistrationClientOptions
): RegistrationClient {
  return new RegistrationClient(organizationId, options);
}
