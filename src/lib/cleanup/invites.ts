import { createClient } from "@supabase/supabase-js";

export interface InviteCleanupResult {
  /** Pending invitations that were transitioned to 'expired' status. */
  newly_expired: number;
  /** Invitations that were permanently deleted from the database. */
  deleted: number;
  /** ISO timestamp of when the cleanup ran. */
  cleaned_at: string;
}

export interface ExpiredInviteSummary {
  organization_id: string;
  count: number;
}

/**
 * Creates a server-side Supabase client authenticated with the service role
 * key so it can bypass Row Level Security and execute privileged operations.
 */
function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Triggers the database-level cleanup of expired invitations.
 *
 * Delegates to the `cleanup_expired_invitations` Postgres function, which:
 *  1. Marks pending invitations past their `expires_at` as 'expired'.
 *  2. Permanently deletes all invitations in 'expired' status.
 *  3. Writes an audit log entry summarising the operation.
 *
 * Use this as a manual backup when the pg_cron scheduled job needs to be
 * triggered on-demand — e.g., during testing, after a schema migration, or
 * when the cron schedule needs to be overridden by an operator.
 *
 * @throws {Error} If the Supabase RPC call fails.
 */
export async function cleanupExpiredInvites(): Promise<InviteCleanupResult> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("cleanup_expired_invitations");

  if (error) {
    throw new Error(`Invite cleanup failed: ${error.message}`);
  }

  return data as InviteCleanupResult;
}

/**
 * Returns the total number of pending invitations that have passed their
 * `expires_at` timestamp but have not yet been cleaned up.
 *
 * Use this for monitoring dashboards or to decide whether a manual cleanup
 * run is warranted before the next scheduled cron execution.
 *
 * @throws {Error} If the Supabase query fails.
 */
export async function getExpiredInviteCount(): Promise<number> {
  const supabase = createServerClient();

  const { count, error } = await supabase
    .from("invitation")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  if (error) {
    throw new Error(`Failed to count expired invites: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Returns a per-organization breakdown of pending invitations that have
 * passed their `expires_at` timestamp.
 *
 * Useful for targeted cleanup reporting or debugging invite expiry across
 * multiple tenants.
 *
 * @throws {Error} If the Supabase query fails.
 */
export async function getExpiredInvitesByOrganization(): Promise<
  ExpiredInviteSummary[]
> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("invitation")
    .select("organization_id")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  if (error) {
    throw new Error(
      `Failed to fetch expired invites by organization: ${error.message}`
    );
  }

  // Aggregate counts per organization in JavaScript to avoid a raw SQL query.
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.organization_id] = (counts[row.organization_id] ?? 0) + 1;
  }

  return Object.entries(counts).map(([organization_id, count]) => ({
    organization_id,
    count,
  }));
}
