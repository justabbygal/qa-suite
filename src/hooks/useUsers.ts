"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { getEffectiveStatus } from "@/hooks/useInvites";
import type { UserEntry, UserEntryRole, UserStatus } from "@/lib/api/users";

export type { UserEntry, UserEntryRole, UserStatus };

export interface UserFilters {
  search: string;
  role: UserEntryRole | "all";
  status: UserStatus | "all";
  page: number;
}

const PAGE_SIZE = 20;

const DEFAULT_FILTERS: UserFilters = {
  search: "",
  role: "all",
  status: "all",
  page: 1,
};

// ---------------------------------------------------------------------------
// Raw DB row shapes
// ---------------------------------------------------------------------------

interface RawProfileRow {
  id: string;
  user_id: string;
  organization_id: string;
  display_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  created_at: string;
  updated_at: string;
}

interface RawInviteRow {
  id: string;
  email: string;
  role: string;
  organization_id: string;
  status: string;
  expires_at: string;
  invited_by_email: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Row to UserEntry mappers
// ---------------------------------------------------------------------------

function mapProfile(row: RawProfileRow): UserEntry {
  return {
    id: row.id,
    type: "user",
    name: row.display_name,
    email: row.email,
    role: row.role as UserEntryRole,
    status: "active",
    userId: row.user_id,
    avatarUrl: row.avatar_url,
    jobTitle: row.job_title,
    department: row.department,
    createdAt: row.created_at,
  };
}

function mapInvite(row: RawInviteRow): UserEntry {
  // Reuse getEffectiveStatus from useInvites to derive display status
  const effective = getEffectiveStatus({
    id: row.id,
    email: row.email,
    role: row.role as UserEntryRole,
    organizationId: row.organization_id,
    token: "",
    status: row.status as "pending" | "accepted" | "expired" | "cancelled",
    expiresAt: row.expires_at,
    invitedBy: "",
    invitedByEmail: row.invited_by_email,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  });

  return {
    id: row.id,
    type: "invite",
    name: row.email,
    email: row.email,
    role: row.role as UserEntryRole,
    status: effective === "pending" ? "invited" : "expired",
    expiresAt: row.expires_at,
    invitedBy: row.invited_by_email,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches and merges active org members (profiles table) with pending
 * invitations (invites table) into a single unified UserEntry list.
 *
 * Provides search, role, and status filtering plus client-side pagination,
 * and keeps the list up-to-date via Supabase real-time subscriptions.
 */
export function useUsers(organizationId: string) {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<UserFilters>(DEFAULT_FILTERS);

  const fetchUsers = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [profilesResult, invitesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, user_id, organization_id, display_name, email, role, avatar_url, job_title, department, created_at, updated_at"
          )
          .eq("organization_id", organizationId)
          .order("display_name"),

        // Only fetch pending invites; getEffectiveStatus handles expired display
        supabase
          .from("invites")
          .select(
            "id, email, role, organization_id, status, expires_at, invited_by_email, created_at"
          )
          .eq("organization_id", organizationId)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (invitesResult.error) throw invitesResult.error;

      const profileEntries = (
        (profilesResult.data ?? []) as RawProfileRow[]
      ).map(mapProfile);

      const inviteEntries = (
        (invitesResult.data ?? []) as RawInviteRow[]
      ).map(mapInvite);

      setUsers([...profileEntries, ...inviteEntries]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Real-time subscriptions for both profiles and invites tables
  useEffect(() => {
    if (!organizationId) return;

    const profilesChannel = supabase
      .channel(`users:profiles:org:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => fetchUsers()
      )
      .subscribe();

    const invitesChannel = supabase
      .channel(`users:invites:org:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invites",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => fetchUsers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(invitesChannel);
    };
  }, [organizationId, fetchUsers]);

  const updateFilters = useCallback((update: Partial<UserFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...update,
      // Reset to page 1 whenever any filter other than page itself changes
      page: "page" in update ? (update.page ?? 1) : 1,
    }));
  }, []);

  const filteredUsers = useMemo(() => {
    let result = [...users];

    const q = filters.search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }

    if (filters.role !== "all") {
      result = result.filter((u) => u.role === filters.role);
    }

    if (filters.status !== "all") {
      result = result.filter((u) => u.status === filters.status);
    }

    return result;
  }, [users, filters.search, filters.role, filters.status]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));

  const paginatedUsers = useMemo(() => {
    const start = (filters.page - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, filters.page]);

  return {
    /** All entries (unfiltered) */
    users,
    /** Entries after search/role/status filters */
    filteredUsers,
    /** Current page of filtered entries */
    paginatedUsers,
    totalPages,
    pageSize: PAGE_SIZE,
    isLoading,
    error,
    filters,
    updateFilters,
    refetch: fetchUsers,
  };
}
