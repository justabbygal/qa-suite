import { SupabaseClient } from '@supabase/supabase-js';
import { ModuleManifest, ModuleUpdatePayload, RegisteredModule, RolePermissions } from './types';
import {
  applyPermissionConstraints,
  generateDefaultPermissions,
  validateModuleManifest,
  validatePermissions,
} from './permissionGenerator';

const TABLE_NAME = 'registered_modules';

export class ModuleServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'DUPLICATE' | 'VALIDATION_ERROR' | 'DATABASE_ERROR'
  ) {
    super(message);
    this.name = 'ModuleServiceError';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToRegisteredModule(row: Record<string, any>): RegisteredModule {
  return {
    id: row['id'] as string,
    module: row['module'] as string,
    displayName: row['display_name'] as string,
    hasSettings: row['has_settings'] as boolean,
    organizationId: row['organization_id'] as string,
    permissions: row['permissions'] as RolePermissions,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

export async function registerModule(
  supabase: SupabaseClient,
  manifest: ModuleManifest,
  organizationId: string
): Promise<RegisteredModule> {
  const validation = validateModuleManifest(manifest);
  if (!validation.valid) {
    throw new ModuleServiceError(
      `Invalid module manifest: ${validation.errors.join('; ')}`,
      'VALIDATION_ERROR'
    );
  }

  const { data: existing } = await supabase
    .from(TABLE_NAME)
    .select('id')
    .eq('module', manifest.module)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (existing) {
    throw new ModuleServiceError(
      `Module '${manifest.module}' is already registered for this organization`,
      'DUPLICATE'
    );
  }

  const permissions = generateDefaultPermissions(manifest);

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      module: manifest.module,
      display_name: manifest.displayName,
      has_settings: manifest.hasSettings,
      organization_id: organizationId,
      permissions,
    })
    .select()
    .single();

  if (error || !data) {
    throw new ModuleServiceError(
      `Failed to register module: ${error?.message ?? 'unknown error'}`,
      'DATABASE_ERROR'
    );
  }

  return mapToRegisteredModule(data);
}

export async function updateModule(
  supabase: SupabaseClient,
  moduleId: string,
  updates: ModuleUpdatePayload
): Promise<RegisteredModule> {
  const { data: current, error: fetchError } = await supabase
    .from(TABLE_NAME)
    .select()
    .eq('id', moduleId)
    .single();

  if (fetchError || !current) {
    throw new ModuleServiceError(`Module not found: ${moduleId}`, 'NOT_FOUND');
  }

  const updateData: Record<string, unknown> = {};

  if (updates.displayName !== undefined) {
    if (!updates.displayName || updates.displayName.trim().length === 0) {
      throw new ModuleServiceError('displayName cannot be empty', 'VALIDATION_ERROR');
    }
    updateData['display_name'] = updates.displayName;
  }

  if (updates.hasSettings !== undefined) {
    updateData['has_settings'] = updates.hasSettings;
  }

  if (updates.permissions !== undefined) {
    const mergedPermissions = { ...current['permissions'], ...updates.permissions } as RolePermissions;
    const constrained = applyPermissionConstraints(mergedPermissions);
    const validation = validatePermissions(constrained);
    if (!validation.valid) {
      throw new ModuleServiceError(
        `Invalid permissions: ${validation.errors.join('; ')}`,
        'VALIDATION_ERROR'
      );
    }
    updateData['permissions'] = constrained;
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(updateData)
    .eq('id', moduleId)
    .select()
    .single();

  if (error || !data) {
    throw new ModuleServiceError(`Failed to update module: ${moduleId}`, 'DATABASE_ERROR');
  }

  return mapToRegisteredModule(data);
}

export async function deregisterModule(
  supabase: SupabaseClient,
  moduleId: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', moduleId);

  if (error) {
    throw new ModuleServiceError(
      `Failed to deregister module: ${error.message}`,
      'DATABASE_ERROR'
    );
  }
}

export async function getModule(
  supabase: SupabaseClient,
  moduleId: string
): Promise<RegisteredModule | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select()
    .eq('id', moduleId)
    .single();

  if (error || !data) return null;
  return mapToRegisteredModule(data);
}

export async function getModules(
  supabase: SupabaseClient,
  organizationId: string
): Promise<RegisteredModule[]> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select()
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data.map(mapToRegisteredModule);
}

export async function getModuleByName(
  supabase: SupabaseClient,
  moduleName: string,
  organizationId: string
): Promise<RegisteredModule | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select()
    .eq('module', moduleName)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return mapToRegisteredModule(data);
}
