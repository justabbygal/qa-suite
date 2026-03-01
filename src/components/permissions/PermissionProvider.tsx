"use client";

import { createContext, useCallback, useContext } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";

import type { RegisteredModule } from "@/lib/modules/types";
import type { Role } from "@/lib/modules/types";
import {
  usePermissions,
  type UsePermissionsReturn,
} from "@/hooks/usePermissions";
import { toast, useToast } from "@/hooks/use-toast";
import type {
  BulkUpdateItem,
  BulkUpdateResult,
  PermissionField,
} from "@/lib/utils/permission-state";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PermissionContextValue extends UsePermissionsReturn {
  /** Fire a toast notification directly from any child component. */
  addToast: (type: "success" | "error", message: string) => void;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

// ---------------------------------------------------------------------------
// Internal Toaster — renders active toasts using Radix UI
// ---------------------------------------------------------------------------

function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map(({ id, title, variant, open, onOpenChange }) => (
        <ToastPrimitive.Root
          key={id}
          open={open}
          onOpenChange={(isOpen) => {
            onOpenChange?.(isOpen);
            if (!isOpen) dismiss(id);
          }}
          duration={5000}
          className={[
            "pointer-events-auto flex items-center justify-between gap-4",
            "rounded-md border px-4 py-3 shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=open]:slide-in-from-right-4",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            "data-[state=closed]:slide-out-to-right-4",
            variant === "destructive"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : variant === "success"
                ? "border-border bg-background text-foreground"
                : "border-border bg-background text-foreground",
          ].join(" ")}
        >
          <ToastPrimitive.Title className="text-sm font-medium">
            <span className="mr-1.5" aria-hidden="true">
              {variant === "destructive" ? "✕" : "✓"}
            </span>
            {title}
          </ToastPrimitive.Title>

          <ToastPrimitive.Close
            aria-label="Dismiss notification"
            className="rounded p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}

      <ToastPrimitive.Viewport
        aria-label="Notifications"
        className={[
          "fixed bottom-4 right-4 z-[100]",
          "flex flex-col gap-2",
          "w-[360px] max-w-[calc(100vw-2rem)]",
          "outline-none",
        ].join(" ")}
      />
    </ToastPrimitive.Provider>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface PermissionProviderProps {
  organizationId: string;
  children: React.ReactNode;
}

export function PermissionProvider({
  organizationId,
  children,
}: PermissionProviderProps) {
  const addToast = useCallback(
    (type: "success" | "error", message: string) => {
      toast({
        title: message,
        variant: type === "error" ? "destructive" : "success",
      });
    },
    []
  );

  const permissionsState = usePermissions({
    organizationId,
    onToast: addToast,
  });

  return (
    <PermissionContext.Provider value={{ ...permissionsState, addToast }}>
      {children}
      <Toaster />
    </PermissionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Returns permission state and mutation helpers from the nearest
 * PermissionProvider. Must be rendered inside a PermissionProvider.
 */
export function usePermissionContext(): PermissionContextValue {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error(
      "usePermissionContext must be used within a <PermissionProvider>"
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Re-exports for child component convenience
// ---------------------------------------------------------------------------

export type {
  RegisteredModule,
  Role,
  PermissionField,
  BulkUpdateItem,
  BulkUpdateResult,
};
