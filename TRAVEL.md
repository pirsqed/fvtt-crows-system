# Travel helper

Open **Actors → Travel**, the Travel Helper settings menu, or `game.crows.travel.show()`.
The Ref starts and advances the shared day. Participating players can reopen the helper without losing saved progress.

## Day overview

The persistent overview shows chosen pace, final hex allowance, travel EN, rest EN, and lost status.
The Ref can enter totals or use +/− controls. Selecting a pace supplies starting values; later pace changes update only values the Ref has not manually adjusted. Existing saved travel EN values are preserved. EN is normally capped at 10 by the rules, but the helper permits Ref overrides.

Day notes can explain modifiers, destinations, rulings, and reminders. All notes and results are shared with the party; they are not private Ref notes.

## Party and roles

The first roster defaults to world Crows. The Ref can add other actors or named hirelings without creating actor sheets. Named travelers remain Ref-controlled; linked actors use their existing ownership permissions. Party selection lists living Crows first, then travelers without actors, then a collapsible list of other actors. Actors marked dead are excluded from selection and the traveling roster. Other excluded travelers remain available in Edit party.

Role selection keeps travelers together in character-name order, regardless of their assigned role. The step reminder gives the resolution order: supporters, guide, scouts, trackers. Players assign their own actors during the roles step; the Ref can revisit the roles step to change assignments and override usual role limits. Everyone can leave roles vacant.

Each traveler has Ref-controlled travel EN, rest EN, and hex +/− buttons. Each click updates the day total and records that traveler’s contribution; reversing it reverses that contribution. Manual overview changes remain independent. Removing a traveler does not undo already applied adjustments; the Ref can revise the overview. Optional freeform **Result** and **Outcome / ruling** fields sit in a collapsed expander. Enter a roll, tier, skipped test, assistance, or any Ref ruling. No tasks or outcome rules are embedded. Recording “+1 rest EN” does not change the overview: the Ref applies adjustments separately. Owners can update their own records, and the Ref can update any record. Role editing is confined to Choose roles. Later steps provide read-only role outcomes inside the collapsed day notes disclosure. Choose pace shows only pace choices, with no role or encounter records.

## Checks and references

The encounter step rolls 1d10 against the current travel EN, posts to chat, and saves the number and EN in the day record. It never rolls tables or applies consequences. A 10 meeting the EN is described as an immediate encounter without assuming monsters or an ambush. The Ref can edit saved results/notes and add manual encounter records for checks resolved elsewhere, including rest checks. Editing a record does not rewrite chat. The Ref can delete individual encounter entries; deleting a helper entry leaves its chat roll unchanged.

Each step has a compact, relevant Rules Book page reference beneath its introduction. Role resolution offers direct links to Minor/Major Interesting Things; travel and rest offer Travel Encounters. Only travel and rest have a collapsed “All world tables” picker, containing every world table alphabetically. Roles show only the two relevant reference links. Reference matching tolerates short names, spacing, and original import identifiers/source pages. Links prefer matching world tables, then read directly from the PDF importer’s Ref Tables compendium. No world-table copy is needed to open and roll a reference. If neither source contains the table, the helper asks you to import your Ref Book PDF. Copy a table into the world only when you want to customize it. Other steps have no table picker. The optional all-world-tables picker lists world overrides; the named reference links also support the Ref Tables compendium. Missing tables never block progress. No extraction changes are required.

## Rest, Miasma, and next day

Rest provides reminders and an encounter-check button using rest EN; Miasma retains character-sheet links. Rest rolls are labeled in chat and the day’s encounter records. The helper does not spend supplies, apply recovery, or roll Miasma resistance. During exploration, leave the helper open for a short point of interest or use **Conclude travel** to finish the day at a destination without visiting rest or Miasma. This retains today’s records until the next day starts; completed days are also saved to the journal. The dungeon timer remains independent.

The Ref can revisit or skip steps after choosing a pace; blank results do not block advancement. Completing the day offers **Finish Travel** or **Start next day**, whether reached after rest/Miasma or directly from exploration. Finish Travel ends the active session and returns to party selection without increasing the day count; the last day’s data remains saved until a subsequent day is started. Before either action, the completion page previews a journal entry and offers an additional-notes box. Both actions save a page in Travel Journal before ending/resetting the day. If saving fails, the day stays open; retries do not duplicate the page. Cancel day does not save a journal entry. Starting the next day retains the party and lost status, but clears pace, votes, assignments, results, checks, daily notes, and adjustments. Cancelling clears the current day while retaining the party and lost status; sheets and chat are unchanged.

## Verification

Automated tests cover saved state, old-state compatibility, Ref overrides, linked/named hirelings, ownership, freeform records, day resets, and serialized multiplayer updates. Template fixtures cover all steps and player/Ref controls. A live multiplayer Foundry playtest is still needed.

## Travel Journal

Settings → Crows → **Automatically save travel journals** is enabled by default. Turn it off to finish or advance travel without creating journal entries. Existing journals are kept. The helper hides journal setup/preview fields and shows a reminder that saving is off. Turning it back on saves future completed days only; skipped days are not backfilled.

Each journey gets its own journal. Before starting, the Ref can enter a title, starting location, goals, and journey notes on the traveler-selection screen. When its first completed day is saved, these become an opening Journey page; subsequent days append to that same journal. Finish Travel ends the journey, so the next trip starts at Day 1 in a separate journal. Existing days from before this change stay in their original Travel Journal.

Each completed day becomes a text page in that journey’s journal. It records the selected party and roles, pace, lost status, final hex allowance and encounter numbers, each role’s adjustments/results/notes, other adjustments, encounter checks and notes, and freeform day notes. The hex total is an allowance, not confirmed distance traveled. Sheet-based rest and Miasma outcomes are not inferred; record them in notes if desired.

The additional-notes box is a draft until Finish Travel or Start next day is clicked. Its live preview matches the saved entry. Afterward, players can open the journey journal from Foundry’s Journal Entries directory. Saved pages preserve names and outcomes even if actors change later.

Settings → Crows → Travel journal editors defaults to All players. Everyone can read the journal; Trusted Players and above restricts editing to Trusted Players and the Ref. This updates all existing travel journals as well as new pages and follows user-role changes while an active Ref is connected. It does not restrict the live travel helper. The system manages journal ownership; custom per-page sharing should be avoided.

Players can edit the opening page and saved days in Foundry. Saving later days or retrying a completed save preserves those edits. After a day page has saved, correct it directly in the journal; a retry does not regenerate it from the helper. Journey fields supply the opening page once, not ongoing synchronization with player-written notes.
