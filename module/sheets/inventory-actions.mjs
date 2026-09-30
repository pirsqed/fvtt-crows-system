import { CrowsChatActions } from "../chat-actions.mjs";
const pending = new WeakSet();

export async function requestUsageDice(actor, event) {
  event.preventDefault();
  const item = actor.items.get(event.currentTarget.dataset.itemId);
  if (!item) return;
  const expected = item.system.consumable?.currentUD ?? item.system.consumable?.maxUD ?? 0;
  if (expected <= 0) return ui.notifications.warn(`${item.name} has no usage dice remaining!`);
  if (!actor.isOwner || pending.has(item)) return;
  pending.add(item);
  try { return await CrowsChatActions.request({ action: "usage-dice", itemUuid: item.uuid, expected }); }
  catch (error) { ui.notifications.warn(error.message); }
  finally { pending.delete(item); }
}


/** Shared inventory controls; sheets only bind events. */
export async function _onQuantityAdjust(delta, event) {
    event.preventDefault();
    event.stopPropagation();
    const currentTarget = event.currentTarget;
    const target = typeof $ === "function" ? $(currentTarget) : null;
    const itemId = currentTarget?.dataset?.itemId
      || target?.data("itemId")
      || target?.closest("[data-item-id]")?.data("itemId")
      || target?.closest(".item")?.data("itemId");
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const currentQty = item.system.quantity ?? 1;
    if (currentQty === 0 && delta < 0) return;

    const maxStack = Number(item.system.maxStack) || 1;
    const newQty = Math.max(0, currentQty + delta);

    if (delta > 0 && maxStack > 1 && newQty > maxStack) {
      ui.notifications.warn(`Quantity cannot exceed maximum stack size of ${maxStack}.`);
      return;
    }

    if (newQty === 0) {
      const confirmed = await Dialog.confirm({
        title: "Delete Item?",
        content: `<p>You have 0 remaining. Would you like to remove <strong>${item.name}</strong> from your inventory?</p>`,
        defaultYes: false
      });
      if (confirmed) {
        return item.delete();
      }
      return item.update({ "system.quantity": 0 });
    }

    await item.update({ "system.quantity": newQty });
  }

export async function _onQuantityInput(event) {
    event.preventDefault();
    event.stopPropagation();
    const input = event.currentTarget;
    const itemId = input.dataset.itemId || input.closest?.("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.actor.items.get(itemId) : null;
    if (!item) return;

    const maxStack = Math.max(1, Number(input.dataset.maxStack) || Number(item.system.maxStack) || 1);
    const parsedVal = parseInt(input.value, 10);

    if (isNaN(parsedVal)) {
      input.value = item.system.quantity ?? 1;
      return;
    }

    if (maxStack > 1 && parsedVal > maxStack) {
      ui.notifications.warn(`Quantity cannot exceed maximum stack size of ${maxStack}.`);
      input.value = item.system.quantity ?? 1;
      return;
    }

    if (parsedVal <= 0) {
      input.value = item.system.quantity ?? 1;
      const confirmed = await Dialog.confirm({
        title: "Delete Item?",
        content: `<p>Setting quantity to 0 will delete <strong>${item.name}</strong>. Are you sure?</p>`,
        defaultYes: false
      });
      if (confirmed) {
        await item.delete();
      } else {
        await item.update({ "system.quantity": 0 });
      }
      return;
    }

    await item.update({ "system.quantity": parsedVal });
  }

export async function _onPostTraitToChat(event) {
    event.preventDefault();
    event.stopPropagation();
    const btn = $(event.currentTarget);
    const itemId = btn.data("itemId") || btn.closest("[data-item-id]").data("itemId");
    if (!itemId) return;
    const trait = this.actor.items.get(itemId);
    if (!trait) return;

    const tree = trait.system.tree || "General";
    const tier = trait.system.tier || "Starting";
    const cost = trait.system.cost ?? (this.actor.type === "monster" ? 0 : 500);
    const prereqs = trait.system.prerequisites || "";
    const description = trait.system.description || "<em>No description provided.</em>";

    const cardHtml = `
      <div class="crows-item-card trait-card">
        <div class="card-header trait-header flexrow" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <img src="${trait.img}" alt="${trait.name}" style="width:34px; height:34px; border-radius:4px; border:1px solid rgba(147, 51, 234, 0.4); object-fit:cover;" />
          <div style="flex:1;">
            <h3 style="margin:0; font-size:1.05rem; font-weight:700; color:#f3e8ff; letter-spacing:0.3px;">${trait.name}</h3>
            <div style="font-size:0.75rem; color:#c084fc; text-transform:uppercase; letter-spacing:0.5px; font-weight:600;"><i class="fas fa-sitemap"></i> ${tree} Trait Tree</div>
          </div>
        </div>
        <div class="card-badges" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:8px;">
          <span class="badge" style="background:#581c87; color:#f3e8ff; border:1px solid #9333ea;"><i class="fas fa-layer-group"></i> ${tier}</span>
          <span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid #f59e0b;"><i class="fas fa-coins"></i> ${cost} XP</span>
          ${prereqs ? `<span class="badge" style="background:rgba(59,130,246,0.2); color:#93c5fd; border:1px solid #3b82f6;"><i class="fas fa-link"></i> Req: ${prereqs}</span>` : ""}
        </div>
        <div class="trait-description" style="font-size:0.85rem; line-height:1.45; color:#e5e7eb; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px;">
          ${description}
        </div>
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} shared the <strong>${trait.name}</strong> trait`,
      content: cardHtml
    });
  }
