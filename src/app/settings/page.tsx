import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "General Settings - QA Suite",
};

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">
          Manage your organization settings and preferences.
        </p>
      </div>
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        General settings content coming soon.
      </div>
    </div>
  );
}
