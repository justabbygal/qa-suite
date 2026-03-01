import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  ModuleServiceError,
  deregisterModule,
  getModule,
  updateModule,
} from '@/lib/modules/moduleService';
import { ModuleUpdatePayload } from '@/lib/modules/types';

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseClient();
    const module = await getModule(supabase, params.id);

    if (!module) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    return NextResponse.json({ module });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch module' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const module = await updateModule(supabase, params.id, body as ModuleUpdatePayload);
    return NextResponse.json({ module });
  } catch (error) {
    if (error instanceof ModuleServiceError) {
      if (error.code === 'NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.code === 'VALIDATION_ERROR') {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
    }
    return NextResponse.json({ error: 'Failed to update module' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseClient();
    await deregisterModule(supabase, params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ModuleServiceError) {
      if (error.code === 'DATABASE_ERROR') {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    return NextResponse.json({ error: 'Failed to deregister module' }, { status: 500 });
  }
}
