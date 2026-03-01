import { ModuleManifest, RegisteredModule, RolePermissions } from '../types';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

export function makeRolePermissions(overrides?: Partial<RolePermissions>): RolePermissions {
  return {
    Owner: { featureAccess: true, settingsAccess: true },
    Admin: { featureAccess: true, settingsAccess: false },
    User: { featureAccess: false, settingsAccess: false },
    ...overrides,
  };
}

export function makeModuleManifest(overrides?: Partial<ModuleManifest>): ModuleManifest {
  return {
    module: 'test-module',
    displayName: 'Test Module',
    hasSettings: true,
    defaultAccess: makeRolePermissions(),
    ...overrides,
  };
}

export function makeRegisteredModule(overrides?: Partial<RegisteredModule>): RegisteredModule {
  return {
    id: 'module-uuid-1',
    module: 'test-module',
    displayName: 'Test Module',
    hasSettings: true,
    organizationId: 'org-uuid-1',
    permissions: makeRolePermissions(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Supabase mock builder
// ---------------------------------------------------------------------------

type QueryResult<T> = { data: T | null; error: { message: string } | null };

/**
 * Builds a chainable Supabase query mock that resolves to `result` when
 * a terminal method (.single(), .maybeSingle(), or implicit resolution) is called.
 */
export function buildSupabaseMock<T>(result: QueryResult<T>) {
  const chain: Record<string, unknown> = {};

  const terminal = () => Promise.resolve(result);
  const self = () => chain;

  const methods = [
    'from', 'select', 'insert', 'update', 'delete',
    'eq', 'order', 'limit', 'neq', 'in', 'is',
  ];

  methods.forEach((m) => {
    chain[m] = self;
  });

  chain['single'] = terminal;
  chain['maybeSingle'] = terminal;

  // Make the chain itself a thenable so awaiting it works without .single()
  chain['then'] = (resolve: (v: QueryResult<T>) => unknown) => Promise.resolve(result).then(resolve);

  return { from: self } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

/**
 * Creates a mock Supabase client where each Supabase table method can be
 * individually stubbed via the returned `mockChains` map.
 *
 * Usage:
 *   const { supabase, mockFrom } = createMockSupabase();
 *   mockFrom.mockReturnValue(buildQueryChain({ data: [...], error: null }));
 */
export function createFlexibleSupabaseMock() {
  const mockSingle = jest.fn();
  const mockMaybeSingle = jest.fn();
  const mockThen = jest.fn();
  const mockSelect = jest.fn();
  const mockInsert = jest.fn();
  const mockUpdate = jest.fn();
  const mockDelete = jest.fn();
  const mockEq = jest.fn();
  const mockOrder = jest.fn();
  const mockFrom = jest.fn();

  const chainSelf = () => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
    order: mockOrder,
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
    then: mockThen,
  });

  mockSelect.mockImplementation(chainSelf);
  mockInsert.mockImplementation(chainSelf);
  mockUpdate.mockImplementation(chainSelf);
  mockDelete.mockImplementation(chainSelf);
  mockEq.mockImplementation(chainSelf);
  mockOrder.mockImplementation(chainSelf);

  mockFrom.mockImplementation(chainSelf);

  const supabase = { from: mockFrom } as unknown as import('@supabase/supabase-js').SupabaseClient;

  return {
    supabase,
    mockFrom,
    mockSelect,
    mockInsert,
    mockUpdate,
    mockDelete,
    mockEq,
    mockOrder,
    mockSingle,
    mockMaybeSingle,
  };
}

// ---------------------------------------------------------------------------
// DB row ↔ RegisteredModule helpers
// ---------------------------------------------------------------------------

export function toDbRow(module: RegisteredModule) {
  return {
    id: module.id,
    module: module.module,
    display_name: module.displayName,
    has_settings: module.hasSettings,
    organization_id: module.organizationId,
    permissions: module.permissions,
    created_at: module.createdAt,
    updated_at: module.updatedAt,
  };
}
