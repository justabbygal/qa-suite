import type { Metadata } from "next";
import { PermissionLayout } from "@/components/permissions/PermissionLayout";

export const metadata: Metadata = {
  title: "Permissions - QA Suite",
};

export default function PermissionsPage() {
  // TODO: Replace "dev-org" with the real organization ID from the authenticated session
  // once Better Auth is integrated.
  return <PermissionLayout organizationId="dev-org" />;
}
