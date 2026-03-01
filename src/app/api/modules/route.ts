import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { ModuleServiceError, getModules, registerModule } from '@/lib/modules/moduleService';
import { ModuleManifest } from '@/lib/modules/types';

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organizationId');

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const modules = await getModules(supabase, organizationId);
    return NextResponse.json({ modules });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch modules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { manifest, organizationId } = (body ?? {}) as {
    manifest?: ModuleManifest;
    organizationId?: string;
  };

  if (!manifest || !organizationId) {
    return NextResponse.json(
      { error: 'manifest and organizationId are required' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseClient();
    const module = await registerModule(supabase, manifest, organizationId);
    return NextResponse.json({ module }, { status: 201 });
  } catch (error) {
    if (error instanceof ModuleServiceError) {
      if (error.code === 'VALIDATION_ERROR') {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      if (error.code === 'DUPLICATE') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }
    return NextResponse.json({ error: 'Failed to register module' }, { status: 500 });
  }
}
