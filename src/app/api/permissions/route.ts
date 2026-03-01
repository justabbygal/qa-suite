import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getModules } from '@/lib/modules/moduleService';

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/permissions?organizationId=...
 *
 * Returns the list of registered modules with their current permission state
 * for the given organization. Returns the array directly (not wrapped) to
 * match the shape expected by the usePermissionState hook.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organizationId');

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const modules = await getModules(supabase, organizationId);
    // Return array directly — the usePermissionState hook expects RegisteredModule[]
    return NextResponse.json(modules);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 });
  }
}
