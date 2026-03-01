/**
 * Integration tests for the permission management workflow.
 *
 * Covers:
 *  - Permission state utilities (pure functions)
 *  - usePermissionState hook (API integration, optimistic updates, rollback)
 *  - PermissionProvider (context, toast notifications)
 *  - ModulePermissionsTable (rendering, two-layer toggle dependency)
 *  - BulkToggle (visual states, confirmation dialog)
 *  - Audit logging utilities (buildChangesMap, hasSensitiveChanges)
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';

import { usePermissionState } from '@/hooks/usePermissions';
import {
  PermissionProvider,
  usePermissionContext,
} from '@/components/permissions/PermissionProvider';
import { ModulePermissionsTable } from '@/components/permissions/ModulePermissionsTable';
import { BulkToggle } from '@/components/permissions/BulkToggle';

import {
  snapshotModules,
  applyOptimisticUpdate,
  applyBulkOptimisticUpdates,
  revertModule,
  permissionKey,
} from '@/lib/utils/permission-state';
import {
  buildChangesMap,
  hasSensitiveChanges,
} from '@/lib/audit/logger';

import {
  makeRegisteredModule,
  makeRolePermissions,
  makeModuleList,
  makeBulkUpdateItem,
  makeAuditLog,
  mockFetchSuccess,
  mockFetchError,
  mockFetchNetworkError,
} from '@/__tests__/utils/permissionTestHelpers';

// ---------------------------------------------------------------------------
// Global fetch setup
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

// ===========================================================================
// Permission state utilities (pure functions)
// ===========================================================================

describe('snapshotModules', () => {
  it('returns a deep copy — mutations to permissions do not affect the original', () => {
    const modules = [makeRegisteredModule()];
    const snapshot = snapshotModules(modules);

    snapshot[0].permissions.Owner.featureAccess = false;

    expect(modules[0].permissions.Owner.featureAccess).toBe(true);
  });

  it('preserves all fields and values', () => {
    const modules = makeModuleList(2);
    const snapshot = snapshotModules(modules);

    expect(snapshot).toHaveLength(2);
    expect(snapshot[0].id).toBe(modules[0].id);
    expect(snapshot[0].permissions).toEqual(modules[0].permissions);
  });
});

describe('permissionKey', () => {
  it('produces a colon-separated string', () => {
    expect(permissionKey('mod-1', 'Admin', 'featureAccess')).toBe(
      'mod-1:Admin:featureAccess'
    );
  });

  it('produces different keys for different field names', () => {
    const a = permissionKey('mod-1', 'Owner', 'featureAccess');
    const b = permissionKey('mod-1', 'Owner', 'settingsAccess');
    expect(a).not.toBe(b);
  });
});

describe('applyOptimisticUpdate', () => {
  it('updates the specified role and field', () => {
    const modules = [makeRegisteredModule()];
    const result = applyOptimisticUpdate(modules, 'module-uuid-1', {
      role: 'User',
      field: 'featureAccess',
      value: true,
    });
    expect(result[0].permissions.User.featureAccess).toBe(true);
  });

  it('does not mutate other roles', () => {
    const modules = [makeRegisteredModule()];
    const result = applyOptimisticUpdate(modules, 'module-uuid-1', {
      role: 'User',
      field: 'featureAccess',
      value: true,
    });
    expect(result[0].permissions.Owner).toEqual(modules[0].permissions.Owner);
    expect(result[0].permissions.Admin).toEqual(modules[0].permissions.Admin);
  });

  it('auto-disables settingsAccess when featureAccess is set to false', () => {
    const modules = [
      makeRegisteredModule({
        permissions: makeRolePermissions({
          Admin: { featureAccess: true, settingsAccess: true },
        }),
      }),
    ];
    const result = applyOptimisticUpdate(modules, 'module-uuid-1', {
      role: 'Admin',
      field: 'featureAccess',
      value: false,
    });
    expect(result[0].permissions.Admin.featureAccess).toBe(false);
    expect(result[0].permissions.Admin.settingsAccess).toBe(false);
  });

  it('does not auto-disable settingsAccess when enabling featureAccess', () => {
    const modules = [
      makeRegisteredModule({
        permissions: makeRolePermissions({
          User: { featureAccess: false, settingsAccess: false },
        }),
      }),
    ];
    const result = applyOptimisticUpdate(modules, 'module-uuid-1', {
      role: 'User',
      field: 'featureAccess',
      value: true,
    });
    // settingsAccess was false and enabling featureAccess should not change it
    expect(result[0].permissions.User.featureAccess).toBe(true);
    expect(result[0].permissions.User.settingsAccess).toBe(false);
  });

  it('leaves unrelated modules untouched', () => {
    const modules = makeModuleList(2);
    const result = applyOptimisticUpdate(modules, 'module-uuid-1', {
      role: 'User',
      field: 'featureAccess',
      value: true,
    });
    expect(result[1]).toBe(modules[1]); // same reference
  });
});

describe('applyBulkOptimisticUpdates', () => {
  it('applies all updates across multiple modules', () => {
    const modules = makeModuleList(2);
    const updates = [
      makeBulkUpdateItem({ moduleId: 'module-uuid-1', role: 'User', value: true }),
      makeBulkUpdateItem({ moduleId: 'module-uuid-2', role: 'Admin', field: 'settingsAccess', value: true }),
    ];
    const result = applyBulkOptimisticUpdates(modules, updates);
    expect(result[0].permissions.User.featureAccess).toBe(true);
    expect(result[1].permissions.Admin.settingsAccess).toBe(true);
  });

  it('returns the original array unchanged for an empty update list', () => {
    const modules = makeModuleList(2);
    const result = applyBulkOptimisticUpdates(modules, []);
    expect(result).toEqual(modules);
  });
});

describe('revertModule', () => {
  it('replaces the module with its snapshot version', () => {
    const original = makeRegisteredModule();
    const snapshot = snapshotModules([original]);

    // Mutate the "current" state
    const current = [
      { ...original, permissions: makeRolePermissions({ User: { featureAccess: true, settingsAccess: false } }) },
    ];

    const reverted = revertModule(current, snapshot);
    expect(reverted[0].permissions.User.featureAccess).toBe(false);
  });

  it('only reverts the specified module, leaving others intact', () => {
    const modules = makeModuleList(2);
    const snapshot = snapshotModules([modules[0]]);

    // Mutate both modules
    const mutated = modules.map((m) => ({
      ...m,
      permissions: makeRolePermissions({ User: { featureAccess: true, settingsAccess: false } }),
    }));

    const reverted = revertModule(mutated, snapshot);
    // Module 1 should be reverted to snapshot
    expect(reverted[0].permissions.User.featureAccess).toBe(false);
    // Module 2 was not in snapshot, stays mutated
    expect(reverted[1].permissions.User.featureAccess).toBe(true);
  });
});

// ===========================================================================
// Audit logging utilities (pure functions)
// ===========================================================================

describe('buildChangesMap', () => {
  it('returns null when before and after are identical', () => {
    const result = buildChangesMap(
      { featureAccess: true, settingsAccess: false },
      { featureAccess: true, settingsAccess: false }
    );
    expect(result).toBeNull();
  });

  it('captures changed fields with before/after values', () => {
    const result = buildChangesMap(
      { featureAccess: true, settingsAccess: true },
      { featureAccess: false, settingsAccess: false }
    );
    expect(result).not.toBeNull();
    expect(result!.featureAccess).toEqual({ before: true, after: false });
    expect(result!.settingsAccess).toEqual({ before: true, after: false });
  });

  it('captures new keys that appear only in after', () => {
    const result = buildChangesMap({}, { featureAccess: true });
    expect(result!.featureAccess).toEqual({ before: null, after: true });
  });

  it('captures removed keys that appear only in before', () => {
    const result = buildChangesMap({ featureAccess: true }, {});
    expect(result!.featureAccess).toEqual({ before: true, after: null });
  });

  it('ignores fields where value did not change', () => {
    const result = buildChangesMap(
      { featureAccess: true, settingsAccess: false },
      { featureAccess: false, settingsAccess: false }
    );
    expect(result).not.toBeNull();
    expect(Object.keys(result!)).toEqual(['featureAccess']);
  });
});

describe('hasSensitiveChanges', () => {
  it('returns false for null changes', () => {
    expect(hasSensitiveChanges(null)).toBe(false);
  });

  it('returns false when no sensitive fields are present', () => {
    const log = makeAuditLog();
    expect(hasSensitiveChanges(log.changes)).toBe(false);
  });

  it('returns true when the changes map includes "email"', () => {
    expect(
      hasSensitiveChanges({ email: { before: 'a@b.com', after: 'c@d.com' } })
    ).toBe(true);
  });

  it('returns true when the changes map includes "password"', () => {
    expect(
      hasSensitiveChanges({ password: { before: 'old', after: 'new' } })
    ).toBe(true);
  });

  it('returns false for non-sensitive field names', () => {
    expect(
      hasSensitiveChanges({ featureAccess: { before: true, after: false } })
    ).toBe(false);
  });
});

// ===========================================================================
// usePermissionState hook — API integration
// ===========================================================================

describe('usePermissionState – initial load', () => {
  it('starts with isLoading=true and completes loading with modules', async () => {
    const modules = makeModuleList(2);
    global.fetch = mockFetchSuccess(modules);

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1' })
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.modules).toHaveLength(2);
    expect(result.current.loadError).toBeNull();
  });

  it('sets loadError when the fetch fails', async () => {
    global.fetch = mockFetchError(401, 'Unauthorized');

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1' })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.loadError).toBeTruthy();
    expect(result.current.modules).toHaveLength(0);
  });

  it('sets loadError when fetch throws a network error', async () => {
    global.fetch = mockFetchNetworkError('Network error');

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1' })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.loadError).toBe('Network error');
  });

  it('includes the organizationId in the request URL', async () => {
    const mockFetch = mockFetchSuccess([]);
    global.fetch = mockFetch;

    renderHook(() => usePermissionState({ organizationId: 'org-abc' }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('organizationId=org-abc');
  });
});

describe('usePermissionState – updatePermission (optimistic)', () => {
  it('applies the change optimistically before the API responds', async () => {
    const modules = [makeRegisteredModule()];
    const updated = makeRegisteredModule({
      permissions: makeRolePermissions({ User: { featureAccess: true, settingsAccess: false } }),
    });
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(modules) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(updated) });
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1' })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updatePermission('module-uuid-1', 'User', 'featureAccess', true);
    });

    // Optimistic update is visible immediately
    expect(result.current.modules[0].permissions.User.featureAccess).toBe(true);
  });

  it('does not call the PATCH API before the debounce window elapses', async () => {
    const modules = [makeRegisteredModule()];
    const mockFetch = mockFetchSuccess(modules);
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1' })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callsAfterLoad = mockFetch.mock.calls.length;

    act(() => {
      result.current.updatePermission('module-uuid-1', 'User', 'featureAccess', true);
    });

    // Immediately after the call, no additional API request should have been made
    expect(mockFetch).toHaveBeenCalledTimes(callsAfterLoad);
  });

  it('calls the PATCH API after the debounce delay and commits server response', async () => {
    const modules = [makeRegisteredModule()];
    const serverResponse = makeRegisteredModule({
      permissions: makeRolePermissions({ User: { featureAccess: true, settingsAccess: false } }),
    });
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(modules) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(serverResponse) });
    global.fetch = mockFetch;

    const onToast = jest.fn();
    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1', onToast })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updatePermission('module-uuid-1', 'User', 'featureAccess', true);
    });

    // Wait for the debounce + API call to complete
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2), { timeout: 2000 });

    expect(result.current.modules[0].permissions.User.featureAccess).toBe(true);
    expect(onToast).toHaveBeenCalledWith('success', 'Permission updated');
  });

  it('reverts optimistic update on API error and fires an error toast', async () => {
    const modules = [makeRegisteredModule()];
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(modules) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Server error' }) });
    global.fetch = mockFetch;

    const onToast = jest.fn();
    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1', onToast })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updatePermission('module-uuid-1', 'User', 'featureAccess', true);
    });

    // Optimistic update shows immediately
    expect(result.current.modules[0].permissions.User.featureAccess).toBe(true);

    // Wait for the rollback
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('error', expect.any(String)), {
      timeout: 2000,
    });

    expect(result.current.modules[0].permissions.User.featureAccess).toBe(false);
  });

  it('adds the updated module to pendingModuleIds during the API call', async () => {
    const modules = [makeRegisteredModule()];
    let resolvePatch!: (v: unknown) => void;
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(modules) })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePatch = resolve;
        })
      );
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1' })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updatePermission('module-uuid-1', 'User', 'featureAccess', true);
    });

    // Wait for the debounce to fire and the pending state to be set
    await waitFor(
      () => expect(result.current.pendingModuleIds.has('module-uuid-1')).toBe(true),
      { timeout: 2000 }
    );

    // Resolve the in-flight PATCH
    act(() => {
      resolvePatch({
        ok: true,
        json: () => Promise.resolve(makeRegisteredModule()),
      });
    });

    await waitFor(() =>
      expect(result.current.pendingModuleIds.has('module-uuid-1')).toBe(false)
    );
  });
});

describe('usePermissionState – bulkUpdatePermissions', () => {
  it('returns succeeded items when all patches succeed', async () => {
    const modules = makeModuleList(2);
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(modules) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(modules[0]) });
    global.fetch = mockFetch;
    const onToast = jest.fn();

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1', onToast })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const updates = [
      makeBulkUpdateItem({ moduleId: 'module-uuid-1', role: 'User', value: true }),
      makeBulkUpdateItem({ moduleId: 'module-uuid-2', role: 'User', value: true }),
    ];

    let bulkResult!: { succeeded: typeof updates; failed: typeof updates };
    await act(async () => {
      bulkResult = await result.current.bulkUpdatePermissions(updates);
    });

    expect(bulkResult.succeeded).toHaveLength(2);
    expect(bulkResult.failed).toHaveLength(0);
    expect(onToast).toHaveBeenCalledWith('success', '2 permissions updated');
  });

  it('returns failed items and reverts when a patch fails', async () => {
    const modules = [makeRegisteredModule()];
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(modules) })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Forbidden' }),
      });
    global.fetch = mockFetch;
    const onToast = jest.fn();

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1', onToast })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const updates = [makeBulkUpdateItem({ moduleId: 'module-uuid-1', role: 'User', value: true })];

    let bulkResult!: { succeeded: typeof updates; failed: typeof updates };
    await act(async () => {
      bulkResult = await result.current.bulkUpdatePermissions(updates);
    });

    expect(bulkResult.succeeded).toHaveLength(0);
    expect(bulkResult.failed).toHaveLength(1);
    // The optimistic update should have been reverted
    expect(result.current.modules[0].permissions.User.featureAccess).toBe(false);
    expect(onToast).toHaveBeenCalledWith('error', 'All bulk permission updates failed');
  });

  it('returns empty arrays immediately for empty input', async () => {
    const mockFetch = mockFetchSuccess([]);
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1' })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let bulkResult!: { succeeded: unknown[]; failed: unknown[] };
    await act(async () => {
      bulkResult = await result.current.bulkUpdatePermissions([]);
    });

    expect(bulkResult.succeeded).toHaveLength(0);
    expect(bulkResult.failed).toHaveLength(0);
  });

  it('sends a mixed toast when some updates succeed and some fail', async () => {
    const modules = makeModuleList(2);
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(modules) })
      // First module succeeds
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(modules[0]) })
      // Second module fails
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal error' }),
      });
    global.fetch = mockFetch;
    const onToast = jest.fn();

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1', onToast })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const updates = [
      makeBulkUpdateItem({ moduleId: 'module-uuid-1', role: 'User', value: true }),
      makeBulkUpdateItem({ moduleId: 'module-uuid-2', role: 'User', value: true }),
    ];

    await act(async () => {
      await result.current.bulkUpdatePermissions(updates);
    });

    expect(onToast).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('succeeded')
    );
  });
});

describe('usePermissionState – refresh', () => {
  it('re-fetches modules when refresh is called', async () => {
    const initialModules = makeModuleList(1);
    const refreshedModules = makeModuleList(2);
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(initialModules) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(refreshedModules) });
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      usePermissionState({ organizationId: 'org-1' })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.modules).toHaveLength(1);

    act(() => { result.current.refresh(); });

    await waitFor(() => expect(result.current.modules).toHaveLength(2));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// PermissionProvider — context integration
// ===========================================================================

describe('PermissionProvider', () => {
  it('renders children', async () => {
    global.fetch = mockFetchSuccess([]);

    render(
      <PermissionProvider organizationId="org-1">
        <span data-testid="child">Hello</span>
      </PermissionProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('provides module list to child consumers', async () => {
    const modules = [makeRegisteredModule()];
    global.fetch = mockFetchSuccess(modules);

    function TestConsumer() {
      const { modules: mods } = usePermissionContext();
      return <div data-testid="count">{mods.length}</div>;
    }

    render(
      <PermissionProvider organizationId="org-1">
        <TestConsumer />
      </PermissionProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('1')
    );
  });

  it('throws when usePermissionContext is used outside the provider', () => {
    // Suppress React error boundary output for this test
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    function BadConsumer() {
      usePermissionContext();
      return null;
    }

    expect(() => render(<BadConsumer />)).toThrow(
      'usePermissionContext must be used within a <PermissionProvider>'
    );

    consoleError.mockRestore();
  });

  it('exposes addToast through the context', async () => {
    global.fetch = mockFetchSuccess([]);

    let capturedAddToast!: (type: 'success' | 'error', message: string) => void;

    function TestConsumer() {
      const ctx = usePermissionContext();
      capturedAddToast = ctx.addToast;
      return null;
    }

    render(
      <PermissionProvider organizationId="org-1">
        <TestConsumer />
      </PermissionProvider>
    );

    await waitFor(() => expect(capturedAddToast).toBeDefined());

    // Should not throw
    act(() => { capturedAddToast('success', 'Test message'); });
  });
});

// ===========================================================================
// ModulePermissionsTable — rendering and interactions
// ===========================================================================

describe('ModulePermissionsTable', () => {
  it('renders a row for each role (Owner, Admin, User)', () => {
    render(
      <ModulePermissionsTable module={makeRegisteredModule()} />
    );
    expect(screen.getByRole('row', { name: /owner/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /admin/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /user/i })).toBeInTheDocument();
  });

  it('renders a Feature Access toggle for each role', () => {
    render(<ModulePermissionsTable module={makeRegisteredModule()} />);
    expect(screen.getByRole('switch', { name: /owner feature access/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /admin feature access/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /user feature access/i })).toBeInTheDocument();
  });

  it('renders Settings Access toggles when hasSettings=true', () => {
    render(<ModulePermissionsTable module={makeRegisteredModule({ hasSettings: true })} />);
    expect(screen.getByRole('switch', { name: /owner settings access/i })).toBeInTheDocument();
  });

  it('hides Settings Access toggles when hasSettings=false', () => {
    render(
      <ModulePermissionsTable module={makeRegisteredModule({ hasSettings: false })} />
    );
    expect(screen.queryByRole('switch', { name: /settings access/i })).not.toBeInTheDocument();
  });

  it('disables the Settings toggle when featureAccess is false', () => {
    const mod = makeRegisteredModule({
      permissions: makeRolePermissions({
        User: { featureAccess: false, settingsAccess: false },
      }),
    });
    render(<ModulePermissionsTable module={mod} />);
    expect(
      screen.getByRole('switch', { name: /user settings access/i })
    ).toBeDisabled();
  });

  it('enables the Settings toggle when featureAccess is true', () => {
    const mod = makeRegisteredModule({
      permissions: makeRolePermissions({
        Admin: { featureAccess: true, settingsAccess: false },
      }),
    });
    render(<ModulePermissionsTable module={mod} />);
    expect(
      screen.getByRole('switch', { name: /admin settings access/i })
    ).not.toBeDisabled();
  });

  it('calls onPermissionChange with correct args when a toggle is clicked', async () => {
    const user = userEvent.setup();
    const onPermissionChange = jest.fn();
    const mod = makeRegisteredModule({
      permissions: makeRolePermissions({
        User: { featureAccess: false, settingsAccess: false },
      }),
    });

    render(
      <ModulePermissionsTable module={mod} onPermissionChange={onPermissionChange} />
    );

    await user.click(screen.getByRole('switch', { name: /user feature access/i }));

    expect(onPermissionChange).toHaveBeenCalledWith(
      'module-uuid-1',
      'User',
      'featureAccess',
      true
    );
  });

  it('does not call onPermissionChange when readOnly=true', async () => {
    const user = userEvent.setup();
    const onPermissionChange = jest.fn();

    render(
      <ModulePermissionsTable
        module={makeRegisteredModule()}
        onPermissionChange={onPermissionChange}
        readOnly
      />
    );

    await user.click(screen.getByRole('switch', { name: /user feature access/i }));
    expect(onPermissionChange).not.toHaveBeenCalled();
  });

  it('renders with an accessible region label', () => {
    render(<ModulePermissionsTable module={makeRegisteredModule()} />);
    expect(
      screen.getByRole('region', { name: /test module permissions/i })
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// BulkToggle — visual states and confirmation
// ===========================================================================

describe('BulkToggle – visual states', () => {
  it('shows "All roles enabled" when all roles have featureAccess', () => {
    const mod = makeRegisteredModule({
      permissions: makeRolePermissions({
        Owner: { featureAccess: true, settingsAccess: true },
        Admin: { featureAccess: true, settingsAccess: false },
        User: { featureAccess: true, settingsAccess: false },
      }),
    });
    render(<BulkToggle module={mod} onBulkChange={jest.fn()} />);
    expect(screen.getByText('All roles enabled')).toBeInTheDocument();
  });

  it('shows "All roles disabled" when no roles have featureAccess', () => {
    const mod = makeRegisteredModule({
      permissions: makeRolePermissions({
        Owner: { featureAccess: false, settingsAccess: false },
        Admin: { featureAccess: false, settingsAccess: false },
        User: { featureAccess: false, settingsAccess: false },
      }),
    });
    render(<BulkToggle module={mod} onBulkChange={jest.fn()} />);
    expect(screen.getByText('All roles disabled')).toBeInTheDocument();
  });

  it('shows a Mixed badge and partial count when only some roles have featureAccess', () => {
    const mod = makeRegisteredModule({
      permissions: makeRolePermissions({
        Owner: { featureAccess: true, settingsAccess: true },
        Admin: { featureAccess: false, settingsAccess: false },
        User: { featureAccess: false, settingsAccess: false },
      }),
    });
    render(<BulkToggle module={mod} onBulkChange={jest.fn()} />);
    expect(screen.getByText('Mixed')).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 roles enabled/i)).toBeInTheDocument();
  });

  it('renders the switch with aria-checked=true when at least one role is enabled', () => {
    const mod = makeRegisteredModule();
    render(<BulkToggle module={mod} onBulkChange={jest.fn()} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders the switch with aria-checked=false when all roles are disabled', () => {
    const mod = makeRegisteredModule({
      permissions: makeRolePermissions({
        Owner: { featureAccess: false, settingsAccess: false },
        Admin: { featureAccess: false, settingsAccess: false },
        User: { featureAccess: false, settingsAccess: false },
      }),
    });
    render(<BulkToggle module={mod} onBulkChange={jest.fn()} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
});

describe('BulkToggle – interactions', () => {
  it('enables all without a confirmation dialog when all roles are currently disabled', async () => {
    const user = userEvent.setup();
    const onBulkChange = jest.fn();
    const allDisabled = makeRegisteredModule({
      permissions: makeRolePermissions({
        Owner: { featureAccess: false, settingsAccess: false },
        Admin: { featureAccess: false, settingsAccess: false },
        User: { featureAccess: false, settingsAccess: false },
      }),
    });

    render(<BulkToggle module={allDisabled} onBulkChange={onBulkChange} />);
    await user.click(screen.getByRole('switch'));

    expect(onBulkChange).toHaveBeenCalledWith('module-uuid-1', true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows a confirmation dialog before bulk-disabling roles', async () => {
    const user = userEvent.setup();
    const onBulkChange = jest.fn();

    render(<BulkToggle module={makeRegisteredModule()} onBulkChange={onBulkChange} />);
    await user.click(screen.getByRole('switch'));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onBulkChange).not.toHaveBeenCalled();
  });

  it('calls onBulkChange(id, false) when the user confirms bulk-disable', async () => {
    const user = userEvent.setup();
    const onBulkChange = jest.fn();

    render(<BulkToggle module={makeRegisteredModule()} onBulkChange={onBulkChange} />);
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: /remove access/i }));

    expect(onBulkChange).toHaveBeenCalledWith('module-uuid-1', false);
  });

  it('does not call onBulkChange when the user cancels the dialog', async () => {
    const user = userEvent.setup();
    const onBulkChange = jest.fn();

    render(<BulkToggle module={makeRegisteredModule()} onBulkChange={onBulkChange} />);
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onBulkChange).not.toHaveBeenCalled();
  });

  it('does not call onBulkChange when disabled prop is true', async () => {
    const user = userEvent.setup();
    const onBulkChange = jest.fn();

    render(
      <BulkToggle module={makeRegisteredModule()} onBulkChange={onBulkChange} disabled />
    );
    await user.click(screen.getByRole('switch'));

    expect(onBulkChange).not.toHaveBeenCalled();
  });

  it('shows the module display name in the bulk toggle region', () => {
    render(<BulkToggle module={makeRegisteredModule()} onBulkChange={jest.fn()} />);
    expect(screen.getByText('Test Module')).toBeInTheDocument();
  });
});
