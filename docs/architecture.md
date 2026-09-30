# System architecture

The system supports changing playtest rules, selective automation, and explicit Ref corrections. Preserve those properties when extending it.

## Rules and presentation

- `power-roll.mjs` resolves roll tiers and circumstances.
- `damage.mjs` interprets supported weapon damage and calculates an allocation without writing documents. `allocationForActor` recomputes a submitted allocation from current armor, Stamina, and the chosen source order. Weapon properties should extend the structured calculation before presentation or application; do not implement separate versions in sheets and chat.
- `apps/damage-dialog.mjs` presents the allocation and Ref choices. It submits a snapshot with sheet damage; chat damage additionally checks the card revision.
- `inventory.mjs` owns slot spans, capacity, recognized anchors, occupancy, and stack compatibility. Character creation and document slot reporting use these same rules. Starting-kit placement order is a separate policy.
- `expertises.mjs` defines expertise identities used by the schema, sheets, and chat labels. Existing field names remain unchanged.
- `magic-rules.mjs` owns casting follow-up reminders and the chaos helper. `spellcasting.mjs` performs casting; `miasma.mjs` can roll effects without a sheet instance.

## Coordinated writes

`action-queue.mjs` serializes inventory transfers and coordinated resource actions on the executing client. Player requests are handled by the active Ref. This is client coordination, not a server database transaction or a lock against manual document edits.

`loot.mjs` handles map presentation, access checks, transfer execution, and routing. Backpack scattering moves each item through the same operation as an ordinary map drop. Completed moves stay complete if a later move fails; it never bulk-deletes the originals after a scatter attempt. Creation-only scatter helpers remain available for callers deliberately creating new loot.

`chat-actions.mjs` checks ownership and saved state before applying resources. Usage checks resolve the item again and compare its current pool. Sheet damage and `actor.applyDamage` compare document snapshots. `actor.applyAllocatedDamage` remains the low-level writer for the coordinator; new UI code should submit an action instead of calling it directly.

Chat actions persist claims before resource writes. Pending/uncertain actions can be reconciled by the Ref after manually inspecting and correcting resources. Reconciliation records the decision and original claim and adjusts card state, without repeating the resource write. This distinction matters after a partially completed operation.

Manual edits and direct low-level document calls remain possible. Network failures spanning multiple documents still require Ref inspection; do not describe these operations as atomic or promise automatic rollback after a disconnect.

## Containers and imported content

Containers are not implemented in this pass. Current ground loot still represents one item. Keep private Ref preparation, discovering a scene object, inspecting contents, and taking/depositing items as separate design decisions. Do not expose prepared world actors merely to enable scene interaction.

The PDF ingestion module is external. Existing importer entry points and content contracts are preserved. No parser or content pipeline redesign is included here.

## Verification

Run `node --test tests/*.test.mjs`. Release automation runs this suite before packaging. Local generated-content integration checks skip when that content is absent.

The Node suite uses Foundry stubs. Before release, also verify with a Ref and two player clients: partial backpack scatter, simultaneous usage checks, stale damage dialogs, ownership rejection, recovery after an uncertain chat action, and existing map-loot visibility. Check the large damage dialog in Foundry after moving it between windows and changing armor sources. Automated tests do not replace that live check.
