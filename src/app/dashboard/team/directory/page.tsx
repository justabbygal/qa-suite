"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { getProfiles } from "@/modules/user-management/lib/profileService";
import { UserDirectory } from "@/components/profiles/UserDirectory";
import { ProfileEditModal } from "@/components/profiles/ProfileEditModal";
import { useProfileEdit } from "@/hooks/useProfileEdit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { UserProfile, UserRole } from "@/modules/user-management/types/profile";

/**
 * Converts the lowercase role returned by useUserRole() to the capitalized
 * UserRole format used by profile components.
 * TODO: Remove once Better Auth is integrated and roles are capitalized at source.
 */
function toUserRole(role: string): UserRole {
  return (role.charAt(0).toUpperCase() + role.slice(1)) as UserRole;
}

/**
 * Team Directory page — visible to all roles.
 *
 * Organisation ID and user ID are sourced from localStorage for development.
 * TODO: Replace with Better Auth session context once auth is integrated.
 */
export default function TeamDirectoryPage() {
  const rawRole = useUserRole();
  const userRole: UserRole = toUserRole(rawRole);

  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("dev_organization_id") ?? "dev-org-id";
    const uid = localStorage.getItem("dev_user_id") ?? "dev-user-id";
    setOrganizationId(orgId);
    setUserId(uid);
  }, []);

  const loadProfiles = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const response = await getProfiles({ organization_id: organizationId, per_page: 100 });
      setProfiles(response.data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load team members");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) loadProfiles();
  }, [organizationId, loadProfiles]);

  const { editState, openEdit, closeEdit, saveProfile, saveEmail, canEditEmailField } =
    useProfileEdit({
      currentUserId: userId,
      currentUserRole: userRole,
      organizationId,
      onSaveSuccess: (updated) => {
        setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      },
    });

  const handleDeleteConfirm = async () => {
    if (!profileToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/users/" + profileToDelete.user_id, {
        method: "DELETE",
        headers: {
          "x-user-id": userId,
          "x-organization-id": organizationId,
          "x-user-role": userRole,
        },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: { userMessage?: string } };
        throw new Error(json?.error?.userMessage ?? "Failed to remove member");
      }
      setProfiles((prev) => prev.filter((p) => p.id !== profileToDelete.id));
      setProfileToDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-6 py-4">
        <Breadcrumb />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Team Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse and search all members in your organization.
        </p>
      </header>

      <main className="flex-1 p-6" id="directory-content" tabIndex={-1}>
        <div className="mx-auto max-w-5xl">
          {fetchError ? (
            <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {fetchError}{' '}
              <button type="button" onClick={loadProfiles} className="underline hover:no-underline">
                Try again
              </button>
            </div>
          ) : (
            <UserDirectory
              profiles={profiles}
              currentUserId={userId}
              currentUserRole={userRole}
              isLoading={isLoading}
              onEditProfile={openEdit}
              onDeleteProfile={setProfileToDelete}
            />
          )}
        </div>
      </main>

      <ProfileEditModal
        profile={editState.profile}
        open={editState.isOpen}
        currentUserId={userId}
        currentUserRole={userRole}
        isSubmitting={editState.isSubmitting}
        error={editState.error}
        successMessage={editState.successMessage}
        onClose={closeEdit}
        onSaveProfile={saveProfile}
        onSaveEmail={saveEmail}
        canEditEmail={canEditEmailField}
      />

      <AlertDialog
        open={!!profileToDelete}
        onOpenChange={(open) => { if (!open) { setProfileToDelete(null); setDeleteError(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{profileToDelete?.display_name}</strong> from your
              organization. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive px-1">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded">
        Home
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">Team</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span aria-current="page" className="font-medium">Directory</span>
    </nav>
  );
}