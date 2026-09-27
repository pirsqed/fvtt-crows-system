# Purses, ammunition, and usage dice

A purse, a quiver, and a torch all need tracking, but they don't use the same counter. Here's what the buttons actually change. :)

## Counts inside an item

On the equipment sheet, **Item contains** selects Nothing, Gold, Arrows, or Bolts. **Contents quantity** is how much is inside, and **Contents maximum** is its capacity. These are separate from the number of copies of the item itself.

A supply holder is one item, uses its normal inventory slots, and doesn't stack with another holder. You can edit its capacity for fine/masterwork gear or a custom item.

Default presets give purses a maximum of 500 gc and start ordinary purses empty. Standard quivers and bolt cases start with 20 arrows or bolts. The character creator puts the starting gold roll plus the background bonus into one purse; it doesn't also make a loose-gold stack. Templates can specify different counts and capacities.

Use the labelled count or **+ / −** controls on the inventory card to spend or replenish contents. Emptying a holder leaves the holder in place. The system prevents increasing its contents beyond the maximum. Lowering the maximum below the current count preserves the contents and shows **Over capacity**; sort that out manually. Changing the contents type resets the count to zero.

**These counts don't change when you attack or shop.** Spend ammunition, handle reloads and recovered arrows, and pay for purchases yourself. To move gold between two purses, reduce one count and increase the other. Adjusting a count doesn't change another item or a village's Prosperity progress.

Moving, dropping, or picking up the whole holder preserves its contents and maximum.

## Loose coins

The Crow's **gc** display adds up gold in its supply items and equipment marked **Gold Coins**. It doesn't include coins stored in the village inventory.

The **+** beside gc creates a loose Gold Coins item. Set its quantity on the item sheet; one stack holds up to 250 gc and uses one slot. This button doesn't fill a purse. Moving loose gold into a purse is a manual change to both counts.

Village inventory can store purses and loose coin items. Prosperity progress records spending during the cycle, not stored money. Deposits, withdrawals, purchases, and sale proceeds don't automatically update that progress.

## Usage dice

Usage dice are a pool of dice, not a count of arrows or coins. Equipment can store both current and maximum usage dice.

Clicking a usage check rolls the current pool and removes dice showing 1 or 2. The new pool is saved to the item, and zero leaves the depleted item visible. The system doesn't decide when the check is due: click it after a use, a casting, or a Dungeon Turn when the rules call for it.

**Restore usage dice** asks you to confirm that the required rest, refill, or other replenishment has happened, then refills the entire pool to its maximum. It doesn't consume supplies, charge money, heal the Crow, or verify a safe rest. It also doesn't refill ammunition counts.

**Cast** and the spellbook's **UD** button are separate actions. After resolving the casting and any expertise upgrade, click **UD** when the card calls for a book usage check; the button rolls and updates the pool for you. Skip that check on a critical casting. A spell's duration dice are separate and aren't tracked by this button. See [Spellbooks](MANUAL-PLAY.md#spellbooks).

## What containers don't do

There are no nested item inventories or multi-item chest actors in this release. A purse stores a number, not a collection of coin items. The village's **Inventory** tab is available for shared equipment storage; it doesn't impose a storage-capacity or travel check.

For dropped equipment, use individual scene items. Players need a nearby owned recipient token and a logged-in GM for shared map pickups. See [loot setup](README.md#loot-setup-and-troubleshooting).
