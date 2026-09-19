# Playing the playtest

The sheets do a fair bit of bookkeeping, but the Ref still calls the shots. Keep the books and item descriptions handy. A button usually performs one action; it doesn't check every rule that might make that action available.

Before the first session, review [player permissions and loot setup](README.md#gm-setup-player-permissions).

## Tests, attacks, and expertise

Drag an item onto the hotbar to create a shortcut: weapons open Attack, spellbooks open Cast, and stat-block attacks open their attack dialog. Other items open their sheet for reference, including consumables, traits, armor, and boons. Directory and compendium items open for reference; drag from a Crow or monster inventory to create an action shortcut.

Weapon and spellbook shortcuts require the original item to be equipped in a hand. This is checked again when confirming the roll. Shortcuts retain the original actor and item, regardless of the selected token; deleting or transferring the item requires a new shortcut. Spellbook depletion is checked by the normal casting flow. Consumable effects, ammunition, and trait exceptions remain manual.

**Handled:** characteristic tests, weapon attacks, stat-block attacks, and casting use the system's 2d10 roll flow. Choose standard, edge, bane, double edge, or double bane in the dialog. The roll applies that choice and shows its tier, including crit or doom. Weapon attacks use the item's configured tier damage; stat-block attacks use their printed bonus and tier text.

**Your call:** which characteristic and circumstance apply, whether a target is in range, cover, line of sight, weapon qualities, and what the result means in the scene. Condition icons don't automatically change your roll. Enter situational modifiers and select circumstances yourself.

On supported Crow roll cards, **Apply Expertise** spends one use and raises the result by a tier. Agree on a relevant expertise with the Ref. Use it before applying damage or resolving a spell. The card doesn't offer it on doom, at the highest tier, or after its action has been resolved. Monster stat-block attacks don't have Crow expertise controls; Miasma resistance cards have their own outcome controls.

The Ref can use **Undo Expertise** to refund one use (up to the configured maximum) and restore the previous tier. It does not undo damage already applied; check and correct that separately. Pending or uncertain updates must be reviewed before undo is available.

Weapon qualities are shown as reference text. Resolve special effects, ammunition, reloads, thrown-weapon retrieval, extra actions, counterattacks, and positioning yourself. Adjust the damage amount in the allocation dialog if a quality or other effect changes it.

## Applying damage, armor, and wounds

**Handled after confirmation:** Apply Damage opens an allocation dialog. Review the amount and the AD sources, then confirm. It updates armor/temporary AD, Stamina, and wound slots as appropriate. New attack cards remember applied damage per target to help prevent repeated clicks from applying it twice.

The rolling player doesn't gain permission to change an enemy. The target's owner or GM applies damage. If the roll or target changes while the dialog is open, reopen it for a fresh preview. If an update says it is pending or needs review, check the actor and chat before making a manual correction.

For **Crows**, wounds mark backpack slots. For **Human or Animal NPCs**, they use the actor's configured inventory capacity: set **Type** to Human or Animal and configure **Slots**. Other monster types don't use that same slot-wound model. Overflow damage fills available wound slots in order. An occupied wounded slot reduces the displayed speed; the sheet also calculates the death state.

**Manual:** healing, choosing a different wound location, special damage rules, and the consequences of death. Move a wound by clearing its old slot and marking another. Editing a Stamina field isn't the same as using the damage dialog and doesn't create overflow wounds.

Armor must be active to contribute AD. A Crow's shield must be in a hand; moving it to the backpack, belt, or storage removes its contribution. After returning it to a hand, enable **Worn** again. Use **Shield (hand only)** for a custom or renamed shield. Human/Animal NPC inventory doesn't have the Crow's separate hand layout, so review their equipped shield yourself.

Repair/AD controls change the numbers. They don't check whether you've had enough time, paid a cost, or met the repair requirements.

## Spellbooks

Enable **Spellbook** on an equipment item and configure its usage dice and tier effects. Newly built spellbooks include the flag; rebuilding doesn't update copies already owned by characters.

**Cast** rolls Mind, shows the configured effect text, and allows supported expertise upgrades. A depleted book with a configured usage maximum can't cast through the normal button. The chat card updates its chaos/backlash and usage-dice reminders when expertise changes the result.

**Resolve these yourself:**

- Whether the book must be in hand and whether a trait provides an exception.
- Targets, areas, damage/healing, conditions, and the spell's actual effect.
- Any chaos or backlash roll and its result.
- The spellbook's usage check after casting, when required.
- Effect duration and any separate duration dice.

The casting button doesn't spend usage dice. Use the usage-dice control separately when the rules call for it. On a critical casting, follow the card's reminder to skip the book's usage check. Consult the current packet for the actual spell and backlash rules.

## Items, retrieval, and supplies

Slot placement checks space, including multi-slot equipment. It doesn't check action costs or stop you moving gear at the wrong time. The backpack **DC** button rolls retrieval and reports success or failure; move the item into your hand yourself after a successful result.

A trait can grant extra belt slots once you fill in its **Extra belt slots** and **Slot restrictions** fields. The Crow gains those labelled slots automatically. The label doesn't filter what can go there, and automatic item placement doesn't interpret it. Check the item type yourself.

Purse and ammunition counts are manual: an attack doesn't spend an arrow, and a purchase doesn't debit a purse. Usage dice are different: clicking a usage check rolls the current pool and removes dice showing 1 or 2. A depleted item remains in the inventory. See [Supply items](SUPPLIES.md) for the controls and refill behavior.

Greed stickers change the item's configured bonus and displayed value. Choose the appropriate bonus yourself; dropping or discovering an item doesn't assign it based on the hourglass. Selling it doesn't add gold or change a village's Prosperity progress.

## Miasma and cruelty

The Crow sheet has a Mind resistance roll, cruelty controls, an effect-table roll, and a list for saved effects. Available chat controls can add or clear cruelty; rolling the effect table shows a result that can be saved to the sheet. The tier-three option to help another character is resolved manually.

Saving an effect records its text. It doesn't apply its bonuses, consume food, destroy an item, change behavior, or turn a Crow into an NPC for you. Likewise, clearing cruelty isn't a complete rest action. Handle effect timing and removal with the Ref.

## Rest, advancement, and downtime

**Recover Expertises** fills trained expertise pools back to their configured maximums. **Restore usage dice** refills that one item's usage pool after you confirm the required rest/refill has happened. Neither button performs the rest as a whole.

Check food, safe resting conditions, healing, Stamina recovery, Miasma, repairs, and any other costs or benefits yourself. Travel roles, crafting, purchases, and special trait effects are also manual.

On **Traits**, record all earned XP as **Total XP (TXP)** and purchases as **Spent XP**. The sheet calculates available XP and flags overspending. Adding a trait doesn't pay its cost, validate prerequisites, or apply advancement benefits. Spending XP doesn't lower TXP. Apply purchases and advancement when the rules allow them.

## Dungeon Turn hourglass

The Ref can set the turn number, duration, and encounter threshold, then start or pause the shared timer. It keeps time through background tabs and reloads. Pause it when the group takes a break.

Running out of sand stops the clock. **End Turn** rolls the encounter check, posts the result and reminders, advances the turn, and leaves the new timer paused. Only the active GM changes the shared timer; players can view it.

The checklist is a reminder. It doesn't roll all usage dice, remove conditions, spawn monsters, schedule the warned encounter, assign greed to loot, or adjust token lighting. Resolve those steps at the table. If turn resolution fails partway through, check chat before resetting or repeating it.

Item-driven lighting isn't implemented. Use Foundry's token or scene lighting tools yourself. Depleting a torch's usage dice doesn't extinguish a light automatically.

## Village and crypt reminders

Villages help the group keep records and store equipment. They don't run the village economy or downtime for you. Set cycle/day counters, costs, payments, prosperity changes, and event consequences yourself. A due institution upgrade has a control to apply the saved level; it doesn't deduct gold. Prosperity progress manually tracks gc spent on merchant goods this cycle toward 10,000 gc; reset it yourself for the next cycle.

**Claim boon** copies a custom grave boon to a Crow, asking before replacing an existing boon. It doesn't check eligibility or institution level, enforce a cycle limit, apply effects, or update the grave's holder/uses. Edit the Crow's boon and the grave separately. See [Villages](README.md#villages) for the full workflow.
