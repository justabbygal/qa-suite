/**
 * Advanced Module Registration Example
 *
 * Demonstrates:
 *   - Multiple permission patterns in one file
 *   - Updating permissions after initial registration
 *   - Deregistering a module
 *   - Error handling for all ModuleServiceError codes
 */

import type { ModuleManifest } from '@/lib/modules/types';
import {
  registerModule,
  updateModule,
  deregisterModule,
  getModules,
  ModuleServiceError,
} from '@/lib/modules/module-service';
import { createClient } from '@/lib/supabase/server';

// ─── Manifest examples for different access patterns ──────────────────────

/**
 * All roles can use the feature; only Owners can change settings.
 * Good for: dashboards, read-heavy features, reporting.
 */
export const reportingManifest: ModuleManifest = {
  module: 'reporting',
  displayName: 'Reporting',
  hasSettings: true,
  defaultAccess: {
    Owner: { featureAccess: true, settingsAccess: true  },
    Admin: { featureAccess: true, settingsAccess: false },
    User:  { featureAccess: true, settingsAccess: false },
  },
};

/**
 * Only Owners can see or use this module.
 * Good for: billing, org deletion, infrastructure controls.
 */
export const billingManifest: ModuleManifest = {
  module: 'billing',
  displayName: 'Billing',
  hasSettings: true,
  defaultAccess: {
    Owner: { featureAccess: true,  settingsAccess: true  },
    Admin: { featureAccess: false, settingsAccess: false },
    User:  { featureAccess: false, settingsAccess: false },
  },
};

/**
 * Module without a settings page.
 * Set hasSettings: false and all settingsAccess: false.
 * Good for: read-only views, audit logs, status pages.
 */
export const auditLogManifest: ModuleManifest = {
  module: 'audit-log',
  displayName: 'Audit Log',
  hasSettings: false,    // <-- no settings page
  defaultAccess: {
    Owner: { featureAccess: true,  settingsAccess: false },
    Admin: { featureAccess: true,  settingsAccess: false },
    User:  { featureAccess: false, settingsAccess: false },
  },
};

/**
 * Owners and Admins have full access (feature + settings).
 * Good for: internal tooling, integration configuration.
 */
export const integrationsEngineManifest: ModuleManifest = {
  module: 'integrations-engine',
  displayName: 'Integrations Engine',
  hasSettings: true,
  defaultAccess: {
    Owner: { featureAccess: true,  settingsAccess: true },
    Admin: { featureAccess: true,  settingsAccess: true },
    User:  { featureAccess: false, settingsAccess: false },
  },
};

// ─── Registration with full error handling ────────────────────────────────

export async function registerAllModules(organizationId: string) {
  const supabase = createClient();
  const manifests = [
    reportingManifest,
    billingManifest,
    auditLogManifest,
    integrationsEngineManifest,
  ];

  const results = [];

  for (const manifest of manifests) {
    try {
      const registered = await registerModule(supabase, manifest, organizationId);
      results.push({ success: true, module: registered.module, id: registered.id });
    } catch (err) {
      if (err instanceof ModuleServiceError) {
        switch (err.code) {
          case 'DUPLICATE':
            // Already registered — skip silently or log
            console.info(`[registration] '${manifest.module}' already registered, skipping`);
            results.push({ success: true, module: manifest.module, skipped: true });
            break;

          case 'VALIDATION_ERROR':
            // Manifest is malformed — this is a developer error, fail loudly
            console.error(`[registration] Invalid manifest for '${manifest.module}': ${err.message}`);
            throw err;

          case 'DATABASE_ERROR':
            // Transient failure — log and continue with remaining modules
            console.error(`[registration] DB error for '${manifest.module}': ${err.message}`);
            results.push({ success: false, module: manifest.module, error: err.message });
            break;

          default:
            throw err;
        }
      } else {
        throw err;
      }
    }
  }

  return results;
}

// ─── Updating permissions after initial registration ──────────────────────

/**
 * Grants Users read access to the reporting module.
 * Demonstrates a targeted permission update that preserves all other values.
 */
export async function grantUsersReportingAccess(organizationId: string) {
  const supabase = createClient();

  // Look up the registered module by slug
  const modules = await getModules(supabase, organizationId);
  const reporting = modules.find(m => m.module === 'reporting');

  if (!reporting) {
    throw new Error("Module 'reporting' is not registered for this organization");
  }

  // Deep-merge: only the User entry changes; Owner and Admin are untouched
  const updated = await updateModule(supabase, reporting.id, {
    permissions: {
      User: { featureAccess: true, settingsAccess: false },
    },
  });

  console.log('[reporting] Updated User permissions:', updated.permissions.User);
  return updated;
}

/**
 * Promotes Admin to full settings access on the integrations-engine module.
 */
export async function promoteAdminIntegrationsAccess(organizationId: string) {
  const supabase = createClient();

  const modules = await getModules(supabase, organizationId);
  const integrations = modules.find(m => m.module === 'integrations-engine');

  if (!integrations) {
    throw new Error("Module 'integrations-engine' is not registered");
  }

  return updateModule(supabase, integrations.id, {
    permissions: {
      Admin: { featureAccess: true, settingsAccess: true },
    },
  });
}

// ─── Deregistering a module ───────────────────────────────────────────────

/**
 * Removes the billing module from an organization permanently.
 * All embedded permission data is deleted along with the module record.
 */
export async function deregisterBilling(organizationId: string) {
  const supabase = createClient();

  const modules = await getModules(supabase, organizationId);
  const billing = modules.find(m => m.module === 'billing');

  if (!billing) {
    console.warn('[billing] Module not registered — nothing to deregister');
    return;
  }

  await deregisterModule(supabase, billing.id);
  console.log('[billing] Deregistered successfully');
}
