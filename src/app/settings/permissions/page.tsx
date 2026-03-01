import type { Metadata } from "next";
import { PermissionsPageClient } from "./PermissionsPageClient";

export const metadata: Metadata = {
  title: "Permissions - QA Suite",
};

export default function PermissionsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Permissions</h2>
        <p className="text-sm text-muted-foreground">
          Control what each role can access and configure across modules.
        </p>
      </div>
      <PermissionsPageClient />
    </div>
  );
}
