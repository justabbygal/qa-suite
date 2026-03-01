import type { Metadata } from "next";
import SettingsNavigation from "@/components/settings/SettingsNavigation";
import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";

export const metadata: Metadata = {
  title: "Settings - QA Suite",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header with breadcrumb */}
      <header className="border-b px-6 py-4">
        <SettingsBreadcrumb />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1">
        {/* Sidebar navigation */}
        <aside
          className="hidden w-56 shrink-0 border-r p-4 sm:block"
          aria-label="Settings sections"
        >
          <SettingsNavigation />
        </aside>

        {/* Mobile navigation */}
        <div className="border-b p-3 sm:hidden w-full">
          <SettingsNavigation />
        </div>

        {/* Page content */}
        <main
          className="flex-1 p-6"
          id="settings-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
