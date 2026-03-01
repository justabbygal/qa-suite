"use client";

import { useState, useEffect } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import InviteUserModal from "@/components/users/InviteUserModal";
import { createInvite } from "@/lib/api/invites";
import { useUserRole, canAccessPermissions } from "@/hooks/useUserRole";
import type { InviteRole } from "@/types";
import type { InviteActionResult } from "@/hooks/useInvites";

export default function InviteButton() {
  const userRole = useUserRole();
  const [isOpen, setIsOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState("");

  useEffect(() => {
    // TODO: Replace with Better Auth organization context once auth is integrated.
    const orgId =
      localStorage.getItem("dev_organization_id") ?? "dev-org-id";
    setOrganizationId(orgId);
  }, []);

  // Only Owners and Admins can invite users.
  if (!canAccessPermissions(userRole)) return null;

  async function handleSubmit(
    email: string,
    name: string,
    role: InviteRole
  ): Promise<InviteActionResult> {
    try {
      await createInvite({ email, name, role, organizationId });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "Failed to send invite.",
      };
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} aria-haspopup="dialog">
        <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
        Invite User
      </Button>

      <InviteUserModal
        open={isOpen}
        onOpenChange={setIsOpen}
        onSubmit={handleSubmit}
        currentUserRole={userRole as "owner" | "admin"}
      />
    </>
  );
}
