"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Mail, User, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import RoleSelect from "@/components/ui/role-select";
import type { InviteRole } from "@/types";
import type { InviteActionResult } from "@/hooks/useInvites";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

function getDefaultRole(currentUserRole: "owner" | "admin"): InviteRole {
  // Admins are restricted to User role only.
  return currentUserRole === "admin" ? "User" : "User";
}

interface FormValues {
  email: string;
  name: string;
  role: InviteRole;
}

interface FormErrors {
  email?: string;
  name?: string;
}

export interface InviteUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    email: string,
    name: string,
    role: InviteRole
  ) => Promise<InviteActionResult>;
  currentUserRole: "owner" | "admin";
}

export default function InviteUserModal({
  open,
  onOpenChange,
  onSubmit,
  currentUserRole,
}: InviteUserModalProps) {
  const [form, setForm] = useState<FormValues>({
    email: "",
    name: "",
    role: getDefaultRole(currentUserRole),
  });
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  // Reset form state when modal opens or closes.
  useEffect(() => {
    if (!open) {
      setForm({ email: "", name: "", role: getDefaultRole(currentUserRole) });
      setFieldErrors({});
      setSubmitError(null);
      setSuccessEmail(null);
      setIsSubmitting(false);
    }
  }, [open, currentUserRole]);

  // Auto-close after successful invite.
  useEffect(() => {
    if (!successEmail) return;
    const timer = setTimeout(() => onOpenChange(false), 1500);
    return () => clearTimeout(timer);
  }, [successEmail, onOpenChange]);

  function validateForm(): FormErrors {
    const errors: FormErrors = {};
    if (!form.email.trim()) {
      errors.email = "Email address is required.";
    } else if (!isValidEmail(form.email.trim())) {
      errors.email = "Please enter a valid email address.";
    }
    if (!form.name.trim()) {
      errors.name = "Full name is required.";
    }
    return errors;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const result = await onSubmit(
        form.email.trim().toLowerCase(),
        form.name.trim(),
        form.role
      );

      if (result.success) {
        setSuccessEmail(form.email.trim());
      } else {
        setSubmitError(
          result.error ?? "Failed to send invite. Please try again."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFieldChange(
    field: keyof FormValues,
    value: string | InviteRole
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field in fieldErrors) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof FormErrors];
        return next;
      });
    }
    setSubmitError(null);
  }

  const isFormDisabled = isSubmitting || !!successEmail;
  const canSubmit =
    !isFormDisabled && form.email.trim() !== "" && form.name.trim() !== "";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/80",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        <DialogPrimitive.Content
          aria-describedby="invite-modal-description"
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-full max-w-md",
            "translate-x-[-50%] translate-y-[-50%]",
            "border bg-background p-6 shadow-lg duration-200 sm:rounded-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          )}
        >
          {/* Close button */}
          <DialogPrimitive.Close
            className={cn(
              "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background",
              "transition-opacity hover:opacity-100",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:pointer-events-none"
            )}
            disabled={isFormDisabled}
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>

          {/* Header */}
          <div className="mb-5 space-y-1.5">
            <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
              Invite Team Member
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              id="invite-modal-description"
              className="text-sm text-muted-foreground"
            >
              Send an email invitation to add someone to your organization.
              Invitations expire after 7 days.
            </DialogPrimitive.Description>
          </div>

          {successEmail ? (
            /* Success state */
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center gap-3 py-6 text-center"
            >
              <CheckCircle
                className="h-10 w-10 text-green-500"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">Invitation sent!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent an invite to{" "}
                  <strong className="text-foreground">{successEmail}</strong>.
                </p>
              </div>
            </div>
          ) : (
            /* Form */
            <form
              onSubmit={handleSubmit}
              noValidate
              aria-label="Invite team member"
            >
              <div className="space-y-4">
                {/* Email field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="invite-modal-email"
                    className="text-sm font-medium leading-none"
                  >
                    Email address{" "}
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                  </label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <input
                      id="invite-modal-email"
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        handleFieldChange("email", e.target.value)
                      }
                      placeholder="colleague@company.com"
                      disabled={isFormDisabled}
                      autoComplete="email"
                      required
                      aria-required="true"
                      aria-invalid={!!fieldErrors.email}
                      aria-describedby={
                        fieldErrors.email
                          ? "invite-modal-email-error"
                          : undefined
                      }
                      className={cn(
                        "h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm",
                        "placeholder:text-muted-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        fieldErrors.email &&
                          "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                  </div>
                  {fieldErrors.email && (
                    <p
                      id="invite-modal-email-error"
                      role="alert"
                      className="flex items-center gap-1 text-xs text-destructive"
                    >
                      <AlertCircle
                        className="h-3 w-3 shrink-0"
                        aria-hidden="true"
                      />
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                {/* Name field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="invite-modal-name"
                    className="text-sm font-medium leading-none"
                  >
                    Full name{" "}
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                  </label>
                  <div className="relative">
                    <User
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <input
                      id="invite-modal-name"
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        handleFieldChange("name", e.target.value)
                      }
                      placeholder="Jane Smith"
                      disabled={isFormDisabled}
                      autoComplete="name"
                      required
                      aria-required="true"
                      aria-invalid={!!fieldErrors.name}
                      aria-describedby={
                        fieldErrors.name
                          ? "invite-modal-name-error"
                          : undefined
                      }
                      className={cn(
                        "h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm",
                        "placeholder:text-muted-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        fieldErrors.name &&
                          "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                  </div>
                  {fieldErrors.name && (
                    <p
                      id="invite-modal-name-error"
                      role="alert"
                      className="flex items-center gap-1 text-xs text-destructive"
                    >
                      <AlertCircle
                        className="h-3 w-3 shrink-0"
                        aria-hidden="true"
                      />
                      {fieldErrors.name}
                    </p>
                  )}
                </div>

                {/* Role field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="invite-modal-role"
                    className="text-sm font-medium leading-none"
                  >
                    Role{" "}
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                  </label>
                  <RoleSelect
                    id="invite-modal-role"
                    value={form.role}
                    onChange={(role) => handleFieldChange("role", role)}
                    currentUserRole={currentUserRole}
                    disabled={isFormDisabled}
                  />
                  {currentUserRole === "admin" && (
                    <p className="text-xs text-muted-foreground">
                      As an Admin, you can only invite Users.
                    </p>
                  )}
                </div>

                {/* Submit error */}
                {submitError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    <AlertCircle
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    {submitError}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogPrimitive.Close asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isFormDisabled}
                  >
                    Cancel
                  </Button>
                </DialogPrimitive.Close>
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  aria-label={
                    isSubmitting ? "Sending invitation…" : "Send invitation"
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Sending…
                    </>
                  ) : (
                    "Send Invite"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
