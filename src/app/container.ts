import { BUILTIN_RULE_SETS } from '@/rules/builtin';
import { createServices, type ServiceDeps, type Services } from '@/application/services';
import { getRepositories, recordSchemaVersion } from '@/storage';
import { systemClock } from '@/storage/time';
import { createRemoteTournamentService } from '@/net/remoteTournamentService';
import { createRoutedTournamentService } from '@/net/routedTournamentService';
import { getServerLink, serverIsUsable } from './serverLink';

/**
 * The only place that joins Dexie to the application layer.
 *
 * `createServices` takes `Repositories` as a parameter and imports nothing from
 * storage, which is what keeps the application layer free of Dexie. This file is
 * UI-adjacent glue, so it is allowed to know about both.
 *
 * It is also where the second authority is wired in. When a tournament server
 * is serving this app, tournaments come from there instead — the same service
 * interface, a different place behind it — so not one screen has to know which
 * of the two it is looking at.
 */
export function createContainer(overrides: Partial<ServiceDeps> = {}): Services {
  const services = createServices({
    repositories: overrides.repositories ?? getRepositories(),
    clock: overrides.clock ?? systemClock,
    builtins: overrides.builtins ?? BUILTIN_RULE_SETS,
  });

  // Tests build their own container with an explicit repository and never want
  // the ambient server; only the real app goes looking for one.
  if (overrides.repositories) return services;

  const link = getServerLink();
  const remote = createRemoteTournamentService({ link, local: services.tournaments });

  return {
    ...services,
    tournaments: createRoutedTournamentService(services.tournaments, remote, () =>
      serverIsUsable(link.status()),
    ),
  };
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
