"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { changeUserRole, type ChangeRoleValue } from "@/lib/api/users";
import {
  ROLE_DISPLAY,
  getAssignableRoles,
  canManageTargetUser,
  getRoleChangeImpact,
  type UIRole,
} from "@/lib/utils/roleHierarchy";

export interface TargetUser {
  id: string;
  name: string;
  email: string;
  role: UIRole;
}

export interface ChangeRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user whose role is being changed. */
  targetUser: TargetUser;
  /** The role of the person performing the change. */
  actorRole: UIRole;
  /** The organization both users belong to. */
  organizationId: string;
  /** Called after a successful role change with the updated role. */
  onSuccess?: (userId: string, newRole: UIRole) => void;
}

type Step = "select" | "confirm";

function toApiRole(role: UIRole): ChangeRoleValue {
  return (role.charAt(0).toUpperCase() + role.slice(1)) as ChangeRoleValue;
}

interface RoleOptionProps {
  role: UIRole;
  selected: boolean;
  disabled: boolean;
  disabledReason: string;
  isCurrent: boolean;
  onSelect: () => void;
}

function RoleOption({
  role,
  selected,
  disabled,
  disabledReason,
  isCurrent,
  onSelect,
}: RoleOptionProps) {
  const info = ROLE_DISPLAY[role];
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${info.label}${isCurrent ? " (current)" : ""}${disabled ? " — " + disabledReason : ""}`}
      className={[
        "w-full text-left rounded-lg border p-4 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-accent",
        selected && !disabled
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-input bg-background",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium leading-none">{info.label}</span>
        <span className="flex items-center gap-1.5">
          {isCurrent && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              Current
            </span>
          )}
          {selected && !isCurrent && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              Selected
            </span>
          )}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
        {disabled ? disabledReason : info.description}
      </p>
    </button>
  );
}

export function ChangeRoleModal({
  open,
  onOpenChange,
  targetUser,
  actorRole,
  organizationId,
  onSuccess,
}: ChangeRoleModalProps) {
  const [step, setStep] = React.useState<Step>("select");
  const [selectedRole, setSelectedRole] = React.useState<UIRole | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setStep("select");
      setSelectedRole(null);
      setIsSubmitting(false);
      setError(null);
    }
  }, [open]);

  const assignableRoles = getAssignableRoles(actorRole);
  const canManage = canManageTargetUser(actorRole, targetUser.role);
  const allRoles: UIRole[] = ["owner", "admin", "user"];

  function isRoleDisabled(role: UIRole): boolean {
    if (!canManage) return true;
    return !assignableRoles.includes(role);
  }

  function getDisabledReason(role: UIRole): string {
    if (!canManage) return `You cannot manage a ${ROLE_DISPLAY[targetUser.role].label}.`;
    if (!assignableRoles.includes(role)) return `Your role does not allow assigning ${ROLE_DISPLAY[role].label}.`;
    return "";
  }

  const canProceed =
    selectedRole !== null &&
    selectedRole !== targetUser.role &&
    !isRoleDisabled(selectedRole);

  async function handleConfirm() {
    if (!selectedRole) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await changeUserRole({ userId: targetUser.id, organizationId, newRole: toApiRole(selectedRole) });
      onSuccess?.(targetUser.id, selectedRole);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    if (!isSubmitting) onOpenChange(false);
  }

  if (step === "select") {
    return (
      <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel(); }}>
        <AlertDialogContent aria-describedby="change-role-description">
          <AlertDialogHeader>
            <AlertDialogTitle>Change role</AlertDialogTitle>
            <AlertDialogDescription id="change-role-description">
              Select a new role for{" "}
              <span className="font-medium text-foreground">{targetUser.name}</span>
              {" "}({targetUser.email}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!canManage && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              You do not have permission to change the role of a {ROLE_DISPLAY[targetUser.role].label}.
            </div>
          )}
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Available roles">
            {allRoles.map((role) => (
              <RoleOption
                key={role}
                role={role}
                selected={selectedRole === role}
                isCurrent={role === targetUser.role}
                disabled={isRoleDisabled(role)}
                disabledReason={getDisabledReason(role)}
                onSelect={() => setSelectedRole(role)}
              />
            ))}
          </div>
          {error && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel} autoFocus>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setStep("confirm")}
              disabled={!canProceed}
              className="disabled:pointer-events-none disabled:opacity-50"
            >
              Review change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const impact = selectedRole ? getRoleChangeImpact(targetUser.role, selectedRole) : "";

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel(); }}>
      <AlertDialogContent aria-describedby="confirm-role-description">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm role change</AlertDialogTitle>
          <AlertDialogDescription id="confirm-role-description">
            You are about to change{" "}
            <span className="font-medium text-foreground">{targetUser.name}</span>
            {"'"}s role from{" "}
            <span className="font-medium text-foreground">
              {ROLE_DISPLAY[targetUser.role].label}
            </span>{" "}
            to{" "}
            <span className="font-medium text-foreground">
              {selectedRole ? ROLE_DISPLAY[selectedRole].label : ""}
            </span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
          {impact}
        </div>
        {error && (
          <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => { setStep("select"); setError(null); }}
            disabled={isSubmitting}
          >
            Back
          </Button>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="disabled:pointer-events-none disabled:opacity-50"
          >
            {isSubmitting ? "Changing role…" : "Confirm change"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}