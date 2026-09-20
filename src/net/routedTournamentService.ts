import type { TournamentService } from '@/application/services/tournamentService';

/**
 * One tournament service that speaks to whichever authority is there.
 *
 * When the app is served by a tournament server, tournaments belong to that
 * server: it is what the tables are talking to, and a second copy on the
 * organiser's laptop would be a second truth. When there is no server — the
 * ordinary case, including GitHub Pages — everything stays exactly as it was,
 * in IndexedDB.
 *
 * The choice is made per call rather than once at start-up, because the probe
 * that finds a server is asynchronous and the services are built before it
 * answers. It also means a server appearing or going away is picked up without
 * rebuilding the application layer.
 *
 * Note that the two do not merge: a tournament lives in one place or the other.
 * They are also naturally separated in practice, because the server and GitHub
 * Pages are different origins with different browser storage.
 */
export function createRoutedTournamentService(
  local: TournamentService,
  remote: TournamentService,
  serverIsAuthority: () => boolean,
): TournamentService {
  const pick = () => (serverIsAuthority() ? remote : local);

  return {
    // Pure and local by definition: there is no tournament to ask about yet.
    previewPairing: (input, nonce) => local.previewPairing(input, nonce),

    create: (input) => pick().create(input),
    get: (id) => pick().get(id),
    load: (id) => pick().load(id),
    list: (filter) => pick().list(filter),
    lastActive: () => pick().lastActive(),
    remove: (id) => pick().remove(id),
    rename: (id, name) => pick().rename(id, name),

    propose: (id, locked, nonce) => pick().propose(id, locked, nonce),
    validate: (id, matches) => pick().validate(id, matches),
    confirmRound: (id, matches) => pick().confirmRound(id, matches),

    startMatch: (id, matchId, replay) => pick().startMatch(id, matchId, replay),
    replayMatch: (id, matchId) => pick().replayMatch(id, matchId),
    completeRound: (id, roundId) => pick().completeRound(id, roundId),

    startDay: (id) => pick().startDay(id),
    endDay: (id) => pick().endDay(id),
    finish: (id) => pick().finish(id),

    withdraw: (id, participantId) => pick().withdraw(id, participantId),
    reinstate: (id, participantId) => pick().reinstate(id, participantId),

    listTables: (id) => pick().listTables(id),
    addTable: (id, name) => pick().addTable(id, name),
    renameTable: (id, tableId, name) => pick().renameTable(id, tableId, name),
    setTableActive: (id, tableId, active) => pick().setTableActive(id, tableId, active),
    touchMatch: (id, matchId) => pick().touchMatch(id, matchId),
  };
}
