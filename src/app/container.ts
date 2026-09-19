import { BUILTIN_RULE_SETS } from '@/rules/builtin';
import { createServices, type ServiceDeps, type Services } from '@/application/services';
import { getRepositories, recordSchemaVersion } from '@/storage';
import { systemClock } from '@/storage/time';

/**
 * The only place that joins Dexie to the application layer.
 *
 * `createServices` takes `Repositories` as a parameter and imports nothing from
 * storage, which is what keeps the application layer free of Dexie. This file is
 * UI-adjacent glue, so it is allowed to know about both.
 */
export function createContainer(overrides: Partial<ServiceDeps> = {}): Services {
  return createServices({
    repositories: overrides.repositories ?? getRepositories(),
    clock: overrides.clock ?? systemClock,
    builtins: overrides.builtins ?? BUILTIN_RULE_SETS,
  });
}

let shared: Services | undefined;

export function getContainer(): Services {
  shared ??= createContainer();
  return shared;
}

/** Records the schema version so a broken install can be diagnosed. */
export async function initialiseStorage(): Promise<void> {
  await recordSchemaVersion(getRepositories());
}
