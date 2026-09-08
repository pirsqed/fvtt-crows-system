/**
 * Crows ground loot & item transfer engine.
 *
 *  - Ground loot lives in unlinked tokens of one hidden "Ground Loot" base actor (type "loot").
 *    Each token keeps its own items and coins in its ActorDelta, so deleting the token deletes
 *    the loot and nothing accumulates in the Actors directory.
 *  - Every move of an item between documents goes through CrowsLoot.transfer(): create on the
 *    destination, then delete from the source. When the acting user doesn't own both ends the
 *    request is sent over the system socket and executed by the active GM's client.
 */
import { canStack, stackAmount, goldStack } from "./inventory.mjs";
const SOCKET = "system.fvtt-crows-system";
const SYSTEM_ID = "fvtt-crows-system";
export const LOOT_BASE_NAME = "Ground Loot";

export class CrowsLoot {
  /* ------------------------------------------------------------------ */
  /*  Setup                                                              */
  /* ------------------------------------------------------------------ */

  static registerSettings() {
    game.settings.register(SYSTEM_ID, "lootReach", {
      name: "Loot interaction reach (squares)",
      hint: "Players need a controlled token within this many squares of a loot token to take from it or stow into it. 0 disables the check. GMs are never restricted.",
      scope: "world", config: true, type: Number, default: 1
    });
    game.settings.register(SYSTEM_ID, "lootChat", {
      name: "Announce loot pickups in chat",
      scope: "world", config: true, type: Boolean, default: true
    });
  }

  static activateSocket() {
    if (!game.system.socket && game.user.isGM) {
      ui.notifications.warn("Crows: the server has not enabled this system's socket, so players can't move loot. Restart Foundry so it re-reads system.json.", { permanent: true });
    }
    game.socket.on(SOCKET, async (msg) => {
      if (msg?.channel === "chat-actions") return;
      if (!CrowsLoot.isActiveGM()) return;
      try {
        await CrowsLoot._execute(msg.action, msg.payload, msg.userId);
      } catch (err) {
        console.error("Crows | loot request failed", msg, err);
      }
    });
  }

  static isActiveGM() {
    return game.users.activeGM?.id === game.user.id;
  }

  /** Run an action locally when the user is a GM, otherwise ask the active GM to run it. */
  static async _request(action, payload) {
    if (CrowsLoot.isActiveGM() || (game.user.isGM && !game.users.activeGM)) return CrowsLoot._execute(action, payload, game.user.id);
    if (!game.system.socket) {
      ui.notifications.warn("The loot socket isn't enabled on the server. Ask the Ref to restart Foundry.");
      return null;
    }
    if (!game.users.activeGM) {
      ui.notifications.warn("A GM must be connected to move loot around.");
      return null;
    }
    game.socket.emit(SOCKET, { action, payload, userId: game.user.id });
    return null;
  }

  static async _execute(action, payload, userId) {
    switch (action) {
      case "transfer": return CrowsLoot._doTransfer(payload, userId);
      case "stack": return CrowsLoot._doStack(payload, userId);
      case "dropToGround": return CrowsLoot._doDropToGround(payload, userId);
      case "takeCoins": return CrowsLoot._doTakeCoins(payload, userId);
      case "setLocked": return CrowsLoot._doSetLocked(payload, userId);
      default: console.warn("Crows | unknown loot action", action);
    }
  }

  /**
   * Loot actors default to Observer ownership so players can open them from the map.
   * Locking hides the contents; hiding the token hides the loot. Permission is not the gate.
   */
  static onPreCreateActor(doc, data) {
    if (data.type !== "loot" || data.ownership) return;
    doc.updateSource({ ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } });
  }

  /** One-time fix-up for loot actors created before Observer became the default (GM only). */
  static async migrateLootOwnership() {
    if (!game.user.isGM) return;
    const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const stale = game.actors.filter(a => a.type === "loot" && (a.ownership.default ?? 0) < OBSERVER);
    if (!stale.length) return;
    await Actor.updateDocuments(stale.map(a => ({ _id: a.id, "ownership.default": OBSERVER })));
    console.log(`Crows | Loot ownership migrated to Observer for ${stale.length} actor(s):`, stale.map(a => a.name));
  }

  /* ------------------------------------------------------------------ */
  /*  Base actor & token creation                                        */
  /* ------------------------------------------------------------------ */

  static async ensureBaseActor() {
    let actor = game.actors.find(a => a.type === "loot" && a.getFlag(SYSTEM_ID, "lootBase"));
    if (actor) return actor;
    if (!game.user.isGM) return null;
    return Actor.create({
      name: LOOT_BASE_NAME,
      type: "loot",
      img: "icons/svg/item-bag.svg",
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
      flags: { [SYSTEM_ID]: { lootBase: true } },
      prototypeToken: {
        actorLink: false,
        displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
        displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
        disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL
      }
    });
  }

  /** Snap a drop position to the grid's top-left vertex (v12+ API, with the pre-v12 fallback). */
  static snap(x, y) {
    const grid = canvas.grid;
    if (!grid) return { x, y };
    const half = grid.size / 2;
    if (typeof grid.getSnappedPoint === "function") {
      const mode = CONST.GRID_SNAPPING_MODES?.TOP_LEFT_VERTEX ?? 1;
      return grid.getSnappedPoint({ x: x - half, y: y - half }, { mode, resolution: 1 });
    }
    if (typeof grid.getSnappedPosition === "function") return grid.getSnappedPosition(x - half, y - half, 1);
    return { x, y };
  }

  static defaultImage(containerType, firstItem) {
    switch (containerType) {
      case "chest": return "icons/containers/chest/chest-simple-oak-steel-brown.webp";
      case "corpse": return "icons/commodities/bones/skull-hollow-brown-red.webp";
      case "dropped_pack": return "icons/containers/bags/pack-leather-brown.webp";
      case "stash": return "icons/containers/bags/sack-simple-leather-brown.webp";
      default: return firstItem?.img || "icons/svg/item-bag.svg";
    }
  }

  /**
   * Create a loot token on a scene. `items` are raw item data objects.
   * @returns {Promise<TokenDocument|null>}
   */
  static async createLootToken({ name, img, items = [], coins = 0, containerType = "generic", locked = false,
                                 corpseSize = "medium", x, y, scene, size, displayName } = {}) {
    scene = scene ?? canvas.scene;
    const base = await CrowsLoot.ensureBaseActor();
    if (!scene || !base) return null;
    items = items.map(i => {
      const d = foundry.utils.deepClone(i);
      delete d._id;
      foundry.utils.setProperty(d, "system.location", "ground");
      return d;
    });
    const first = items[0];
    name = name || first?.name || "Loot";
    img = img || CrowsLoot.defaultImage(containerType, first);
    if (size === undefined) size = containerType === "generic" ? 0.8 : 1;
    const tokenData = {
      actorId: base.id,
      actorLink: false,
      name, x, y,
      width: size, height: size,
      texture: { src: img },
      displayName: displayName ?? (containerType === "generic" ? CONST.TOKEN_DISPLAY_MODES.HOVER : CONST.TOKEN_DISPLAY_MODES.ALWAYS),
      disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      flags: { [SYSTEM_ID]: { isLoot: true, containerType } },
      delta: {
        name, img,
        system: { containerType, coins, locked, corpseSize },
        items
      }
    };
    const [created] = await scene.createEmbeddedDocuments("Token", [tokenData]);
    return created ?? null;
  }

  /** One token per item, spiralling out from (x, y). */
  static async scatterItemsOnCanvas(items, { x, y, scene } = {}) {
    scene = scene ?? canvas.scene;
    if (!scene || !items?.length) return [];
    const g = canvas.grid?.size || 100;
    const offsets = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
      [2, 0], [0, 2], [-2, 0], [0, -2], [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2]];
    const created = [];
    for (let i = 0; i < items.length; i++) {
      const [ox, oy] = offsets[i % offsets.length];
      const t = await CrowsLoot.createLootToken({ items: [items[i]], x: x + ox * g, y: y + oy * g, scene });
      if (t) created.push(t);
    }
    return created;
  }

  /** A container token: chest, corpse, dropped pack, or stash. */
  static async createContainerToken({ name = "Treasure Chest", containerType = "chest", img, items = [], coins = 0,
                                      locked = false, x, y, scene } = {}) {
    return CrowsLoot.createLootToken({ name, containerType, img, items, coins, locked, x, y, scene });
  }

  /* ------------------------------------------------------------------ */
  /*  Slot placement                                                     */
  /* ------------------------------------------------------------------ */

  static MAGIC_SLOTS = ["head", "neck", "waist", "gloves", "ring", "boots"];

  /** Slots an item of `count` slots occupies when anchored at `location`. */
  static spanFor(location, count = 1) {
    count = Math.max(1, count);
    const m = location?.match(/^(backpack|slot)(\d+)$/);
    if (m) return Array.from({ length: count }, (_, i) => `${m[1]}${Number(m[2]) + i}`);
    if (location === "hand1" && count >= 2) return ["hand1", "hand2"];
    return [location];
  }

  /** slot -> item for every carried slot on an actor, optionally ignoring one item. */
  static occupancy(actor, excludeId = null) {
    const map = {};
    for (const item of actor.items) {
      if (item.type !== "equipment" || item.id === excludeId) continue;
      const slots = item.getOccupiedSlots ? item.getOccupiedSlots() : CrowsLoot.spanFor(item.system.location, item.system.slots);
      for (const s of slots) if (!s.startsWith("ground") && s !== "stash") map[s] = item;
    }
    return map;
  }

  static maxBackpack(actor) {
    return actor.type === "crow" ? 10 : Math.max(0, Number(actor.system?.slots) || 0);
  }

  /** Can an item of `count` slots sit at `location` on `actor`? */
  static fits(actor, location, count = 1, excludeId = null) {
    if (!location || location === "ground" || location === "stash") return actor.type !== "crow";
    const occ = CrowsLoot.occupancy(actor, excludeId);
    if (CrowsLoot.MAGIC_SLOTS.includes(location)) return !occ[location];
    if (location.startsWith("belt") && count > 1) return false;
    if (location === "hand2" && count > 1) return false;
    const m = location.match(/^backpack(\d+)$/);
    if (m && Number(m[1]) + count - 1 > CrowsLoot.maxBackpack(actor)) return false;
    return CrowsLoot.spanFor(location, count).every(s => !occ[s]);
  }

  /** First location where an item of `count` slots fits, else "ground". */
  static findFreeSlot(actor, count = 1, excludeId = null) {
    const bp = Array.from({ length: CrowsLoot.maxBackpack(actor) }, (_, i) => `backpack${i + 1}`);
    const order = actor.type === "crow" ? ["belt1", "belt2", "belt3", "belt4", "hand1", "hand2", ...bp] : ["hand1", "hand2", ...bp];
    for (const loc of order) if (CrowsLoot.fits(actor, loc, count, excludeId)) return loc;
    return actor.type === "crow" ? null : "ground";
  }

  /** Can an item of `count` slots be anchored at `location` at all (ignoring what's there now)? */
  static validAnchor(actor, location, count) {
    if (!location) return false;
    if (location === "ground" || location === "stash") return actor.type !== "crow";
    if (CrowsLoot.MAGIC_SLOTS.includes(location)) return count === 1;
    if (location.startsWith("belt") && count > 1) return false;
    if (location === "hand2" && count > 1) return false;
    const m = location.match(/^backpack(\d+)$/);
    if (m && Number(m[1]) + count - 1 > CrowsLoot.maxBackpack(actor)) return false;
    return true;
  }

  /**
   * Move an item that already belongs to `actor` to `location`, relocating anything in the way.
   * Displaced items take the dragged item's old spot if they fit there, else the first free slot, else the ground tray.
   */
  static async placeItem(actor, item, location) {
    const count = Math.max(1, Number(item.system.slots) || 1);
    if (!CrowsLoot.validAnchor(actor, location, count)) {
      ui.notifications.warn(`${item.name} takes ${count} slot${count > 1 ? "s" : ""} and can't go there.`);
      return null;
    }
    const updates = [{ _id: item.id, "system.location": location }];
    if (location === "ground" || location === "stash") return actor.updateEmbeddedDocuments("Item", updates);

    const occ = CrowsLoot.occupancy(actor, item.id);
    const newSpan = CrowsLoot.spanFor(location, count);
    const displaced = [...new Set(newSpan.map(s => occ[s]).filter(Boolean))];
    const displacedIds = new Set(displaced.map(d => d.id));
    const claimed = new Set(newSpan);
    const oldLocation = item.system.location;
    const bp = Array.from({ length: CrowsLoot.maxBackpack(actor) }, (_, i) => `backpack${i + 1}`);
    const order = actor.type === "crow" ? ["belt1", "belt2", "belt3", "belt4", "hand1", "hand2", ...bp] : ["hand1", "hand2", ...bp];

    const freeAt = (loc, c) => CrowsLoot.validAnchor(actor, loc, c)
      && CrowsLoot.spanFor(loc, c).every(s => !claimed.has(s) && (!occ[s] || displacedIds.has(occ[s].id)));

    for (const other of displaced) {
      const c = Math.max(1, Number(other.system.slots) || 1);
      let dest = (oldLocation && !CrowsLoot.MAGIC_SLOTS.includes(oldLocation) === !CrowsLoot.MAGIC_SLOTS.includes(other.system.location)
                  && freeAt(oldLocation, c)) ? oldLocation : null;
      if (!dest) dest = order.find(loc => freeAt(loc, c)) ?? "ground";
      if (dest === "ground" && actor.type === "crow") {
        ui.notifications.warn("There is no room to move the displaced item. Free an inventory slot first.");
        return null;
      }
      CrowsLoot.spanFor(dest, c).forEach(s => claimed.add(s));
      updates.push({ _id: other.id, "system.location": dest });
    }
    return actor.updateEmbeddedDocuments("Item", updates);
  }

  /* ------------------------------------------------------------------ */
  /*  Reach                                                              */
  /* ------------------------------------------------------------------ */

  /** Squares between two token documents' bounds (Chebyshev; 0 = touching or overlapping). */
  static squaresBetween(a, b) {
    const g = canvas.grid?.size || 100;
    const gapX = Math.max(0, a.x - (b.x + b.width * g), b.x - (a.x + a.width * g));
    const gapY = Math.max(0, a.y - (b.y + b.height * g), b.y - (a.y + a.height * g));
    return Math.round(Math.max(gapX, gapY) / g);
  }

  /** The actor the user is acting with: a controlled owned token's actor, else the assigned character. */
  static actingActor() {
    const controlled = (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(a => a?.isOwner);
    return controlled[0] ?? game.user.character ?? null;
  }

  static withinReach(actor, lootActor) {
    if (game.user.isGM) return true;
    const reach = Number(game.settings.get(SYSTEM_ID, "lootReach")) || 0;
    if (reach <= 0) return true;
    const lootToken = lootActor?.token;
    if (!lootToken || lootToken.parent?.id !== canvas.scene?.id) return true;
    const tokens = actor?.getActiveTokens?.(false, true) ?? [];
    if (!tokens.length) return true;
    return tokens.some(t => CrowsLoot.squaresBetween(t, lootToken) < reach);
  }

  static _reachWarn(actor, lootActor) {
    if (!actor || CrowsLoot.withinReach(actor, lootActor)) return true;
    ui.notifications.warn(`${actor.name} is too far from ${lootActor.name} to reach it.`);
    return false;
  }

  /* ------------------------------------------------------------------ */
  /*  Transfers                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Move an item from wherever it is onto `targetActor` (crow, monster, or loot).
   * @param {Item} item
   * @param {Actor} targetActor
   * @param {object} [options]
   * @param {string} [options.location]  preferred slot; falls back to the first free slot
   */
  static async transfer(item, targetActor, { location = null } = {}) {
    const source = item.parent;
    if (!source || source.uuid === targetActor.uuid) return null;
    if (!CrowsLoot.canTransfer(source, targetActor, game.user)) {
      ui.notifications.warn("You can move your own items or take unlocked loot into an actor you own.");
      return null;
    }
    if (source.type === "loot" && source.system.locked && !game.user.isGM) {
      ui.notifications.warn(`${source.name} is locked.`);
      return null;
    }
    if (source.type === "loot" && !CrowsLoot._reachWarn(targetActor, source)) return null;
    if (targetActor.type === "loot" && !CrowsLoot._reachWarn(source, targetActor)) return null;
    const payload = { itemUuid: item.uuid, targetUuid: targetActor.uuid, location };
    if (game.users.activeGM) return CrowsLoot._request("transfer", payload);
    if (targetActor.isOwner && source.isOwner) return CrowsLoot._doTransfer(payload, game.user.id);
    return CrowsLoot._request("transfer", payload);
  }

  static canTransfer(source, target, user) {
    if (!source || !target || !user || source.uuid === target.uuid) return false;
    if (!["crow", "monster", "loot"].includes(target.type)) return false;
    if (user.isGM) return true;
    const owns = actor => actor.testUserPermission(user, "OWNER");
    const open = actor => actor.type === "loot" && !actor.system.locked
      && actor.testUserPermission(user, "OBSERVER");
    return (owns(source) || open(source)) && (target.type === "loot" ? open(target) : owns(target))
      && !(source.type === "loot" && source.system.locked);
  }

  static _doTransfer(payload, userId) {
    // Resolve after earlier pickups finish, so simultaneous requests cannot copy one item twice.
    const pending = (this._transferQueue ?? Promise.resolve())
      .then(() => this._transferNow(payload, userId));
    this._transferQueue = pending.catch(() => {});
    return pending;
  }

  static async stack(item, targetItem) {
    if (!canStack(item, targetItem)) return null;
    const source = item.parent, target = targetItem.parent;
    if (!source || !target) return null;
    if (source.uuid !== target.uuid) {
      if (!this.canTransfer(source, target, game.user)) return null;
      if (source.type === "loot" && !this._reachWarn(target, source)) return null;
      if (target.type === "loot" && !this._reachWarn(source, target)) return null;
    } else if (!source.isOwner) return null;
    const payload = { itemUuid: item.uuid, targetItemUuid: targetItem.uuid };
    // Use the GM queue when available, including owned stacks, to serialize competing merges.
    if (game.users.activeGM) return this._request("stack", payload);
    if (source.isOwner && target.isOwner) return this._doStack(payload, game.user.id);
    return this._request("stack", payload);
  }

  static _doStack(payload, userId) {
    const pending = (this._transferQueue ?? Promise.resolve()).then(() => this._stackNow(payload, userId));
    this._transferQueue = pending.catch(() => {});
    return pending;
  }

  static async _stackNow({ itemUuid, targetItemUuid }, userId) {
    const item = await fromUuid(itemUuid), other = await fromUuid(targetItemUuid);
    if (!item?.parent || !other?.parent) return null;
    const source = item.parent, target = other.parent, user = game.users.get(userId);
    if (source.uuid === target.uuid) {
      if (!user || !(user.isGM || source.testUserPermission(user, "OWNER"))) return null;
    } else if (!this.canTransfer(source, target, user)) return null;
    const amount = stackAmount(item, other);
    if (!amount) { ui.notifications.warn("That stack is full or the items no longer match."); return null; }
    const remaining = item.system.quantity - amount;
    const previousQuantity = other.system.quantity;
    const updates = [{ _id: other.id, "system.quantity": previousQuantity + amount }];
    if (source.uuid === target.uuid) {
      // Zero the source in the same update; a failed deletion cannot duplicate supplies.
      updates.push({ _id: item.id, "system.quantity": remaining });
      await target.updateEmbeddedDocuments("Item", updates);
      if (!remaining) await item.delete();
    } else {
      await target.updateEmbeddedDocuments("Item", updates);
      try { await item.update({ "system.quantity": remaining }); }
      catch (error) {
        await other.update({ "system.quantity": previousQuantity });
        throw error;
      }
      if (!remaining) await item.delete();
      await this.cleanupIfEmpty(source);
    }
    return amount;
  }

  /** Plan every new gold stack before writing, so insufficient space leaves the balance intact. */
  static planGold(actor, amount) {
    const planned = [], inventory = Array.from(actor.items);
    while (amount > 0) {
      const location = this.findFreeSlot({ type: actor.type, system: actor.system, items: inventory }, 1);
      if (!location) return null;
      const data = goldStack(Math.min(250, amount), location);
      planned.push(data); inventory.push({ ...data, id: `planned-${planned.length}` });
      amount -= data.system.quantity;
    }
    return planned;
  }

  static async migrateGold() {
    if (!this.isActiveGM()) return;
    const actors = new Map(game.actors.filter(a => a.type === "crow").map(a => [a.uuid, a]));
    for (const scene of game.scenes) for (const token of scene.tokens) {
      if (!token.actorLink && token.actor?.type === "crow") actors.set(token.actor.uuid, token.actor);
    }
    for (const actor of actors.values()) {
      const balance = Number(actor.system.coins) || 0;
      if (!balance) continue;
      // Mark created stacks so retrying an interrupted migration does not create the gold twice.
      const converted = Array.from(actor.items).reduce((n, item) =>
        n + (Number(item.getFlag(SYSTEM_ID, "convertedCoins")) || 0), 0);
      const data = this.planGold(actor, Math.max(0, balance - converted));
      if (!data) {
        ui.notifications.warn(`${actor.name}: free space for ${balance} gc, then reload to convert the saved balance.`);
        continue;
      }
      for (const item of data) item.flags = { [SYSTEM_ID]: { convertedCoins: item.system.quantity } };
      if (data.length) await actor.createEmbeddedDocuments("Item", data);
      await actor.update({ "system.coins": 0 });
    }
  }

  static async _transferNow({ itemUuid, targetUuid, location }, userId) {
    const item = await fromUuid(itemUuid);
    const target = await fromUuid(targetUuid);
    if (!item || !target) return null;
    const source = item.parent;
    if (!CrowsLoot.canTransfer(source, target, game.users.get(userId))) return null;
    const data = item.toObject();
    delete data._id;
    const count = Math.max(1, Number(data.system?.slots) || 1);
    let loc = "ground";
    if (target.type !== "loot") loc = (location && CrowsLoot.fits(target, location, count)) ? location : CrowsLoot.findFreeSlot(target, count);
    if (!loc) { ui.notifications.warn(`${target.name} has no room for ${item.name}.`); return null; }
    foundry.utils.setProperty(data, "system.location", loc);
    const [created] = await target.createEmbeddedDocuments("Item", [data]);
    await item.delete();
    await CrowsLoot._announce(userId, target, source, item.name);
    await CrowsLoot.cleanupIfEmpty(source);
    return created;
  }

  /** Drop an item from an actor onto the ground at a canvas position. */
  static async dropToGround(item, { x, y, scene } = {}) {
    scene = scene ?? canvas.scene;
    const source = item.parent;
    if (!scene || !source) return null;
    if (!source.isOwner && !game.user.isGM) {
      ui.notifications.warn("You can only drop items you own.");
      return null;
    }
    return CrowsLoot._request("dropToGround", { itemUuid: item.uuid, x, y, sceneId: scene.id });
  }

  static async _doDropToGround({ itemUuid, x, y, sceneId }, userId) {
    const item = await fromUuid(itemUuid);
    const scene = game.scenes.get(sceneId);
    if (!item || !scene) return null;
    const source = item.parent;
    const token = await CrowsLoot.createLootToken({ items: [item.toObject()], x, y, scene });
    if (!token) return null;
    await item.delete();
    if (game.settings.get(SYSTEM_ID, "lootChat")) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: source }),
        content: `<div class="crows-loot-line"><i class="fas fa-arrow-down"></i> <b>${source.name}</b> drops <b>${item.name}</b> on the ground.</div>`
      });
    }
    await CrowsLoot.cleanupIfEmpty(source);
    return token;
  }

  static async takeCoins(lootActor, targetActor) {
    if (!(Number(lootActor.system.coins) > 0)) return null;
    if (lootActor.system.locked && !game.user.isGM) {
      ui.notifications.warn(`${lootActor.name} is locked.`);
      return null;
    }
    if (!CrowsLoot._reachWarn(targetActor, lootActor)) return null;
    const payload = { lootUuid: lootActor.uuid, targetUuid: targetActor.uuid };
    if (game.users.activeGM) return CrowsLoot._request("takeCoins", payload);
    if (lootActor.isOwner && targetActor.isOwner) return CrowsLoot._doTakeCoins(payload, game.user.id);
    return CrowsLoot._request("takeCoins", payload);
  }

  static _doTakeCoins(payload, userId) {
    const pending = (this._transferQueue ?? Promise.resolve()).then(() => this._takeCoinsNow(payload, userId));
    this._transferQueue = pending.catch(() => {});
    return pending;
  }

  static async _takeCoinsNow({ lootUuid, targetUuid }, userId) {
    const loot = await fromUuid(lootUuid);
    const target = await fromUuid(targetUuid);
    const amount = Number(loot?.system.coins) || 0;
    if (!loot || !target || amount <= 0) return null;
    if (!this.canTransfer(loot, target, game.users.get(userId))) return null;
    if (target.type === "crow") {
      const data = this.planGold(target, amount);
      if (!data) { ui.notifications.warn(`${target.name} needs space for ${amount} gc.`); return null; }
      const created = await target.createEmbeddedDocuments("Item", data);
      try { await loot.update({ "system.coins": 0 }); }
      catch (error) { await target.deleteEmbeddedDocuments("Item", created.map(item => item.id)); throw error; }
    } else {
      await target.update({ "system.coins": (Number(target.system.coins) || 0) + amount });
      await loot.update({ "system.coins": 0 });
    }
    await CrowsLoot._announce(userId, target, loot, `${amount} gc`);
    await CrowsLoot.cleanupIfEmpty(loot);
    return amount;
  }

  static async setLocked(lootActor, locked) {
    const payload = { lootUuid: lootActor.uuid, locked: !!locked };
    if (lootActor.isOwner) return CrowsLoot._doSetLocked(payload, game.user.id);
    return CrowsLoot._request("setLocked", payload);
  }

  static async _doSetLocked({ lootUuid, locked }) {
    const loot = await fromUuid(lootUuid);
    if (loot) await loot.update({ "system.locked": !!locked });
  }

  /** Delete an emptied ground-loot token. Chests, corpses, and stashes stay so the GM can reuse them. */
  static async cleanupIfEmpty(actor) {
    if (!actor || actor.type !== "loot" || !actor.isToken) return;
    if (actor.items.size > 0 || (Number(actor.system.coins) || 0) > 0) return;
    if (!["generic", "dropped_pack"].includes(actor.system.containerType)) return;
    await actor.token?.delete();
  }

  static async _announce(userId, target, source, what) {
    if (!game.settings.get(SYSTEM_ID, "lootChat") || !source) return;
    let content;
    const loose = a => a.type === "loot" && a.system.containerType === "generic";
    if (target.type === "loot") {
      content = loose(target)
        ? `<b>${source.name}</b> sets <b>${what}</b> down with <b>${target.name}</b>.`
        : `<b>${source.name}</b> stows <b>${what}</b> in <b>${target.name}</b>.`;
    } else if (source.type === "loot") {
      content = loose(source)
        ? `<b>${target.name}</b> picks up <b>${what}</b>.`
        : `<b>${target.name}</b> takes <b>${what}</b> from <b>${source.name}</b>.`;
    } else {
      content = `<b>${source.name}</b> hands <b>${what}</b> to <b>${target.name}</b>.`;
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: target.type === "loot" ? source : target }),
      content: `<div class="crows-loot-line"><i class="fas fa-hand-holding"></i> ${content}</div>`
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Canvas drop hook                                                   */
  /* ------------------------------------------------------------------ */

  /** Only a single, unlocked equipment item gets direct map dragging. */
  static looseItem(token) {
    const actor = token.actor;
    if (actor?.type !== "loot" || actor.system.containerType !== "generic"
      || actor.system.locked || actor.items.size !== 1 || Number(actor.system.coins) > 0
      || !actor.testUserPermission(game.user, "OBSERVER")) return null;
    const item = actor.items.contents[0];
    return item.type === "equipment" ? item : null;
  }

  static tokenAt(canvasRef, x, y) {
    return [...(canvasRef.tokens?.placeables ?? [])].reverse().find(token =>
      token.visible && token.isVisible && ["crow", "monster", "loot"].includes(token.actor?.type)
      && x >= token.document.x && x < token.document.x + token.w
      && y >= token.document.y && y < token.document.y + token.h);
  }

  static async onDropCanvasData(canvasRef, data) {
    if (data.type !== "Item") return true;
    let item;
    try {
      item = await Item.implementation.fromDropData(data);
    } catch (err) {
      console.warn("Crows | Could not resolve item from drop data", err);
      return true;
    }
    if (!item) return true;
    const target = CrowsLoot.tokenAt(canvasRef, data.x, data.y)?.actor;
    if (target && item.parent) {
      await CrowsLoot.transfer(item, target);
      return false;
    }
    if (target && !item.parent) {
      if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can place new items onto map tokens.");
        return false;
      }
      const copy = item.toObject();
      delete copy._id;
      foundry.utils.setProperty(copy, "system.location", target.type === "loot" ? "ground"
        : CrowsLoot.findFreeSlot(target, Math.max(1, Number(copy.system?.slots) || 1)));
      if (!copy.system.location) { ui.notifications.warn(`${target.name} has no free inventory slot.`); return false; }
      await target.createEmbeddedDocuments("Item", [copy]);
      return false;
    }
    // A map-item drag onto empty space is cancelled; Shift-drag moves its token for the GM.
    if (data.crowsMapItem) return false;
    const { x, y } = CrowsLoot.snap(data.x, data.y);
    if (item.parent) {
      await CrowsLoot.dropToGround(item, { x, y, scene: canvasRef.scene });
      return false;
    }
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can place new loot on the map.");
      return false;
    }
    await CrowsLoot.createLootToken({ items: [item.toObject()], x, y, scene: canvasRef.scene });
    return false;
  }
}
