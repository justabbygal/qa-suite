import {
  getRoleLevel,
  hasHigherRole,
  hasAtLeastRole,
  canManageUser,
  canAssignRole,
} from "@/lib/permissions/service";
import type { Role } from "@/lib/permissions/types";

describe("Role Hierarchy", () => {
  // ---------------------------------------------------------------------------
  // getRoleLevel
  // ---------------------------------------------------------------------------

  describe("getRoleLevel", () => {
    it("returns 3 for owner", () => {
      expect(getRoleLevel("owner")).toBe(3);
    });

    it("returns 2 for admin", () => {
      expect(getRoleLevel("admin")).toBe(2);
    });

    it("returns 1 for user", () => {
      expect(getRoleLevel("user")).toBe(1);
    });

    it("owner has higher level than admin", () => {
      expect(getRoleLevel("owner")).toBeGreaterThan(getRoleLevel("admin"));
    });

    it("admin has higher level than user", () => {
      expect(getRoleLevel("admin")).toBeGreaterThan(getRoleLevel("user"));
    });

    it("levels are strictly ordered: owner > admin > user", () => {
      expect(getRoleLevel("owner")).toBeGreaterThan(getRoleLevel("admin"));
      expect(getRoleLevel("admin")).toBeGreaterThan(getRoleLevel("user"));
    });
  });

  // ---------------------------------------------------------------------------
  // hasHigherRole
  // ---------------------------------------------------------------------------

  describe("hasHigherRole", () => {
    it("owner outranks admin", () => {
      expect(hasHigherRole("owner", "admin")).toBe(true);
    });

    it("owner outranks user", () => {
      expect(hasHigherRole("owner", "user")).toBe(true);
    });

    it("admin outranks user", () => {
      expect(hasHigherRole("admin", "user")).toBe(true);
    });

    it("admin does NOT outrank owner", () => {
      expect(hasHigherRole("admin", "owner")).toBe(false);
    });

    it("user does NOT outrank admin", () => {
      expect(hasHigherRole("user", "admin")).toBe(false);
    });

    it("user does NOT outrank owner", () => {
      expect(hasHigherRole("user", "owner")).toBe(false);
    });

    it("owner does NOT outrank itself", () => {
      expect(hasHigherRole("owner", "owner")).toBe(false);
    });

    it("admin does NOT outrank itself", () => {
      expect(hasHigherRole("admin", "admin")).toBe(false);
    });

    it("user does NOT outrank itself", () => {
      expect(hasHigherRole("user", "user")).toBe(false);
    });

    it("is asymmetric: if A outranks B then B does not outrank A", () => {
      const pairs: [Role, Role][] = [
        ["owner", "admin"],
        ["owner", "user"],
        ["admin", "user"],
      ];
      for (const [a, b] of pairs) {
        expect(hasHigherRole(a, b)).toBe(true);
        expect(hasHigherRole(b, a)).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // hasAtLeastRole
  // ---------------------------------------------------------------------------

  describe("hasAtLeastRole", () => {
    it("owner satisfies owner requirement", () => {
      expect(hasAtLeastRole("owner", "owner")).toBe(true);
    });

    it("owner satisfies admin requirement", () => {
      expect(hasAtLeastRole("owner", "admin")).toBe(true);
    });

    it("owner satisfies user requirement", () => {
      expect(hasAtLeastRole("owner", "user")).toBe(true);
    });

    it("admin satisfies admin requirement", () => {
      expect(hasAtLeastRole("admin", "admin")).toBe(true);
    });

    it("admin satisfies user requirement", () => {
      expect(hasAtLeastRole("admin", "user")).toBe(true);
    });

    it("admin does NOT satisfy owner requirement", () => {
      expect(hasAtLeastRole("admin", "owner")).toBe(false);
    });

    it("user satisfies user requirement", () => {
      expect(hasAtLeastRole("user", "user")).toBe(true);
    });

    it("user does NOT satisfy admin requirement", () => {
      expect(hasAtLeastRole("user", "admin")).toBe(false);
    });

    it("user does NOT satisfy owner requirement", () => {
      expect(hasAtLeastRole("user", "owner")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // canManageUser
  // ---------------------------------------------------------------------------

  describe("canManageUser", () => {
    describe("owner actor", () => {
      it("can manage admins", () => {
        expect(canManageUser("owner", "admin")).toBe(true);
      });

      it("can manage users", () => {
        expect(canManageUser("owner", "user")).toBe(true);
      });

      it("cannot manage other owners (same level)", () => {
        expect(canManageUser("owner", "owner")).toBe(false);
      });
    });

    describe("admin actor", () => {
      it("can manage users", () => {
        expect(canManageUser("admin", "user")).toBe(true);
      });

      it("cannot manage other admins (same level)", () => {
        expect(canManageUser("admin", "admin")).toBe(false);
      });

      it("cannot manage owners (higher level)", () => {
        expect(canManageUser("admin", "owner")).toBe(false);
      });
    });

    describe("user actor", () => {
      it("cannot manage other users (same level)", () => {
        expect(canManageUser("user", "user")).toBe(false);
      });

      it("cannot manage admins (higher level)", () => {
        expect(canManageUser("user", "admin")).toBe(false);
      });

      it("cannot manage owners (higher level)", () => {
        expect(canManageUser("user", "owner")).toBe(false);
      });
    });

    it("matches the rule: actor level must be strictly greater than target level", () => {
      const roles: Role[] = ["owner", "admin", "user"];
      for (const actor of roles) {
        for (const target of roles) {
          const expected = getRoleLevel(actor) > getRoleLevel(target);
          expect(canManageUser(actor, target)).toBe(expected);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // canAssignRole
  // ---------------------------------------------------------------------------

  describe("canAssignRole", () => {
    describe("owner actor", () => {
      it("can assign admin role", () => {
        expect(canAssignRole("owner", "admin")).toBe(true);
      });

      it("can assign user role", () => {
        expect(canAssignRole("owner", "user")).toBe(true);
      });

      it("cannot assign owner role (same level – privilege escalation prevented)", () => {
        expect(canAssignRole("owner", "owner")).toBe(false);
      });
    });

    describe("admin actor", () => {
      it("can assign user role", () => {
        expect(canAssignRole("admin", "user")).toBe(true);
      });

      it("cannot assign admin role (same level)", () => {
        expect(canAssignRole("admin", "admin")).toBe(false);
      });

      it("cannot assign owner role (higher level – privilege escalation prevented)", () => {
        expect(canAssignRole("admin", "owner")).toBe(false);
      });
    });

    describe("user actor", () => {
      it("cannot assign user role (same level)", () => {
        expect(canAssignRole("user", "user")).toBe(false);
      });

      it("cannot assign admin role (higher level)", () => {
        expect(canAssignRole("user", "admin")).toBe(false);
      });

      it("cannot assign owner role (higher level)", () => {
        expect(canAssignRole("user", "owner")).toBe(false);
      });
    });

    it("matches the rule: actor level must be strictly greater than assigned role level", () => {
      const roles: Role[] = ["owner", "admin", "user"];
      for (const actor of roles) {
        for (const toAssign of roles) {
          const expected = getRoleLevel(actor) > getRoleLevel(toAssign);
          expect(canAssignRole(actor, toAssign)).toBe(expected);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Privilege escalation prevention
  // ---------------------------------------------------------------------------

  describe("privilege escalation prevention", () => {
    it("user cannot self-escalate to admin via canAssignRole", () => {
      expect(canAssignRole("user", "admin")).toBe(false);
    });

    it("user cannot self-escalate to owner via canAssignRole", () => {
      expect(canAssignRole("user", "owner")).toBe(false);
    });

    it("admin cannot escalate to owner via canAssignRole", () => {
      expect(canAssignRole("admin", "owner")).toBe(false);
    });

    it("admin cannot promote someone to their own level (admin → admin)", () => {
      expect(canAssignRole("admin", "admin")).toBe(false);
    });

    it("admin cannot demote an owner via canManageUser", () => {
      expect(canManageUser("admin", "owner")).toBe(false);
    });

    it("user cannot manage any higher-privileged role", () => {
      const higherRoles: Role[] = ["admin", "owner"];
      for (const role of higherRoles) {
        expect(canManageUser("user", role)).toBe(false);
      }
    });

    it("no role can manage a peer at the same privilege level", () => {
      const roles: Role[] = ["owner", "admin", "user"];
      for (const role of roles) {
        expect(canManageUser(role, role)).toBe(false);
      }
    });

    it("no role can assign itself (cannot grant equal privileges)", () => {
      const roles: Role[] = ["owner", "admin", "user"];
      for (const role of roles) {
        expect(canAssignRole(role, role)).toBe(false);
      }
    });
  });
});
