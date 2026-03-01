'use client';

import { PermissionProvider } from '@/components/permissions/PermissionProvider';
import { ModulePermissionGrid } from '@/components/permissions/ModulePermissionGrid';

// TODO: replace with real org ID from auth session once Better Auth is wired up.
const PLACEHOLDER_ORG_ID = 'org_default';

export function PermissionsPageClient() {
  return (
    <PermissionProvider organizationId={PLACEHOLDER_ORG_ID}>
      <ModulePermissionGrid />
    </PermissionProvider>
  );
}
