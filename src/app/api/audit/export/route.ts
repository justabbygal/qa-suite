import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import {
  AuditExportFilters,
  AuditLog,
  CSV_HEADERS,
  auditLogToCSVRow,
  generateCSVFilename,
} from "@/lib/audit/export";

/** Number of rows fetched per Supabase query during streaming. */
const BATCH_SIZE = 1000;

/**
 * Creates a server-side Supabase client that bypasses Row Level Security.
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set in the environment.
 */
function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/** Parses URL search params into a typed filter object. */
function parseFilters(params: URLSearchParams): AuditExportFilters {
  return {
    organization_id: params.get("organization_id") ?? undefined,
    actor_id: params.get("actor_id") ?? undefined,
    action: params.get("action") ?? undefined,
    resource_type: params.get("resource_type") ?? undefined,
    resource_id: params.get("resource_id") ?? undefined,
    date_from: params.get("date_from") ?? undefined,
    date_to: params.get("date_to") ?? undefined,
    search: params.get("search") ?? undefined,
  };
}

/**
 * Verifies that the request comes from an authenticated Owner.
 *
 * TODO: Replace with Better Auth session verification once the User Management
 * module is fully implemented. Currently uses Supabase Auth token + an
 * organization_members table role check.
 */
async function verifyOwnerRole(
  request: NextRequest,
  supabase: ReturnType<typeof createServerClient>,
  organizationId: string
): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user) return false;

  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .single();

  if (memberError || !member) return false;
  return member.role === "owner";
}

/**
 * GET /api/audit/export
 *
 * Streams an audit log export in CSV format. Only accessible to Owners.
 *
 * Query params (all optional except organization_id):
 *   organization_id, actor_id, action, resource_type, resource_id,
 *   date_from, date_to, search
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const filters = parseFilters(searchParams);

  if (!filters.organization_id) {
    return NextResponse.json(
      { error: "organization_id is required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const isOwner = await verifyOwnerRole(
    request,
    supabase,
    filters.organization_id
  );
  if (!isOwner) {
    return NextResponse.json(
      { error: "Forbidden: Owner access required" },
      { status: 403 }
    );
  }

  const filename = generateCSVFilename();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Write CSV header row
        controller.enqueue(encoder.encode(CSV_HEADERS.join(",") + "\r\n"));

        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          let query = supabase
            .from("audit_logs")
            .select("*")
            .eq("organization_id", filters.organization_id!)
            .order("created_at", { ascending: false })
            .range(offset, offset + BATCH_SIZE - 1);

          if (filters.actor_id) query = query.eq("actor_id", filters.actor_id);
          if (filters.action) query = query.eq("action", filters.action);
          if (filters.resource_type)
            query = query.eq("resource_type", filters.resource_type);
          if (filters.resource_id)
            query = query.eq("resource_id", filters.resource_id);
          if (filters.date_from)
            query = query.gte("created_at", filters.date_from);
          if (filters.date_to)
            query = query.lte("created_at", filters.date_to);
          if (filters.search) {
            const term = filters.search.replace(/[%_]/g, "\\$&");
            query = query.or(
              `actor_email.ilike.%${term}%,actor_name.ilike.%${term}%,action.ilike.%${term}%,resource_type.ilike.%${term}%`
            );
          }

          const { data, error } = await query;

          if (error) {
            controller.error(new Error(error.message));
            return;
          }

          const logs = data as AuditLog[];
          for (const log of logs) {
            controller.enqueue(
              encoder.encode(auditLogToCSVRow(log) + "\r\n")
            );
          }

          hasMore = logs.length === BATCH_SIZE;
          offset += BATCH_SIZE;
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
