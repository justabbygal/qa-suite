import type { Metadata } from "next";

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
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Permission management UI coming soon.
      </div>
    </div>
  );
}
