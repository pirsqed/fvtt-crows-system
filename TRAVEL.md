# Travel

Open **Actors → Start Travel**, or **Settings → Configure Settings → Crows → Open Travel Helper**.
The same window can be opened from a script macro with `game.crows.travel.show()`.

The Ref starts the day. Connected players who own a traveling crow receive the window automatically.
Anyone can close and reopen it without losing progress. Joining an ongoing day opens it for participating players, too.

**Cancel travel** in the Ref's footer returns everyone with an open helper to party selection. It keeps the roster,
clears pace, votes, and role assignments, and lets the Ref restart the same unfinished day. Cancelling after a day
is complete preserves its day count. This resets the helper only; character-sheet changes and chat rolls remain.
Back, Next, and Cancel stay visible while the procedure scrolls. Once pace selection is finished, use **Change pace**
to reopen voting. The roster drawer stays open across edits, and its cards support keyboard selection.

1. **Choose pace.** Players who own at least one traveling crow each get one advisory vote. They can change it while voting is open. The Ref chooses the final pace, including when votes are tied or some players abstain.
2. **Choose roles.** Players assign their own traveling crows to supporter, guide, scout, or tracker, or leave them unassigned/assisting. Role choices show current occupancy. Conflicting player requests are processed in order; a rejected choice keeps the previous assignment and explains how to proceed. The Ref can override the usual limits, with a warning, or clear an assignment to free a role.
3. **Continue the procedure.** The Ref advances through travel and encounters, exploration, rest, and Miasma. Any step can be revisited or skipped after choosing a pace. Vacancies and role-limit warnings do not block progression.
4. **Finish the day.** Starting the next day clears votes, pace, and roles, and remembers the selected party. The first day defaults to every world actor of type `crow`; an intentionally empty party remains empty. Newly created crows can be added manually to an established party.

Use the party selection cards before starting a day, or **Adjust Party Roster** during travel, to change the party. Uncheck retired, dead, or absent crows; they remain available to add back later. Click a crow's name to open its sheet.
The Ref's imported-table picker opens any existing world RollTable using its normal Foundry sheet.
Compendium tables should be imported into the world first. Missing tables do not block travel.

This helper coordinates the procedure. It does not bundle role tasks, result descriptions, encounter entries,
POIs, or Miasma effects, and it does not automatically roll tests, move tokens, spend supplies, or apply rest benefits.
Resolve those using imported content, existing character sheets, and the Ref's judgment.

The active GM coordinates shared updates. A disconnected GM produces a recoverable message; reopen the helper
or retry after a GM reconnects. Stale requests from a previous travel day cannot change the current day.

## Multiplayer playtest

- Start a day with a Ref and two players; confirm participating owners receive the window and can reopen it.
- Vote from both players; verify votes update everywhere and only the Ref chooses the final pace.
- Select guide simultaneously from both players; verify exactly one succeeds and the other can select another role.
- Override a role limit as Ref, advance despite the warning, then return and correct it.
- Remove the guide's crow and assign a new guide; verify the old assignment no longer occupies the role.
- Change the party, finish the day, reload, and start the next day; verify the party is remembered and votes/roles reset.
- Open an imported table. Repeat with no world tables and confirm progression still works.
- Disconnect the active GM during selection; verify a clear error and recovery when a GM returns.

Automated tests cover state transitions, permissions, simultaneous writes, socket replies, stale days, and window visibility.
The template is also checked in a headless browser with the installed Foundry stylesheet. A live multi-client Foundry playtest remains necessary.
