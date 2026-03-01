"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Invite, InviteRole, InviteStatus } from "@/types";

export interface InviteFilters {
  status: InviteStatus | "all";
  sortBy: "createdAt" | "expiresAt";
  sortOrder: "asc" | "desc";
}

export interface InviteActionResult {
  success: boolean;
  error?: string;
}

interface RawInviteRow {
  id: string;
  email: string;
  role: string;
  organization_id: string;
  token: string;
  status: string;
  expires_at: string;
  invited_by: string;
  invited_by_email: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: RawInviteRow): Invite {
  return {
    id: row.id,
    email: row.email,
    role: row.role as InviteRole,
    organizationId: row.organization_id,
    token: row.token,
    status: row.status as InviteStatus,
    expiresAt: row.expires_at,
    invitedBy: row.invited_by,
    invitedByEmail: row.invited_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Returns the effective display status of an invite, accounting for client-side
 * expiry detection when the database status hasn't been updated yet.
 */
export function getEffectiveStatus(invite: Invite): InviteStatus {
  if (invite.status === "pending" && new Date(invite.expiresAt) < new Date()) {
    return "expired";
  }
  return invite.status;
}

const DEFAULT_FILTERS: InviteFilters = {
  status: "all",
  sortBy: "createdAt",
  sortOrder: "desc",
};

export function useInvites(organizationId: string) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InviteFilters>(DEFAULT_FILTERS);

  const fetchInvites = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("invites")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setInvites(((data ?? []) as RawInviteRow[]).map(mapRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invites");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  // Real-time subscription for live invite status updates.
  // Note: requires the invites table to have realtime enabled in Supabase.
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`invites:org:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invites",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => fetchInvites()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, fetchInvites]);

  const createInvite = useCallback(
    async (email: string, role: InviteRole): Promise<InviteActionResult> => {
      if (!organizationId) {
        return { success: false, error: "No organization selected" };
      }

      try {
        const token = crypto.randomUUID();
        const expiresAt = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        const { error: insertError } = await supabase.from("invites").insert({
          email,
          role,
          organization_id: organizationId,
          token,
          status: "pending",
          expires_at: expiresAt,
          // TODO: Replace with Better Auth session user data once auth is integrated
          invited_by: localStorage.getItem("dev_user_id") ?? "dev-user",
          invited_by_email:
            localStorage.getItem("dev_user_email") ?? "dev@example.com",
        });

        if (insertError) throw insertError;

        await fetchInvites();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to send invite",
        };
      }
    },
    [organizationId, fetchInvites]
  );

  const resendInvite = useCallback(
    async (inviteId: string): Promise<InviteActionResult> => {
      try {
        const token = crypto.randomUUID();
        const expiresAt = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        const { error: updateError } = await supabase
          .from("invites")
          .update({ token, status: "pending", expires_at: expiresAt })
          .eq("id", inviteId)
          .eq("organization_id", organizationId);

        if (updateError) throw updateError;

        await fetchInvites();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : "Failed to resend invite",
        };
      }
    },
    [organizationId, fetchInvites]
  );

  const cancelInvite = useCallback(
    async (inviteId: string): Promise<InviteActionResult> => {
      try {
        const { error: updateError } = await supabase
          .from("invites")
          .update({ status: "cancelled" })
          .eq("id", inviteId)
          .eq("organization_id", organizationId);

        if (updateError) throw updateError;

        await fetchInvites();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : "Failed to cancel invite",
        };
      }
    },
    [organizationId, fetchInvites]
  );

  const filteredInvites = useMemo(() => {
    let result = [...invites];

    if (filters.status !== "all") {
      result = result.filter(
        (invite) => getEffectiveStatus(invite) === filters.status
      );
    }

    result.sort((a, b) => {
      const field =
        filters.sortBy === "expiresAt" ? "expiresAt" : "createdAt";
      const aVal = new Date(a[field]).getTime();
      const bVal = new Date(b[field]).getTime();
      return filters.sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [invites, filters]);

  return {
    invites,
    filteredInvites,
    isLoading,
    error,
    filters,
    setFilters,
    createInvite,
    resendInvite,
    cancelInvite,
    refetch: fetchInvites,
  };
}
