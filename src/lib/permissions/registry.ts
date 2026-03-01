import type { ModuleManifest } from "./types";

/** In-memory module registry. */
const registry = new Map<string, ModuleManifest>();

/** Registers a module with the permission system. */
export function registerModule(manifest: ModuleManifest): void {
  if (registry.has(manifest.module)) {
    console.warn(
      `[Registry] Module "${manifest.module}" is already registered. Overwriting.`
    );
  }
  registry.set(manifest.module, manifest);
}

/** Returns a registered module manifest, or undefined if not found. */
export function getModule(moduleId: string): ModuleManifest | undefined {
  return registry.get(moduleId);
}

/** Returns all registered module manifests. */
export function getAllModules(): ModuleManifest[] {
  return Array.from(registry.values());
}

/** Removes a single module from the registry. */
export function unregisterModule(moduleId: string): void {
  registry.delete(moduleId);
}

/** Clears all registered modules. Intended for use in tests. */
export function clearRegistry(): void {
  registry.clear();
}
