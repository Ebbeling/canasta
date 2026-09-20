# Tournament Technical Specification

**Project:** Canasta Puntentelling PWA
**Feature:** Tournament Management
**Status:** Draft — Functional & Technical Foundation
**Version:** 1.0

---

# 1. Purpose

The Tournament feature adds a tournament management layer above the existing Canasta Game domain.

A tournament organizes multiple simultaneous and sequential Canasta games, manages participants and optional permanent teams, generates table/match assignments, tracks rounds and playing days, and calculates tournament standings.

The existing Game domain remains responsible for:

* Rule Set
* game configuration
* players participating in a game
* teams participating in a game
* rounds
* Canasta scoring
* game validation
* game completion

Tournament functionality must not duplicate or modify the existing game scoring engine.

The relationship is:

```text
Tournament
    │
    ├── Tournament Settings
    ├── Game Settings
    ├── Participants
    ├── Playing Days
    │      └── Rounds
    │             └── Matches
    │                    └── Game
    │
    └── Standings
```

---

# 2. Core Concepts

The Tournament domain introduces the following concepts:

| Concept             | Purpose                                                            |
| ------------------- | ------------------------------------------------------------------ |
| Tournament          | Complete competition spanning one or more playing days             |
| Tournament Settings | Rules governing tournament behavior                                |
| Game Settings       | Configuration of the individual Canasta games                      |
| Participant         | Player or permanent team participating in the tournament           |
| Team                | Permanent group of players                                         |
| Playing Day         | A calendar/organizational session containing rounds                |
| Round               | One tournament cycle in which all active participants are assigned |
| Match               | One table assignment within a round                                |
| Game                | Existing Canasta game used to play the match                       |
| Pairing             | Generated assignment of participants to matches                    |
| Standing            | Derived tournament ranking                                         |

---

# 3. Tournament Modes

A tournament has one of two planning modes.

## 3.1 Fixed Tournament

The organizer specifies the planned tournament structure in advance.

Example:

```text
Tournament
    Mode: Fixed

Day 1
    Round 1
    Round 2
    Round 3

Day 2
    Round 4
    Round 5
    Round 6
```

The number of days and rounds is known when the tournament is configured.

A fixed tournament may still contain operational changes that are explicitly allowed by the tournament settings, such as manually adjusting a round's generated pairing.

---

## 3.2 Open Tournament

An open tournament has no predetermined total number of days or rounds.

After each completed round the organizer decides what happens next.

Possible actions:

```text
[ Start another round ]

[ End playing day ]

[ End tournament ]
```

If the playing day is ended, the tournament remains active.

A later session can create a new playing day.

Example:

```text
Day 1
    Round 1
    Round 2
    Round 3
    → Day ended

Day 2
    Round 4
    Round 5
    → Day ended

Day 3
    Round 6
    → Tournament ended
```

An open tournament therefore has no required total number of days or rounds.

---

# 4. Tournament Settings

Tournament settings are separate from Game settings.

Example:

```ts
interface TournamentSettings {
  mode: "fixed" | "open";

  scoringMode:
    | "canasta-score"
    | "tournament-points";

  drawAllowed: boolean;

  oddParticipantMode:
    | "extra-player-at-table"
    | "bye";

  manualPairingAllowed: boolean;

  plannedDays?: PlannedTournamentDay[];
}
```

The exact persisted representation may evolve during implementation.

---

# 5. Tournament Scoring

The organizer selects the tournament scoring method when creating the tournament.

## 5.1 Canasta Score

The tournament ranking is based on the cumulative Canasta score obtained in completed games.

Example:

```text
Team A    15,240
Team B    13,890
Team C    12,450
```

The tournament does not replace the score calculated by the existing Game engine.

The tournament aggregates the final result of each completed Game.

---

## 5.2 Tournament Points

Each completed match produces tournament points.

Default result mapping:

```text
Win       2 points
Draw      1 point
Loss      0 points
```

A draw is only applicable when draws are enabled by the tournament settings.

Tournament points are accumulated across completed matches.

Example:

```text
Participant    R1    R2    R3    Total

Team A          2     2     1      5
Team B          0     2     2      4
Team C          1     0     0      1
```

All rounds have equal weight.

There are no bonus points for later rounds or finals in the initial model.

---

# 6. Draw Configuration

Whether a draw is possible is a tournament setting.

```text
drawAllowed: true
```

or:

```text
drawAllowed: false
```

The Tournament domain must not invent a draw result when the selected Game Rule Set does not produce one.

The exact interaction between a non-draw tournament and a tied Game result must be resolved against the existing Game rules before implementation of this edge case.

---

# 7. Participants

A tournament has a defined participant set.

Participants can consist of:

### Individual tournament

```text
Players
    A
    B
    C
    D
    E
    F
```

### Team tournament

```text
Team A
    Player A
    Player B

Team B
    Player C
    Player D
```

The distinction is important:

```text
Player
Team
Tournament Participant
```

A participant can represent an individual player or a permanent team.

---

# 8. Permanent Teams

When teams are used, team membership does not change during the tournament.

Example:

```text
Team A
    Michel
    Jan
```

remains:

```text
Team A
    Michel
    Jan
```

for every round.

The pairing engine therefore treats a permanent team as an indivisible participant.

Team membership cannot be changed through normal round pairing.

---

# 9. Individual Tournaments

In an individual tournament, participants are individual players.

The pairing engine determines the composition of each match/playing table for every round.

Players can therefore have different temporary table/partner relationships in different rounds.

Example:

```text
Round 1
A B C D

Round 2
A E F G

Round 3
A H B C
```

The individual tournament does not create permanent teams from these temporary relationships.

---

# 10. Game Configuration

A tournament contains a Game Configuration.

This defines the configuration used for the individual games.

Example:

```text
Game Settings

Rule Set:
    Classic Canasta

Participants per match:
    4

Teams per match:
    2
```

The tournament Game Configuration produces the effective Game configuration used when individual Games are created.

Existing Rule Set functionality must be reused.

A tournament must not duplicate Rule Set definitions.

---

# 11. Rule Set Snapshot

When a tournament is started, the effective Game configuration should be frozen in the same spirit as existing Games.

The tournament should therefore retain the configuration necessary to reproduce the Games that belong to it.

Existing Game snapshot semantics remain authoritative for individual Games.

---

# 12. Playing Days

A Tournament may contain multiple Playing Days.

```text
Tournament
    ├── Day 1
    │   ├── Round 1
    │   ├── Round 2
    │   └── Round 3
    │
    └── Day 2
        ├── Round 4
        └── Round 5
```

A Playing Day is an organizational boundary.

The number of rounds on each day does not have to be equal.

For open tournaments, the number of Playing Days is not known in advance.

---

# 13. Rounds

A Round represents one complete tournament cycle.

Lifecycle:

```text
Round planned
    ↓
Pairing generated
    ↓
Pairing optionally adjusted
    ↓
Pairing confirmed
    ↓
Matches created
    ↓
Games played
    ↓
All matches completed
    ↓
Round completed
```

A round is not considered complete until all required matches have reached a terminal state or the organizer explicitly resolves an exception.

---

# 14. Matches

A Match represents one table assignment within a Round.

Example:

```text
Round 3

Match 1
    Table 1
    Michel
    Jan
    Peter
    Karin

Match 2
    Table 2
    Linda
    Henk
    Ronald
    Susan
```

Each Match references one existing Game.

Conceptually:

```text
Tournament
    ↓
Round
    ↓
Match
    ↓
Game
```

The Match is the tournament context.

The Game is the actual Canasta game.

---

# 15. Game Ownership

A Game should not contain tournament logic.

The existing Game remains responsible for:

```text
RoundInput
    ↓
recomputeGame()
    ↓
Game result
```

The Tournament consumes the completed Game result.

Therefore:

```text
Tournament
    ──uses──> Game

Game
    ──does not depend on──> Tournament
```

This preserves domain separation.

---

# 16. Table Capacity

The tournament defines the normal number of participants per table.

Example:

```text
playersPerMatch = 4
```

For an exact multiple:

```text
12 players
3 tables × 4
```

For an uneven number of participants, the tournament setting determines the behavior.

---

# 17. Odd Participant Handling

The default behavior is:

```text
oddParticipantMode = "extra-player-at-table"
```

Example:

```text
13 players
4 normal players per table

Table 1    4
Table 2    4
Table 3    5
```

An alternative setting may be:

```text
oddParticipantMode = "bye"
```

The pairing engine must support both modes.

---

# 18. Bye

A bye is an explicit pairing outcome.

A bye is different from absence.

```text
Bye
    = participant was part of the round allocation
      but did not receive a normal match assignment

Absent
    = participant did not participate in the round
```

The tournament scoring behavior for a missed round is:

```text
Missed round → 0 tournament points
```

No automatic compensation is awarded.

The exact score aggregation for a Canasta-score tournament when a participant misses a round must preserve the absence rather than fabricate a Game result.

---

# 19. Pairing Engine

The Pairing Engine generates a valid assignment of participants to matches.

It must be separated from the Tournament UI and from the Game scoring engine.

```text
PairingInput
    ↓
PairingEngine
    ↓
PairingProposal
```

---

# 20. Pairing Constraints

The pairing system has two conceptual layers.

## Hard constraints

These determine whether a pairing is valid.

Examples:

* every active participant appears at most once in the round
* every participant is assigned to a valid match
* permanent teams remain together
* match capacity rules are respected
* odd-participant policy is respected
* inactive/absent participants are excluded
* manually fixed assignments are respected when manual pairing is enabled

A solution violating a hard constraint is invalid.

---

# 21. Pairing Optimization

Once a valid solution exists, the engine optimizes the quality of the pairing.

The initial optimization priorities are:

1. Minimize repeated temporary partners.
2. Minimize repeated opponents.
3. Distribute encounters as evenly as possible.
4. Prefer balanced participation where applicable.

These are optimization goals, not hard validity rules.

A repeated opponent may therefore occur when no better valid assignment exists.

The engine must never report an invalid pairing merely because an ideal pairing was impossible.

---

# 22. Pairing History

The pairing engine requires historical information from completed rounds.

Conceptually:

```text
PairingHistory
    ├── partner encounters
    ├── opponent encounters
    ├── previous table assignments
    └── participation history
```

This history is derived from completed/confirmed tournament matches rather than being manually maintained by the UI.

---

# 23. Pairing Proposal

The pairing engine returns a proposal rather than immediately changing the tournament.

```ts
interface PairingProposal {
  roundId: string;

  matches: ProposedMatch[];

  quality?: PairingQuality;

  warnings?: PairingWarning[];
}
```

The proposal can then be:

```text
Generated
    ↓
Reviewed
    ↓
Optionally manually modified
    ↓
Confirmed
```

---

# 24. Manual Pairing

Manual modification is controlled by:

```text
manualPairingAllowed
```

If disabled:

```text
Generate
    ↓
Review
    ↓
Confirm
```

If enabled:

```text
Generate
    ↓
Review
    ↓
Modify
    ↓
Validate
    ↓
Confirm
```

Manual modification must still respect all hard constraints.

The UI may therefore not create an invalid final round.

---

# 25. Round Creation

A new round follows:

```text
1. Determine active participants
2. Determine pairing inputs
3. Read pairing history
4. Generate valid pairing
5. Optimize pairing
6. Present proposal
7. Organizer optionally modifies proposal
8. Validate final pairing
9. Confirm pairing
10. Create Matches
11. Create Games
12. Start round
```

---

# 26. Round Completion

When every required Match has completed:

```text
Matches
    ↓
Game results
    ↓
Round result
    ↓
Tournament standings
```

The Tournament should derive its standings from recorded Match/Game results.

---

# 27. Tournament Standings

Standings are derived, not the primary source of truth.

Conceptually:

```text
Completed Games
      ↓
Tournament Result Projection
      ↓
Standings
```

This allows the standings to be recomputed after reopening or importing a tournament.

---

# 28. Standings — Canasta Score

When:

```text
scoringMode = "canasta-score"
```

the ranking is based on cumulative Canasta score.

The Game result supplies the score.

The Tournament aggregates it over completed matches.

---

# 29. Standings — Tournament Points

When:

```text
scoringMode = "tournament-points"
```

each completed Match produces:

```text
Win   → 2
Draw  → 1
Loss  → 0
```

The total is accumulated over completed matches.

All rounds have equal importance.

---

# 30. Missing Rounds

If a participant misses a round:

```text
Round result = no participation
Tournament points = 0
```

No artificial win, draw or loss should be created unless the tournament rules explicitly define one.

---

# 31. Tournament Lifecycle

A Tournament has a lifecycle independent from individual Games.

Suggested states:

```text
draft
ready
active
paused
completed
```

Possible flow:

```text
draft
  ↓
ready
  ↓
active
  ↓
paused
  ↓
active
  ↓
completed
```

For an open tournament:

```text
active
  ↓
round completed
  ↓
organizer decision
  ├── another round
  ├── end day
  └── end tournament
```

Ending a playing day does not complete the tournament.

---

# 32. Tournament Completion

A tournament becomes completed only when the organizer explicitly ends it or a fixed tournament reaches its planned final state.

Completion produces a final standings projection.

The tournament becomes historical.

Changing later configuration must not alter completed historical results.

---

# 33. Proposed Domain Model

Conceptually:

```text
Tournament
│
├── settings
├── gameSettings
│
├── participants
│   ├── players
│   └── teams
│
├── playingDays
│   │
│   ├── rounds
│   │   │
│   │   ├── matches
│   │   │   └── gameId
│   │   │
│   │   └── ...
│   │
│   └── ...
│
└── derived standings
```

---

# 34. Core Entities

## Tournament

```ts
interface Tournament {
  id: string;

  name: string;

  mode: "fixed" | "open";

  status:
    | "draft"
    | "ready"
    | "active"
    | "paused"
    | "completed";

  settings: TournamentSettings;

  gameSettings: TournamentGameSettings;

  participants: TournamentParticipant[];

  playingDays: TournamentDay[];

  createdAt: string;
  updatedAt: string;
}
```

---

## Tournament Participant

```ts
interface TournamentParticipant {
  id: string;

  type: "player" | "team";

  playerId?: string;
  teamId?: string;

  status:
    | "active"
    | "withdrawn";
}
```

---

## Tournament Team

```ts
interface TournamentTeam {
  id: string;

  name: string;

  playerIds: string[];
}
```

Team membership is fixed for the tournament.

---

## Tournament Day

```ts
interface TournamentDay {
  id: string;

  tournamentId: string;

  date?: string;

  sequence: number;

  status:
    | "planned"
    | "active"
    | "completed";

  roundIds: string[];
}
```

The exact date remains optional because an open tournament may not know its future schedule.

---

## Tournament Round

```ts
interface TournamentRound {
  id: string;

  tournamentId: string;

  dayId: string;

  sequence: number;

  status:
    | "planned"
    | "pairing"
    | "ready"
    | "active"
    | "completed";

  matches: TournamentMatch[];
}
```

---

## Tournament Match

```ts
interface TournamentMatch {
  id: string;

  tournamentId: string;

  roundId: string;

  tableNumber: number;

  participantIds: string[];

  gameId?: string;

  status:
    | "planned"
    | "ready"
    | "active"
    | "completed"
    | "cancelled";
}
```

---

# 35. Separation of Responsibilities

```text
┌───────────────────────────────┐
│ Tournament Domain             │
│                               │
│ lifecycle                     │
│ rounds                        │
│ matches                       │
│ participants                  │
│ standings                     │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Pairing Engine                │
│                               │
│ constraints                   │
│ history                       │
│ optimization                  │
│ pairing proposal              │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Existing Game Domain          │
│                               │
│ Rule Set                      │
│ RoundInput                    │
│ scoring                       │
│ validation                    │
│ recomputeGame()               │
└───────────────────────────────┘
```

The Tournament system must not move Canasta scoring logic into the Tournament domain.

---

# 36. Application Services

Potential application-level operations:

```ts
createTournament()
configureTournament()
addParticipant()
removeParticipant()
createTeam()
assignPlayerToTeam()

createRound()
generatePairing()
modifyPairing()
validatePairing()
confirmPairing()

startMatch()
completeMatch()

completeRound()

startPlayingDay()
endPlayingDay()

finishTournament()

recomputeTournament()
```

These are application operations, not necessarily the final public API names.

---

# 37. Tournament Projection

A Tournament ViewModel should expose the information required by the UI.

Potential projections:

```text
TournamentDashboardVM
TournamentStandingsVM
TournamentRoundVM
TournamentMatchVM
TournamentParticipantVM
TournamentSetupVM
PairingProposalVM
```

The UI should not inspect raw Tournament configuration to determine presentation text.

For example:

```text
"3 van 6 spelers"
```

or:

```text
"2 van 3 teams"
```

should be produced by a viewmodel.

This follows the existing architecture.

---

# 38. Tournament Dashboard

The dashboard is the operational control center.

Primary information hierarchy:

```text
Tournament identity
        ↓
Current playing day
        ↓
Current round
        ↓
Tables / matches
        ↓
Game status
        ↓
Current standings
        ↓
Next action
```

The dashboard must support multiple simultaneous games.

---

# 39. Mobile Dashboard

Mobile prioritizes operational information:

1. Current round
2. Table status
3. Participants
4. Open game
5. Round completion
6. Standings

Avoid requiring the organizer to navigate through multiple screens simply to determine which tables are still playing.

---

# 40. Desktop Dashboard

Desktop may use the available width to show multiple operational areas simultaneously.

Conceptually:

```text
DesktopRail
      │
      ▼
┌─────────────────────────────────────────────┐
│ Tournament PageBar                          │
├─────────────────────────────────────────────┤
│                                             │
│ Current Round                               │
│                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│ │ Table 1  │ │ Table 2  │ │ Table 3  │ ... │
│ │ ● Active │ │ ✓ Done   │ │ ● Active │     │
│ └──────────┘ └──────────┘ └──────────┘     │
│                                             │
│ Standings / activity                        │
│                                             │
└─────────────────────────────────────────────┘
```

The final UI must follow the Tournament design produced in Claude Design.

---

# 41. Tournament Creation Flow

The planned wizard:

```text
Step 1
Tournament

Step 2
Game

Step 3
Participants

Step 4
Pairing

Step 5
Review

Start Tournament
```

For an open tournament, the UI must clearly communicate that the total duration is not predetermined.

---

# 42. Important Invariants

The implementation must enforce:

### Tournament

* A completed tournament cannot be changed as an active tournament.
* Historical Games remain immutable snapshots.
* Standings are reproducible from stored results.

### Teams

* Permanent team membership cannot change through normal pairing.
* A team cannot be partially assigned to a match.

### Round

* A participant cannot be assigned to two matches in the same round.
* A confirmed pairing cannot violate hard constraints.

### Match

* A Match references at most one Game.
* A completed Match has a completed Game result.

### Pairing

* Hard constraints always override optimization.
* Optimization may produce a less-than-perfect result if necessary.
* The engine must never sacrifice validity to achieve an optimization goal.

---

# 43. Future Extensibility

The initial Tournament implementation should not hard-code a single pairing algorithm into the Tournament entity.

Instead:

```text
Tournament
    ↓
PairingStrategy
    ↓
PairingEngine
```

This allows future formats such as:

* different pairing strategies
* round-robin
* Swiss-style pairing
* manually controlled tournaments
* other competition formats

without changing the fundamental Tournament/Game relationship.

These formats are not part of the initial implementation unless explicitly selected later.

---

# 44. Initial Implementation Scope

Version 1 should support:

* Fixed tournaments
* Open tournaments
* Multiple playing days
* Multiple rounds
* Multiple simultaneous tables
* Individual participants
* Permanent teams
* Automatic pairing
* Pairing optimization
* Optional manual pairing
* Configurable odd-participant handling
* Canasta-score standings
* Tournament-point standings
* Optional draws
* Missed-round handling
* Existing Game integration
* Tournament dashboard
* Round management
* Standings
* Tournament completion
* Resume across playing days

---

# 45. Explicitly Out of Scope Until Defined

The following should not be invented during implementation:

* Exact tie-break hierarchy for tournament standings
* Advanced pairing formats
* Swiss pairing
* Round-robin guarantees
* Automatic player replacement
* Compensation for missed rounds
* Final rounds with special weighting
* External/cloud tournament synchronization
* Tournament networking
* Live multi-device synchronization

These can become later features.

---

# 46. Architectural Principle

The most important architectural principle is:

> **Tournament organizes Games; it does not become part of the Game engine.**

Therefore:

```text
Game
    = How one Canasta game works.

Tournament
    = How multiple Canasta games are organized.

Pairing Engine
    = Which participants play together.

Tournament Standings
    = How completed game results are aggregated.
```

This separation allows the existing Game engine to remain stable while Tournament becomes a new domain/application layer.

---

# 47. Target Architecture

```text
src/
├── domain/
│   ├── game/
│   └── tournament/
│       ├── tournament.ts
│       ├── participant.ts
│       ├── team.ts
│       ├── day.ts
│       ├── round.ts
│       ├── match.ts
│       ├── standings.ts
│       └── ...
│
├── pairing/
│   ├── constraints/
│   ├── optimization/
│   ├── pairingEngine.ts
│   └── ...
│
├── scoring/
│   └── existing game scoring
│
├── application/
│   ├── tournament/
│   │   ├── commands/
│   │   ├── services/
│   │   └── viewmodels/
│   └── existing game application
│
├── storage/
│   └── Dexie
│
└── routes/
    └── tournament/
```

The exact directory structure may be adapted to the existing project conventions.

---

# 48. Implementation Strategy

The Tournament feature should be implemented incrementally.

Recommended order:

```text
T1
Domain model
    ↓
T2
Tournament lifecycle
    ↓
T3
Participants / permanent teams
    ↓
T4
Pairing engine
    ↓
T5
Round + Match integration
    ↓
T6
Tournament standings
    ↓
T7
Persistence
    ↓
T8
Tournament setup UI
    ↓
T9
Tournament dashboard
    ↓
T10
Multi-day / open tournament flow
    ↓
T11
Export / final polish
```

Each phase should preserve the existing Game behavior and test suite.

---

# 49. Guiding Principle

The Tournament feature should feel like a serious tournament management system built on top of the existing Canasta game engine.

The system should make this flow natural:

```text
Configure tournament
        ↓
Select game
        ↓
Select participants
        ↓
Generate pairing
        ↓
Review / adjust
        ↓
Start round
        ↓
Multiple Games run simultaneously
        ↓
Games complete
        ↓
Round completes
        ↓
Standings update
        ↓
Next round
        ↓
Next playing day
        ↓
Tournament completes
```

The Tournament layer coordinates the competition.

The Game layer remains the authoritative source for an individual Canasta game.

The Pairing Engine determines fair participant allocation.

The Standings projection determines the current tournament ranking from recorded results.
