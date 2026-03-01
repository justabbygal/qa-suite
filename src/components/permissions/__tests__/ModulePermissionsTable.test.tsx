import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModulePermissionsTable } from '../ModulePermissionsTable';
import { makeRegisteredModule, makeRolePermissions } from '@/lib/modules/__tests__/testUtils';

function renderTable(props?: Partial<Parameters<typeof ModulePermissionsTable>[0]>) {
  const onPermissionChange = jest.fn();
  const module = makeRegisteredModule();
  const utils = render(
    <ModulePermissionsTable module={module} onPermissionChange={onPermissionChange} {...props} />
  );
  return { ...utils, onPermissionChange, module };
}

describe('ModulePermissionsTable – rendering', () => {
  it('renders a region with accessible label', () => {
    const module = makeRegisteredModule({ displayName: 'Test Module' });
    render(<ModulePermissionsTable module={module} />);
    expect(screen.getByRole('region', { name: 'Test Module permissions' })).toBeInTheDocument();
  });

  it('renders a row for each role (Owner, Admin, User)', () => {
    renderTable();
    expect(screen.getByRole('row', { name: /owner role permissions/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /admin role permissions/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /user role permissions/i })).toBeInTheDocument();
  });

  it('renders a Feature Access column header', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: /feature access/i })).toBeInTheDocument();
  });

  it('renders a Settings Access column header when hasSettings is true', () => {
    renderTable({ module: makeRegisteredModule({ hasSettings: true }) });
    expect(screen.getByRole('columnheader', { name: /settings access/i })).toBeInTheDocument();
  });

  it('does NOT render Settings Access column header when hasSettings is false', () => {
    renderTable({ module: makeRegisteredModule({ hasSettings: false }) });
    expect(screen.queryByRole('columnheader', { name: /settings access/i })).not.toBeInTheDocument();
  });

  it('renders a Feature Access toggle for each role', () => {
    renderTable();
    expect(screen.getByRole('switch', { name: /owner feature access/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /admin feature access/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /user feature access/i })).toBeInTheDocument();
  });

  it('renders Settings Access toggles for each role when hasSettings is true', () => {
    renderTable({ module: makeRegisteredModule({ hasSettings: true }) });
    expect(screen.getByRole('switch', { name: /owner settings access/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /admin settings access/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /user settings access/i })).toBeInTheDocument();
  });

  it('does NOT render Settings Access toggles when hasSettings is false', () => {
    renderTable({ module: makeRegisteredModule({ hasSettings: false }) });
    expect(screen.queryByRole('switch', { name: /settings access/i })).not.toBeInTheDocument();
  });
});

describe('ModulePermissionsTable – toggle state', () => {
  it('reflects featureAccess=true for Owner as aria-checked=true', () => {
    const module = makeRegisteredModule({
      permissions: makeRolePermissions({ Owner: { featureAccess: true, settingsAccess: true } }),
    });
    render(<ModulePermissionsTable module={module} />);
    expect(screen.getByRole('switch', { name: /owner feature access/i })).toHaveAttribute(
      'aria-checked', 'true'
    );
  });

  it('reflects featureAccess=false for User as aria-checked=false', () => {
    const module = makeRegisteredModule({
      permissions: makeRolePermissions({ User: { featureAccess: false, settingsAccess: false } }),
    });
    render(<ModulePermissionsTable module={module} />);
    expect(screen.getByRole('switch', { name: /user feature access/i })).toHaveAttribute(
      'aria-checked', 'false'
    );
  });

  it('disables Settings Access toggle when featureAccess is false', () => {
    const module = makeRegisteredModule({
      hasSettings: true,
      permissions: makeRolePermissions({ User: { featureAccess: false, settingsAccess: false } }),
    });
    render(<ModulePermissionsTable module={module} />);
    expect(screen.getByRole('switch', { name: /user settings access/i })).toBeDisabled();
  });

  it('enables Settings Access toggle when featureAccess is true and not readOnly', () => {
    const module = makeRegisteredModule({
      hasSettings: true,
      permissions: makeRolePermissions({ Owner: { featureAccess: true, settingsAccess: true } }),
    });
    render(<ModulePermissionsTable module={module} readOnly={false} />);
    expect(screen.getByRole('switch', { name: /owner settings access/i })).not.toBeDisabled();
  });
});

describe('ModulePermissionsTable – interaction', () => {
  it('calls onPermissionChange when a Feature Access toggle is clicked', async () => {
    const user = userEvent.setup();
    const { onPermissionChange, module } = renderTable({
      module: makeRegisteredModule({
        permissions: makeRolePermissions({ User: { featureAccess: false, settingsAccess: false } }),
      }),
    });
    await user.click(screen.getByRole('switch', { name: /user feature access/i }));
    expect(onPermissionChange).toHaveBeenCalledTimes(1);
    expect(onPermissionChange).toHaveBeenCalledWith(module.id, 'User', 'featureAccess', true);
  });

  it('calls onPermissionChange with correct role and field for Admin Settings Access', async () => {
    const user = userEvent.setup();
    const { onPermissionChange, module } = renderTable({
      module: makeRegisteredModule({
        hasSettings: true,
        permissions: makeRolePermissions({ Admin: { featureAccess: true, settingsAccess: false } }),
      }),
    });
    await user.click(screen.getByRole('switch', { name: /admin settings access/i }));
    expect(onPermissionChange).toHaveBeenCalledWith(module.id, 'Admin', 'settingsAccess', true);
  });

  it('does not call onPermissionChange when Settings toggle is disabled', async () => {
    const user = userEvent.setup();
    const { onPermissionChange } = renderTable({
      module: makeRegisteredModule({
        hasSettings: true,
        permissions: makeRolePermissions({ User: { featureAccess: false, settingsAccess: false } }),
      }),
    });
    await user.click(screen.getByRole('switch', { name: /user settings access/i }));
    expect(onPermissionChange).not.toHaveBeenCalled();
  });
});

describe('ModulePermissionsTable – readOnly', () => {
  it('disables all Feature Access toggles when readOnly=true', () => {
    renderTable({ readOnly: true });
    ['owner', 'admin', 'user'].forEach((role) => {
      expect(screen.getByRole('switch', { name: new RegExp(`${role} feature access`, 'i') })).toBeDisabled();
    });
  });

  it('disables all Settings Access toggles when readOnly=true', () => {
    renderTable({ readOnly: true, module: makeRegisteredModule({ hasSettings: true }) });
    ['owner', 'admin', 'user'].forEach((role) => {
      expect(screen.getByRole('switch', { name: new RegExp(`${role} settings access`, 'i') })).toBeDisabled();
    });
  });

  it('does not call onPermissionChange in readOnly mode', async () => {
    const user = userEvent.setup();
    const { onPermissionChange } = renderTable({ readOnly: true });
    await user.click(screen.getByRole('switch', { name: /owner feature access/i }));
    expect(onPermissionChange).not.toHaveBeenCalled();
  });
});

describe('ModulePermissionsTable – edge cases', () => {
  it('renders gracefully when no onPermissionChange handler is provided', () => {
    expect(() => render(<ModulePermissionsTable module={makeRegisteredModule()} />)).not.toThrow();
  });

  it('renders all three roles in order: Owner, Admin, User', () => {
    renderTable();
    const rows = screen.getAllByRole('row', { name: /role permissions/i });
    expect(rows[0]).toHaveAccessibleName(/owner/i);
    expect(rows[1]).toHaveAccessibleName(/admin/i);
    expect(rows[2]).toHaveAccessibleName(/user/i);
  });
});
