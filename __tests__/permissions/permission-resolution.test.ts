import {
  resolvePermission,
  shouldShowElement,
} from "@/lib/permissions/service";
import { registerModule, clearRegistry } from "@/lib/permissions/registry";
import type { ModuleManifest, PermissionOverride } from "@/lib/permissions/types";

// ---------------------------------------------------------------------------
// Test module fixtures
// ---------------------------------------------------------------------------

const ANALYTICS_MODULE: ModuleManifest = {
  module: "analytics",
  displayName: "Analytics",
  hasSettings: true,
  defaultAccess: {
    owner: { featureAccess: true, settingsAccess: true },
    admin: { featureAccess: true, settingsAccess: false },
    user: { featureAccess: false, settingsAccess: false },
  },
};

const REPORTS_MODULE: ModuleManifest = {
  module: "reports",
  displayName: "Reports",
  hasSettings: false,
  defaultAccess: {
    owner: { featureAccess: true, settingsAccess: false },
    admin: { featureAccess: true, settingsAccess: false },
    user: { featureAccess: true, settingsAccess: false },
  },
};

const ADMIN_CONSOLE_MODULE: ModuleManifest = {
  module: "admin-console",
  displayName: "Admin Console",
  hasSettings: true,
  defaultAccess: {
    owner: { featureAccess: true, settingsAccess: true },
    admin: { featureAccess: true, settingsAccess: true },
    user: { featureAccess: false, settingsAccess: false },
  },
};

const OWNER_ONLY_MODULE: ModuleManifest = {
  module: "owner-settings",
  displayName: "Owner Settings",
  hasSettings: true,
  defaultAccess: {
    owner: { featureAccess: true, settingsAccess: true },
    admin: { featureAccess: false, settingsAccess: false },
    user: { featureAccess: false, settingsAccess: false },
  },
};

// ---------------------------------------------------------------------------

describe("Permission Resolution", () => {
  beforeEach(() => {
    clearRegistry();
    registerModule(ANALYTICS_MODULE);
    registerModule(REPORTS_MODULE);
    registerModule(ADMIN_CONSOLE_MODULE);
    registerModule(OWNER_ONLY_MODULE);
  });

  afterEach(() => {
    clearRegistry();
  });

  // ---------------------------------------------------------------------------
  // Default access – owner
  // ---------------------------------------------------------------------------

  describe("default access – owner role", () => {
    it("can use analytics", () => {
      expect(resolvePermission("owner", "analytics").canUse).toBe(true);
    });

    it("can configure analytics settings", () => {
      expect(resolvePermission("owner", "analytics").canConfigure).toBe(true);
    });

    it("can use reports", () => {
      expect(resolvePermission("owner", "reports").canUse).toBe(true);
    });

    it("cannot configure reports (module has no settings)", () => {
      expect(resolvePermission("owner", "reports").canConfigure).toBe(false);
    });

    it("can use admin console", () => {
      expect(resolvePermission("owner", "admin-console").canUse).toBe(true);
    });

    it("can configure admin console", () => {
      expect(resolvePermission("owner", "admin-console").canConfigure).toBe(true);
    });

    it("can use owner-only module", () => {
      expect(resolvePermission("owner", "owner-settings").canUse).toBe(true);
    });

    it("can configure owner-only module", () => {
      expect(resolvePermission("owner", "owner-settings").canConfigure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Default access – admin
  // ---------------------------------------------------------------------------

  describe("default access – admin role", () => {
    it("can use analytics", () => {
      expect(resolvePermission("admin", "analytics").canUse).toBe(true);
    });

    it("cannot configure analytics settings (settingsAccess=false by default)", () => {
      expect(resolvePermission("admin", "analytics").canConfigure).toBe(false);
    });

    it("can use reports", () => {
      expect(resolvePermission("admin", "reports").canUse).toBe(true);
    });

    it("can use admin console", () => {
      expect(resolvePermission("admin", "admin-console").canUse).toBe(true);
    });

    it("can configure admin console", () => {
      expect(resolvePermission("admin", "admin-console").canConfigure).toBe(true);
    });

    it("cannot use owner-only module", () => {
      expect(resolvePermission("admin", "owner-settings").canUse).toBe(false);
    });

    it("cannot configure owner-only module", () => {
      expect(resolvePermission("admin", "owner-settings").canConfigure).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Default access – user
  // ---------------------------------------------------------------------------

  describe("default access – user role", () => {
    it("cannot use analytics", () => {
      expect(resolvePermission("user", "analytics").canUse).toBe(false);
    });

    it("cannot configure analytics", () => {
      expect(resolvePermission("user", "analytics").canConfigure).toBe(false);
    });

    it("can use reports (open to all roles)", () => {
      expect(resolvePermission("user", "reports").canUse).toBe(true);
    });

    it("cannot configure reports (no settings on the module)", () => {
      expect(resolvePermission("user", "reports").canConfigure).toBe(false);
    });

    it("cannot use admin console", () => {
      expect(resolvePermission("user", "admin-console").canUse).toBe(false);
    });

    it("cannot configure admin console", () => {
      expect(resolvePermission("user", "admin-console").canConfigure).toBe(false);
    });

    it("cannot use owner-only module", () => {
      expect(resolvePermission("user", "owner-settings").canUse).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // featureAccess=false always implies canConfigure=false
  // ---------------------------------------------------------------------------

  describe("featureAccess=false implies canConfigure=false", () => {
    it("user cannot configure analytics when featureAccess is denied", () => {
      const perm = resolvePermission("user", "analytics");
      expect(perm.canUse).toBe(false);
      expect(perm.canConfigure).toBe(false);
    });

    it("user cannot configure admin-console when featureAccess is denied", () => {
      const perm = resolvePermission("user", "admin-console");
      expect(perm.canUse).toBe(false);
      expect(perm.canConfigure).toBe(false);
    });

    it("admin cannot configure analytics when only settingsAccess is denied", () => {
      // featureAccess=true but settingsAccess=false → canConfigure must be false
      const perm = resolvePermission("admin", "analytics");
      expect(perm.canUse).toBe(true);
      expect(perm.canConfigure).toBe(false);
    });

    it("settingsAccess=true is irrelevant when featureAccess=false", () => {
      registerModule({
        module: "edge-case-module",
        displayName: "Edge Case",
        hasSettings: true,
        defaultAccess: {
          owner: { featureAccess: true, settingsAccess: true },
          // Contradictory: featureAccess=false but settingsAccess=true
          admin: { featureAccess: false, settingsAccess: true },
          user: { featureAccess: false, settingsAccess: false },
        },
      });
      const perm = resolvePermission("admin", "edge-case-module");
      expect(perm.canUse).toBe(false);
      expect(perm.canConfigure).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Unregistered modules
  // ---------------------------------------------------------------------------

  describe("unregistered module", () => {
    it("denies canUse for an unregistered module", () => {
      expect(resolvePermission("owner", "not-a-module").canUse).toBe(false);
    });

    it("denies canConfigure for an unregistered module", () => {
      expect(resolvePermission("owner", "not-a-module").canConfigure).toBe(false);
    });

    it("denies access for all roles when module is unregistered", () => {
      const roles = ["owner", "admin", "user"] as const;
      for (const role of roles) {
        const perm = resolvePermission(role, "phantom-module");
        expect(perm.canUse).toBe(false);
        expect(perm.canConfigure).toBe(false);
      }
    });

    it("denies access even for owner role on an unregistered module", () => {
      const perm = resolvePermission("owner", "totally-unknown");
      expect(perm.canUse).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Org-level permission overrides
  // ---------------------------------------------------------------------------

  describe("org-level permission overrides", () => {
    const orgId = "org-123";

    it("override grants featureAccess when the default denies it", () => {
      const overrides: PermissionOverride[] = [
        {
          organizationId: orgId,
          module: "analytics",
          role: "user",
          featureAccess: true,
          settingsAccess: false,
        },
      ];
      expect(resolvePermission("user", "analytics", overrides).canUse).toBe(true);
    });

    it("override revokes featureAccess when the default grants it", () => {
      const overrides: PermissionOverride[] = [
        {
          organizationId: orgId,
          module: "analytics",
          role: "admin",
          featureAccess: false,
          settingsAccess: false,
        },
      ];
      expect(resolvePermission("admin", "analytics", overrides).canUse).toBe(false);
    });

    it("override grants settingsAccess on top of featureAccess", () => {
      const overrides: PermissionOverride[] = [
        {
          organizationId: orgId,
          module: "analytics",
          role: "admin",
          featureAccess: true,
          settingsAccess: true,
        },
      ];
      const perm = resolvePermission("admin", "analytics", overrides);
      expect(perm.canUse).toBe(true);
      expect(perm.canConfigure).toBe(true);
    });

    it("override for one role does not affect other roles", () => {
      const overrides: PermissionOverride[] = [
        {
          organizationId: orgId,
          module: "analytics",
          role: "user",
          featureAccess: true,
          settingsAccess: false,
        },
      ];
      // Admin should still follow the default (featureAccess=true, settingsAccess=false)
      const adminPerm = resolvePermission("admin", "analytics", overrides);
      expect(adminPerm.canUse).toBe(true);
      expect(adminPerm.canConfigure).toBe(false);
    });

    it("override for one module does not affect other modules", () => {
      const overrides: PermissionOverride[] = [
        {
          organizationId: orgId,
          module: "analytics",
          role: "user",
          featureAccess: true,
          settingsAccess: false,
        },
      ];
      // Reports default for user is featureAccess=true
      expect(resolvePermission("user", "reports", overrides).canUse).toBe(true);
    });

    it("override takes precedence over module defaults for the owner", () => {
      const overrides: PermissionOverride[] = [
        {
          organizationId: orgId,
          module: "analytics",
          role: "owner",
          featureAccess: false,
          settingsAccess: false,
        },
      ];
      const perm = resolvePermission("owner", "analytics", overrides);
      expect(perm.canUse).toBe(false);
      expect(perm.canConfigure).toBe(false);
    });

    it("falls back to defaults when no override matches the module", () => {
      const overrides: PermissionOverride[] = [
        {
          organizationId: orgId,
          module: "reports", // different module
          role: "user",
          featureAccess: false,
          settingsAccess: false,
        },
      ];
      // analytics default for user: featureAccess=false
      expect(resolvePermission("user", "analytics", overrides).canUse).toBe(false);
    });

    it("falls back to defaults when no override matches the role", () => {
      const overrides: PermissionOverride[] = [
        {
          organizationId: orgId,
          module: "analytics",
          role: "user", // different role
          featureAccess: true,
          settingsAccess: true,
        },
      ];
      // admin default for analytics: featureAccess=true, settingsAccess=false
      const perm = resolvePermission("admin", "analytics", overrides);
      expect(perm.canUse).toBe(true);
      expect(perm.canConfigure).toBe(false);
    });

    it("settingsAccess override is ignored when featureAccess override is false", () => {
      const overrides: PermissionOverride[] = [
        {
          organizationId: orgId,
          module: "analytics",
          role: "admin",
          featureAccess: false,
          settingsAccess: true, // contradictory – should be ignored
        },
      ];
      const perm = resolvePermission("admin", "analytics", overrides);
      expect(perm.canUse).toBe(false);
      expect(perm.canConfigure).toBe(false);
    });

    it("empty overrides array falls back to module defaults", () => {
      const perm = resolvePermission("owner", "analytics", []);
      expect(perm.canUse).toBe(true);
      expect(perm.canConfigure).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // shouldShowElement – UI gating helper
  // ---------------------------------------------------------------------------

  describe("shouldShowElement", () => {
    it("shows element when canUse=true and requireSettings=false (default)", () => {
      expect(shouldShowElement({ canUse: true, canConfigure: false })).toBe(true);
    });

    it("hides element when canUse=false", () => {
      expect(shouldShowElement({ canUse: false, canConfigure: false })).toBe(false);
    });

    it("shows element when requireSettings=true and canConfigure=true", () => {
      expect(
        shouldShowElement({ canUse: true, canConfigure: true }, true)
      ).toBe(true);
    });

    it("hides element when requireSettings=true but canConfigure=false", () => {
      expect(
        shouldShowElement({ canUse: true, canConfigure: false }, true)
      ).toBe(false);
    });

    it("hides element when requireSettings=true and canUse=false", () => {
      expect(
        shouldShowElement({ canUse: false, canConfigure: false }, true)
      ).toBe(false);
    });

    it("owner: can see feature elements for analytics", () => {
      const perm = resolvePermission("owner", "analytics");
      expect(shouldShowElement(perm)).toBe(true);
    });

    it("owner: can see settings elements for analytics", () => {
      const perm = resolvePermission("owner", "analytics");
      expect(shouldShowElement(perm, true)).toBe(true);
    });

    it("admin: can see feature elements for analytics", () => {
      const perm = resolvePermission("admin", "analytics");
      expect(shouldShowElement(perm)).toBe(true);
    });

    it("admin: cannot see settings elements for analytics (no settings access by default)", () => {
      const perm = resolvePermission("admin", "analytics");
      expect(shouldShowElement(perm, true)).toBe(false);
    });

    it("user: cannot see feature elements for analytics", () => {
      const perm = resolvePermission("user", "analytics");
      expect(shouldShowElement(perm)).toBe(false);
    });

    it("user: cannot see settings elements for analytics", () => {
      const perm = resolvePermission("user", "analytics");
      expect(shouldShowElement(perm, true)).toBe(false);
    });

    it("user: can see reports feature (open to all)", () => {
      const perm = resolvePermission("user", "reports");
      expect(shouldShowElement(perm)).toBe(true);
    });

    it("user: cannot see owner-settings feature", () => {
      const perm = resolvePermission("user", "owner-settings");
      expect(shouldShowElement(perm)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // All role × module combinations
  // ---------------------------------------------------------------------------

  describe("exhaustive role × module combination coverage", () => {
    const cases: Array<{
      role: "owner" | "admin" | "user";
      module: string;
      canUse: boolean;
      canConfigure: boolean;
    }> = [
      // analytics
      { role: "owner", module: "analytics", canUse: true, canConfigure: true },
      { role: "admin", module: "analytics", canUse: true, canConfigure: false },
      { role: "user", module: "analytics", canUse: false, canConfigure: false },
      // reports
      { role: "owner", module: "reports", canUse: true, canConfigure: false },
      { role: "admin", module: "reports", canUse: true, canConfigure: false },
      { role: "user", module: "reports", canUse: true, canConfigure: false },
      // admin-console
      {
        role: "owner",
        module: "admin-console",
        canUse: true,
        canConfigure: true,
      },
      {
        role: "admin",
        module: "admin-console",
        canUse: true,
        canConfigure: true,
      },
      {
        role: "user",
        module: "admin-console",
        canUse: false,
        canConfigure: false,
      },
      // owner-settings
      {
        role: "owner",
        module: "owner-settings",
        canUse: true,
        canConfigure: true,
      },
      {
        role: "admin",
        module: "owner-settings",
        canUse: false,
        canConfigure: false,
      },
      {
        role: "user",
        module: "owner-settings",
        canUse: false,
        canConfigure: false,
      },
    ];

    it.each(cases)(
      "$role on $module: canUse=$canUse, canConfigure=$canConfigure",
      ({ role, module, canUse, canConfigure }) => {
        const perm = resolvePermission(role, module);
        expect(perm.canUse).toBe(canUse);
        expect(perm.canConfigure).toBe(canConfigure);
      }
    );
  });
});
