/** Single scene items and authoritative inventory transfers. */
import { beltCapacity, canStack, stackAmount, goldStack } from "./inventory.mjs";
const SOCKET = "system.fvtt-crows-system";
const SYSTEM_ID = "fvtt-crows-system";
export const LOOT_BASE_NAME = "Ground Loot";

export class CrowsLoot {
  static canInspectToken(token) {
    return token?.actor?.type === "loot" && !token.hidden
      && token.object?.visible === true && token.object?.isVisible === true;
  }

  /** Resolve the requesting user's scene even when the GM is viewing another scene. */
  static pickupScene(user) {
    return user.viewedScene ? game.scenes?.get(user.viewedScene)
      : user.id === game.user?.id ? globalThis.canvas?.scene ?? game.scenes?.active : game.scenes?.active;
  }

  /** Pickup is automatic within range of an owned receiving character's token. */
  static canPickUp(actor, user = game.user, recipient = null) {
    if (actor?.type !== "loot" || !user) return false;
    if (user.isGM) return true;
    const scene = this.pickupScene(user);
    if (!scene) return false;
    const tokens = Array.from(scene.tokens ?? []);
    const loot = tokens.filter(token => !token.hidden && token.actor?.uuid === actor.uuid);
    const characters = tokens.filter(token => !token.hidden && ["crow", "monster"].includes(token.actor?.type)
      && token.actor.testUserPermission(user, "OWNER") && (!recipient || token.actor.uuid === recipient.uuid));
    const grid = scene.grid;
    const limit = Number(game.settings.get(SYSTEM_ID, "lootPickupDistance"));
    if (!grid?.measurePath || !Number.isFinite(limit) || limit < 0) return false;
    const center = token => ({ x: token.x + token.width * grid.sizeX / 2,
      y: token.y + token.height * grid.sizeY / 2 });
    return loot.some(item => characters.some(character => {
      const horizontal = grid.measurePath([center(item), center(character)]).distance;
      const vertical = Math.abs((item.elevation ?? 0) - (character.elevation ?? 0));
      return Math.hypot(horizontal, vertical) <= limit + 1e-8;
    }));
  }

  /* ------------------------------------------------------------------ */
  /*  Setup                                                              */
  /* ------------------------------------------------------------------ */

  static registerSettings() {
    game.settings.register(SYSTEM_ID, "lootPickupDistance", {
      name: "Loot pickup distance",
      hint: "Maximum distance in scene units between a ground item and the receiving character's token. Measured between token centers using the scene grid, including elevation. GMs can pick up at any distance.",
      scope: "world", config: true, type: Number, default: game.system.grid?.distance ?? 1,
      onChange: () => this.refreshSheets()
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
      if (msg?.channel === "loot-result") {
        if (msg.userId === game.user.id) {
          const pending = this._requests?.get(msg.requestId);
          if (pending) { clearTimeout(pending.timer); this._requests.delete(msg.requestId); pending.resolve(msg.ok); }
          if (msg.error) ui.notifications.warn(msg.error);
          this.refreshSheets();
        }
        return;
      }
      if (!CrowsLoot.isActiveGM()) return;
      try {
        const result = await CrowsLoot._execute(msg.action, msg.payload, msg.userId);
        if (msg.requestId) game.socket.emit(SOCKET, { channel: "loot-result", userId: msg.userId, requestId: msg.requestId, ok: !!result,
          error: result ? null : "No change was made. Check pickup access and inventory space with the Ref." });
      } catch (err) {
        console.error("Crows | loot request failed", msg, err);
        if (msg.requestId) game.socket.emit(SOCKET, { channel: "loot-result", userId: msg.userId, requestId: msg.requestId, ok: false, error: "The item could not be moved. Ask the Ref to check it." });
      }
    });
    for (const hook of ["createActor", "updateActor", "deleteActor", "createItem", "updateItem", "deleteItem"]) Hooks.on(hook, () => this.refreshSheets());
    Hooks.on("updateToken", (token, changes) => {
      if (["delta", "actorId", "actorLink", "hidden", "x", "y", "elevation", "width", "height"].some(key => key in changes)) this.refreshSheets();
    });
    Hooks.on("updateItem", (item, changes) => {
      const parent = item.parent;
      if (!this.isActiveGM() || parent?.type !== "loot" || parent.items.size !== 1) return;
      if (!("name" in changes || "img" in changes)) return;
      parent.update({ name: item.name, img: item.img }).catch(error => console.error("Crows | Scene item refresh failed", error));
      parent.token?.update({ name: item.name, "texture.src": item.img }).catch(error => console.error("Crows | Scene image refresh failed", error));
    });
  }

  static refreshSheets() {
    for (const actor of game.actors) if (actor.type === "crow") actor.prepareDerivedData();
    for (const app of Object.values(ui.windows)) {
      if (!(app.actor?.type === "loot" || app.item?.type === "equipment" || app.actor?.type === "crow")) continue;
      if (app.requestRefresh) app.requestRefresh();
      else if (app.rendered) app.render(false, { focus: false });
    }
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
    const requestId = foundry.utils.randomID();
    this._requests ??= new Map();
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this._requests.delete(requestId);
        ui.notifications.warn("The Ref has not confirmed the transfer. Check the inventories before trying again.");
        resolve(null);
      }, 15000);
      this._requests.set(requestId, { resolve, timer });
      game.socket.emit(SOCKET, { action, payload, userId: game.user.id, requestId });
    });
  }

  static async _execute(action, payload, userId) {
    if (["copyItem", "dropToGround"].includes(action)) {
      if (action === "dropToGround") action = "dropToGroundQueued";
      const pending = (this._transferQueue ?? Promise.resolve()).then(() => this[`_${action}`](payload, userId));
      this._transferQueue = pending.catch(() => {});
      return pending;
    }
    switch (action) {
      case "transfer": return CrowsLoot._doTransfer(payload, userId);
      case "stack": return CrowsLoot._doStack(payload, userId);
      case "dropToGround": return CrowsLoot._doDropToGround(payload, userId);
      default: console.warn("Crows | unknown loot action", action);
    }
  }

  /**
   * Prepared world actors stay private. Their scene instances provide limited inspection.
   */
  static onPreCreateActor(doc, data) {
    if (data.type !== "loot") return;
    if (!data.ownership) doc.updateSource({ ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE } });
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
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
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

  /** Create one interactable scene item. */
  static async createLootToken({ name, img, items = [], description = "", x, y, scene, size = 0.8, displayName } = {}) {
    scene = scene ?? canvas.scene;
    const base = await CrowsLoot.ensureBaseActor();
    if (!scene || !base || items.length !== 1) return null;
    const item = foundry.utils.deepClone(items[0]); delete item._id;
    item.system.location = "ground";
    name ||= item.name; img ||= item.img || "icons/svg/item-bag.svg";
    const [token] = await scene.createEmbeddedDocuments("Token", [{ actorId: base.id, actorLink: false,
      name, x, y, width: size, height: size, texture: { src: img },
      displayName: displayName ?? CONST.TOKEN_DISPLAY_MODES.HOVER,
      disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      flags: { [SYSTEM_ID]: { isLoot: true } },
      delta: { _id: null, name, img, system: { description },
        items: [item], effects: [], flags: {} }
    }]);
    return token ?? null;
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

  static MAGIC_SLOTS = ["head", "neck", "waist", "gloves", "ring", "boots"];

  /** Slots an item of `count` slots occupies when anchored at `location`. */
  static spanFor(location, count = 1) {
    count = Math.max(1, count);
    const m = location?.match(/^(backpack|slot|belt)(\d+)$/);
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
    if (actor.type === "monster" && /^hand[12]$/.test(location)) return false;
    const occ = CrowsLoot.occupancy(actor, excludeId);
    if (CrowsLoot.MAGIC_SLOTS.includes(location)) return !occ[location];
    const b = location.match(/^belt(\d+)$/);
    if (b && (Number(b[1]) < 1 || Number(b[1]) + count - 1 > beltCapacity(actor))) return false;
    if (location === "hand2" && count > 1) return false;
    const m = location.match(/^backpack(\d+)$/);
    if (m && Number(m[1]) + count - 1 > CrowsLoot.maxBackpack(actor)) return false;
    return CrowsLoot.spanFor(location, count).every(s => !occ[s]);
  }

  /** First location where an item of `count` slots fits, else "ground". */
  static findFreeSlot(actor, count = 1, excludeId = null) {
    const bp = Array.from({ length: CrowsLoot.maxBackpack(actor) }, (_, i) => `backpack${i + 1}`);
    const order = actor.type === "crow" ? [...Array.from({ length: beltCapacity(actor) }, (_, i) => `belt${i + 1}`), "hand1", "hand2", ...bp] : bp;
    for (const loc of order) if (CrowsLoot.fits(actor, loc, count, excludeId)) return loc;
    return actor.type === "crow" ? null : "ground";
  }

  /** Can an item of `count` slots be anchored at `location` at all (ignoring what's there now)? */
  static validAnchor(actor, location, count) {
    if (!location) return false;
    if (actor.type === "monster" && /^hand[12]$/.test(location)) return false;
    if (location === "ground" || location === "stash") return actor.type !== "crow";
    if (CrowsLoot.MAGIC_SLOTS.includes(location)) return count === 1;
    const b = location.match(/^belt(\d+)$/);
    if (b && (Number(b[1]) < 1 || Number(b[1]) + count - 1 > beltCapacity(actor))) return false;
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
    const order = actor.type === "crow" ? [...Array.from({ length: beltCapacity(actor) }, (_, i) => `belt${i + 1}`), "hand1", "hand2", ...bp] : bp;

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
  /*  Acting character                                                   */
  /* ------------------------------------------------------------------ */

  /** The actor the user is acting with: a controlled owned token's actor, else the assigned character. */
  static actingActor() {
    const controlled = (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(a => a?.isOwner);
    return controlled[0] ?? game.user.character ?? null;
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
      ui.notifications.warn("Move the receiving character within the loot pickup distance and make sure you own that character.");
      return null;
    }
    const payload = { itemUuid: item.uuid, targetUuid: targetActor.uuid, location };
    if (game.users.activeGM) return CrowsLoot._request("transfer", payload);
    if (targetActor.isOwner && source.isOwner) return CrowsLoot._doTransfer(payload, game.user.id);
    return CrowsLoot._request("transfer", payload);
  }

  static canTransfer(source, target, user) {
    if (!source || !target || !user || source.uuid === target.uuid) return false;
    if (!["crow", "monster", "loot", "village"].includes(target.type)) return false;
    if (user.isGM) return true;
    const owns = actor => actor.testUserPermission(user, "OWNER");
    return (source.type === "loot" ? this.canPickUp(source, user, target) : owns(source))
      && (target.type === "loot" ? false : owns(target));
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
    const user = game.users.get(userId);
    if (!CrowsLoot.canTransfer(source, target, user)) return null;
    if (target.type === "loot" && target.items.size > 0) return null;
    const data = item.toObject();
    delete data._id;
    const count = Math.max(1, Number(data.system?.slots) || 1);
    let loc = "ground";
    if (target.type !== "loot") loc = (location && CrowsLoot.fits(target, location, count)) ? location : CrowsLoot.findFreeSlot(target, count);
    if (!loc) { ui.notifications.warn(`${target.name} has no room for ${item.name}.`); return null; }
    foundry.utils.setProperty(data, "system.location", loc);
    const [created] = await target.createEmbeddedDocuments("Item", [data], { crowsTransfer: true });
    try { await item.delete(); }
    catch (error) { await created.delete(); throw error; }
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

  static async _dropToGroundQueued({ itemUuid, x, y, sceneId }, userId) {
    const item = await fromUuid(itemUuid);
    const scene = game.scenes.get(sceneId);
    if (!item || !scene) return null;
    const source = item.parent;
    const user = game.users.get(userId);
    if (!user || (!user.isGM && (source.type === "loot" || !source.testUserPermission(user, "OWNER")))) return null;
    const token = await CrowsLoot.createLootToken({ items: [item.toObject()], x, y, scene });
    if (!token) return null;
    try {
      await item.delete();
    } catch (error) { await token.delete(); throw error; }
    if (game.settings.get(SYSTEM_ID, "lootChat")) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: source }),
        content: `<div class="crows-loot-line"><i class="fas fa-arrow-down"></i> <b>${source.name}</b> drops <b>${item.name}</b> on the ground.</div>`
      });
    }
    await CrowsLoot.cleanupIfEmpty(source);
    return token;
  }

  static _doDropToGround(payload, userId) { return this._execute("dropToGround", payload, userId); }

  static async _copyItem({ itemUuid, targetUuid, location }, userId) {
    const user = game.users.get(userId), item = await fromUuid(itemUuid), target = await fromUuid(targetUuid);
    if (!user || !item || item.parent || !target || !["crow", "monster", "loot"].includes(target.type)) return null;
    if (!user.isGM && (target.type === "loot" || !target.testUserPermission(user, "OWNER"))) return null;
    if (!user.isGM && !item.testUserPermission(user, "LIMITED")) return null;
    if (target.type === "loot" && target.items.size > 0) return null;
    const slots = item.system.slots || 1;
    const loc = target.type === "loot" ? "ground" : location && this.fits(target, location, slots) ? location : this.findFreeSlot(target, slots);
    if (!loc) return ui.notifications.warn("No free inventory slot.");
    const raw = foundry.utils.deepClone(item.toObject());
    raw.system.location = loc;
    const [created] = await target.createEmbeddedDocuments("Item", [raw], { crowsTransfer: true });
    return created;
  }

  static async cleanupIfEmpty(actor) {
    if (!actor || actor.type !== "loot" || !actor.isToken) return;
    if (actor.items.size > 0) return;
    await actor.token?.delete();
  }

  static async _announce(userId, target, source, what) {
    if (!game.settings.get(SYSTEM_ID, "lootChat") || !source) return;
    let content;
    const loose = a => a.type === "loot";
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

  /** A single scene item can be dragged when an owned character is within pickup range. */
  static looseItem(token) {
    const actor = token.actor;
    if (actor?.type !== "loot" || actor.items.size !== 1
      || (!game.user.isGM && (token.document?.hidden || token.hidden)) || !this.canPickUp(actor)) return null;
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
    let target = CrowsLoot.tokenAt(canvasRef, data.x, data.y)?.actor;
    if (target?.type === "loot") {
      const other = target.items.contents[0];
      if (item.parent && other && canStack(item, other)) await this.stack(item, other);
      return false;
    }
    if (target && item.parent) {
      await CrowsLoot.transfer(item, target);
      return false;
    }
    if (target && !item.parent) {
      if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can place new items onto map tokens.");
        return false;
      }
      await this._request("copyItem", { itemUuid: item.uuid, targetUuid: target.uuid });
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
    const raw = foundry.utils.deepClone(item.toObject());
    const token = await CrowsLoot.createLootToken({ items: [raw], x, y, scene: canvasRef.scene });
    return false;
  }
}
