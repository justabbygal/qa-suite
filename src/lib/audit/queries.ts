import { createClient } from "@supabase/supabase-js";
import { AuditLog } from "./export";

export interface AuditQueryFilters {
  search?: string;
  action?: string;
  resourceType?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export type SortColumn =
  | "created_at"
  | "actor_name"
  | "actor_email"
  | "action"
  | "resource_type";
export type SortDirection = "asc" | "desc";

export interface SortConfig {
  column: SortColumn;
  direction: SortDirection;
}

export interface AuditLogsResult {
  data: AuditLog[];
  count: number;
  error: string | null;
}

export const PAGE_SIZE = 50;

function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey);
}

/**
 * Fetches a paginated, filtered, and sorted page of audit logs for an organization.
 */
export async function fetchAuditLogs(
  organizationId: string,
  filters: AuditQueryFilters = {},
  sort: SortConfig = { column: "created_at", direction: "desc" },
  page: number = 1
): Promise<AuditLogsResult> {
  const supabase = createBrowserClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .order(sort.column, { ascending: sort.direction === "asc" })
    .range(from, to);

  if (filters.actorId) {
    query = query.eq("actor_id", filters.actorId);
  }
  if (filters.action) {
    query = query.eq("action", filters.action);
  }
  if (filters.resourceType) {
    query = query.eq("resource_type", filters.resourceType);
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    // Include all events up to end of the given date
    query = query.lte("created_at", filters.dateTo + "T23:59:59.999Z");
  }
  if (filters.search) {
    const term = filters.search.replace(/[%_]/g, "\\$&");
    query = query.or(
      `actor_email.ilike.%${term}%,actor_name.ilike.%${term}%,action.ilike.%${term}%,resource_type.ilike.%${term}%`
    );
  }

  const { data, error, count } = await query;

  return {
    data: (data as AuditLog[]) ?? [],
    count: count ?? 0,
    error: error?.message ?? null,
  };
}
