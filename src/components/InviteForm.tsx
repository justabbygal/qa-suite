"use client";

import { useState } from "react";
import { Mail, UserPlus, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import type { InviteRole } from "@/types";
import type { InviteActionResult } from "@/hooks/useInvites";

interface RoleOption {
  value: InviteRole;
  label: string;
}

const ADMIN_ROLE_OPTIONS: RoleOption[] = [
  { value: "Admin", label: "Admin" },
  { value: "User", label: "User" },
];

const OWNER_ROLE_OPTIONS: RoleOption[] = [
  { value: "Owner", label: "Owner" },
  ...ADMIN_ROLE_OPTIONS,
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface InviteFormProps {
  onSubmit: (email: string, role: InviteRole) => Promise<InviteActionResult>;
  currentUserRole: "owner" | "admin";
}

export default function InviteForm({
  onSubmit,
  currentUserRole,
}: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("User");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const roleOptions =
    currentUserRole === "owner" ? OWNER_ROLE_OPTIONS : ADMIN_ROLE_OPTIONS;

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmail(e.target.value);
    setFieldError(null);
    setSubmitError(null);
    setSuccessEmail(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setFieldError("Email address is required.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setFieldError("Please enter a valid email address.");
      return;
    }

    setFieldError(null);
    setSubmitError(null);
    setSuccessEmail(null);
    setIsSubmitting(true);

    try {
      const result = await onSubmit(trimmedEmail.toLowerCase(), role);
      if (result.success) {
        setSuccessEmail(trimmedEmail);
        setEmail("");
        setRole("User");
      } else {
        setSubmitError(
          result.error ?? "Failed to send invite. Please try again."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const errorMessage = fieldError ?? submitError;
  const errorId = errorMessage ? "invite-form-error" : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserPlus className="h-5 w-5" aria-hidden="true" />
          Invite Team Member
        </CardTitle>
        <CardDescription>
          Send an email invitation to add someone to your organization.
          Invitations expire after 7 days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label="Invite team member"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {/* Email field */}
            <div className="flex-1 space-y-1.5">
              <label
                htmlFor="invite-email"
                className="text-sm font-medium leading-none"
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="colleague@company.com"
                  disabled={isSubmitting}
                  autoComplete="email"
                  required
                  aria-required="true"
                  aria-invalid={!!fieldError}
                  aria-describedby={errorId}
                  className={cn(
                    "h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    fieldError &&
                      "border-destructive focus-visible:ring-destructive"
                  )}
                />
              </div>
            </div>

            {/* Role field */}
            <div className="space-y-1.5">
              <label
                htmlFor="invite-role"
                className="text-sm font-medium leading-none"
              >
                Role
              </label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as InviteRole)}
                disabled={isSubmitting}
                aria-label="Role for the invitee"
                className={cn(
                  "h-10 rounded-md border border-input bg-background px-3 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Submit button */}
            <Button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className="shrink-0"
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

          {/* Error feedback */}
          {errorMessage && (
            <div
              id={errorId}
              role="alert"
              aria-live="assertive"
              className="mt-3 flex items-center gap-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {errorMessage}
            </div>
          )}

          {/* Success feedback */}
          {successEmail && !errorMessage && (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400"
            >
              <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Invite sent to <strong>{successEmail}</strong>.
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
