import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { ModuleServiceError, getModule, updateModule } from '@/lib/modules/moduleService';
import type { Role, RolePermissions } from '@/lib/modules/types';

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * PATCH /api/permissions/[moduleId]
 *
 * Applies partial permission updates for a single module. Accepts a sparse
 * permissions object (e.g. only one role, only one field) and deep-merges
 * it with the current stored permissions before saving. This prevents partial
 * updates from clobbering unrelated fields.
 *
 * Request body:
 *   { permissions: { [Role]: { featureAccess?: boolean; settingsAccess?: boolean } } }
 *
 * Returns the updated RegisteredModule directly (not wrapped) to match the
 * shape expected by the usePermissionState hook.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { permissions } = (body ?? {}) as {
    permissions?: Partial<Record<string, Partial<{ featureAccess: boolean; settingsAccess: boolean }>>>;
  };

  if (!permissions) {
    return NextResponse.json({ error: 'permissions is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();

    // Fetch current module so we can perform a field-level deep merge.
    // Without this, a partial role update (e.g. { Owner: { featureAccess: true } })
    // would lose the sibling field (settingsAccess) during the shallow merge in
    // updateModule.
    const current = await getModule(supabase, params.moduleId);
    if (!current) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    // Deep merge: for each incoming role entry, merge at the field level with
    // the existing role permissions so no field is unintentionally dropped.
    const mergedPermissions: RolePermissions = { ...current.permissions };
    for (const [roleKey, fieldUpdates] of Object.entries(permissions)) {
      const role = roleKey as Role;
      if (role in mergedPermissions && fieldUpdates) {
        mergedPermissions[role] = {
          ...mergedPermissions[role],
          ...fieldUpdates,
        };
      }
    }

    const updated = await updateModule(supabase, params.moduleId, {
      permissions: mergedPermissions,
    });

    // Return module directly — the usePermissionState hook expects RegisteredModule
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ModuleServiceError) {
      if (error.code === 'NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.code === 'VALIDATION_ERROR') {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
    }
    return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 });
  }
}
