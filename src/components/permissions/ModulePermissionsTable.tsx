'use client';

import { RegisteredModule, Role, ROLES } from '@/lib/modules/types';
import { PermissionToggle } from './PermissionToggle';

export interface ModulePermissionsTableProps {
  module: RegisteredModule;
  onPermissionChange?: (
    moduleId: string,
    role: Role,
    field: 'featureAccess' | 'settingsAccess',
    value: boolean
  ) => void;
  readOnly?: boolean;
}

export function ModulePermissionsTable({
  module,
  onPermissionChange,
  readOnly = false,
}: ModulePermissionsTableProps) {
  const handleChange = (
    role: Role,
    field: 'featureAccess' | 'settingsAccess',
    value: boolean
  ) => {
    if (readOnly || !onPermissionChange) return;
    onPermissionChange(module.id, role, field, value);
  };

  return (
    <div role="region" aria-label={`${module.displayName} permissions`}>
      <table className="w-full text-sm">
        <caption className="sr-only">{module.displayName} permission settings</caption>
        <thead>
          <tr className="border-b text-left">
            <th scope="col" className="py-2 font-medium">
              Role
            </th>
            <th scope="col" className="py-2 font-medium">
              Feature Access
            </th>
            {module.hasSettings && (
              <th scope="col" className="py-2 font-medium">
                Settings Access
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role) => {
            const perms = module.permissions[role] ?? {
              featureAccess: false,
              settingsAccess: false,
            };

            return (
              <tr key={role} className="border-b last:border-0" aria-label={`${role} role permissions`}>
                <td className="py-3 font-medium">{role}</td>
                <td className="py-3">
                  <PermissionToggle
                    label={`${role} feature access`}
                    enabled={perms.featureAccess}
                    disabled={readOnly}
                    onChange={(v) => handleChange(role, 'featureAccess', v)}
                  />
                </td>
                {module.hasSettings && (
                  <td className="py-3">
                    <PermissionToggle
                      label={`${role} settings access`}
                      enabled={perms.settingsAccess}
                      disabled={readOnly || !perms.featureAccess}
                      onChange={(v) => handleChange(role, 'settingsAccess', v)}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
