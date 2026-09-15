import {
  CHARACTERISTICS, CREATOR_SCOPE, primaryChoices, assignCharacteristics, backgroundFromDice,
  validateBackgrounds, buildCrowPlan, persistCrowPlan, escapeHTML
} from "../character-creation.mjs";
import { repairImportIcons } from "../icon-repairs.mjs";
import { addCrowToVillage } from "../village.mjs";

const label = key => key.charAt(0).toUpperCase() + key.slice(1);

export function canCreateCrow() {
  const user = game.user;
  if (!user) return false;
  const ActorClass = globalThis.CONFIG?.Actor?.documentClass;
  return ActorClass?.canUserCreate ? ActorClass.canUserCreate(user) : user.can("ACTOR_CREATE");
}

export class CrowsCharacterCreator extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "crows-character-creator", title: "Create a Crow", classes: ["crows", "crows-creator"],
      template: "systems/fvtt-crows-system/templates/character-creator.html",
      width: 800, height: 740, resizable: true, closeOnSubmit: false, submitOnChange: false
    });
  }

  constructor(...args) {
    super(...args);
    this.step = 0;
    this.draft = {
      background: "", name: "", feature: "", primary: "", spread: "balanced", secondary: "",
      gold: null, connectionName: "", relationship: "", connection: "", traitChoice: "", homeVillageId: ""
    };
    this.rolls = [];
    this.creationId = foundry.utils.randomID();
  }

  async loadContent() {
    const provider = game.modules?.get("fvtt-crows-pdf-importer")?.api?.getCharacterContent;
    const imported = provider ? await provider() : null;
    if (imported) {
      const { backgrounds, equipment, traits, connections, monsters } = imported;
      if (!Array.isArray(connections) || connections.length !== 10
        || connections.some(c => typeof c.name !== "string" || typeof c.description !== "string")
        || !Array.isArray(equipment) || !equipment.length || !Array.isArray(traits) || !traits.length
        || !Array.isArray(monsters)) throw new Error("Imported character-creation data is invalid. Re-import the packet.");
      this.content = { backgrounds: validateBackgrounds(backgrounds), equipment: repairImportIcons(equipment),
        traits: repairImportIcons(traits), connections, monsters };
      this.readMonsters = async () => {};
      return;
    }
    const read = async name => {
      const response = await fetch(`systems/${CREATOR_SCOPE}/packs/${name}.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${name}.json. Run Build Playtest Content with your playtest packet, then Retry.`);
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) throw new Error(`${name}.json is empty or invalid. Rebuild playtest content.`);
      return data;
    };
    const [backgrounds, equipment, traits, connections] = await Promise.all(["backgrounds", "equipment", "traits", "connections"].map(read));
    if (connections.length !== 10 || connections.some(c => typeof c.name !== "string" || typeof c.description !== "string")) {
      throw new Error("NPC connection data is invalid. Rebuild playtest content.");
    }
    this.content = { backgrounds: validateBackgrounds(backgrounds), equipment: repairImportIcons(equipment), traits: repairImportIcons(traits), connections };
    this.readMonsters = async () => { this.content.monsters ??= await read("monsters"); };
  }

  get background() { return this.content?.backgrounds.find(b => b.roll === this.draft.background); }

  selectBackground(roll) {
    const previous = this.draft.background;
    this.draft.background = roll;
    const b = this.background;
    if (!b) return;
    if (!primaryChoices(b).includes(this.draft.primary)) this.draft.primary = primaryChoices(b)[0];
    if (!this.draft.secondary || this.draft.secondary === this.draft.primary) this.draft.secondary = CHARACTERISTICS.find(key => key !== this.draft.primary);
    if (previous !== roll) this.draft.traitChoice = "";
  }

  capture(form = this.form) {
    if (!form || this._attempted) return;
    const values = new FormData(form);
    for (const key of Object.keys(this.draft)) if (values.has(key)) this.draft[key] = key === "gold"
      ? (values.get(key) === "" ? null : Number(values.get(key))) : String(values.get(key));
  }

  async getData() {
    if (!this.content && !this.loadError) {
      try { await this.loadContent(); } catch (error) { this.loadError = error.message; }
    }
    const context = {
      draft: this.draft,
      first: this.step === 0, review: this.step === 3, stepCrow: this.step === 1, stepVillage: this.step === 2,
      error: this.error, loadError: this.loadError, busy: this._busy, attempted: this._attempted,
      canCreate: canCreateCrow(), rolls: this.rolls.join(" · "), creationId: this.creationId
    };
    if (!this.content) return context;
    const b = this.background;
    Object.assign(context, {
      background: b,
      villages: (game.actors?.filter(a => a.type === "village" && a.visible) ?? []).map(a => ({ id: a.id, name: a.name, selected: a.id === this.draft.homeVillageId })),
      homeVillageName: game.actors?.get?.(this.draft.homeVillageId)?.name,
      villageNeedsRef: !!this.draft.homeVillageId && !game.actors?.get?.(this.draft.homeVillageId)?.isOwner,
      backgrounds: this.content.backgrounds.map(entry => ({ ...entry, selected: entry.roll === this.draft.background })),
      connections: this.content.connections.map(entry => ({ ...entry, selected: entry.name === this.draft.connection })),
      connection: this.content.connections.find(entry => entry.name === this.draft.connection)
    });
    if (!b) return context;
    const stats = assignCharacteristics(b, this.draft.primary, this.draft.spread, this.draft.secondary);
    const trait = this.content.traits.find(t => t.name === b.trait.name && t.system.tree === b.trait.tree);
    context.traitHTML = await TextEditor.enrichHTML(trait?.system.description ?? "", { async: true });
    Object.assign(context, {
      backgroundCharacteristic: primaryChoices(b).map(label).join(" or "),
      backgroundHasChoice: primaryChoices(b).length > 1,
      startingEquipment: b.startingKit.map(entry => ({ ...entry,
        note: b.equipment?.find(item => item.name === entry.name)?.note })),
      primaryOptions: primaryChoices(b).map(key => ({ key, label: label(key), selected: key === this.draft.primary })),
      secondaryOptions: CHARACTERISTICS.filter(key => key !== this.draft.primary).map(key => ({ key, label: label(key), selected: key === this.draft.secondary })),
      focused: this.draft.spread === "focused", higherValue: this.draft.spread === "focused" ? "+2" : "+1",
      stats: CHARACTERISTICS.map(key => ({ label: label(key), value: stats[key], displayValue: stats[key] > 0 ? `+${stats[key]}` : String(stats[key]) })),
      reputation: b.trait.tree === "Reputation", goldTotal: this.draft.gold === null ? "—" : this.draft.gold + b.extraGold
    });
    if (this.step === 3) {
      try {
        if (b.pets.length) await this.readMonsters();
        this.plan = buildCrowPlan({ background: b, draft: this.draft, ...this.content, userId: game.user.id });
        context.plan = this.plan;
        context.gear = this.plan.crow.items.filter(item => item.type === "equipment").map(item => ({
          name: item.name,
          quantity: item.system.quantity, location: item.system.location.replace("stash", "Home storage").replace(/^(backpack|belt|hand)(\d+)$/, (_, name, n) => `${label(name)} ${n}`)
        }));
      } catch (error) { this.plan = null; context.error = error.message; }
    }
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-creator-action]").on("click", event => {
      event.preventDefault();
      this.action(event.currentTarget.dataset.creatorAction).catch(error => { this.error = error.message; this._busy = false; this.render(); });
    });
    html.find("select[name], input[name=gold], input[type=radio]").on("change", event => {
      if (event.currentTarget.type === "radio") this._statFocus = { name: event.currentTarget.name, value: event.currentTarget.value };
      const oldBackground = this.draft.background;
      this.capture();
      if (event.currentTarget.name === "background") {
        const next = this.draft.background; this.draft.background = oldBackground; this.selectBackground(next);
      }
      if (this.draft.primary === this.draft.secondary) this.draft.secondary = CHARACTERISTICS.find(key => key !== this.draft.primary);
      this.error = null; this.render();
    });
    if (this._statFocus) {
      const { name, value } = this._statFocus;
      html.find("input[type=radio]").each((_index, input) => {
        if (input.name === name && input.value === value) input.focus();
      });
      this._statFocus = null;
    }
  }

  validateStep() {
    if (!this.background) throw new Error("Roll or select a background first.");
    if (this.step === 1) {
      if (!this.draft.name.trim() || !this.draft.feature.trim()) throw new Error("Give your crow a name and a distinguishing feature.");
      if (!Number.isInteger(this.draft.gold) || this.draft.gold < 3 || this.draft.gold > 18) throw new Error("Roll your starting gold or enter a 3d6 total (3–18).");
      if (this.background.trait.tree === "Reputation" && !this.draft.traitChoice.trim()) throw new Error("Choose a village merchant for your starting trait.");
    }
    if (this.step === 2 && (!this.draft.connectionName.trim() || !this.draft.relationship.trim() || !this.draft.connection)) {
      throw new Error("Name your NPC connection, describe the relationship, and choose a benefit.");
    }
  }

  async action(action) {
    if (this._busy || this._attempted) return;
    this.capture(); this.error = null;
    if (action === "retry") { this.loadError = null; this.content = null; }
    if (action === "back") this.step = Math.max(0, this.step - 1);
    if (action === "next") { this.validateStep(); this.step = Math.min(3, this.step + 1); }
    if (action === "roll-background" || action === "roll-gold") {
      this._busy = true;
      this.element.find("button, input, select").prop("disabled", true);
      try {
        if (action === "roll-background") {
          // Two ordered d6s, with a native chat total of 11–66 rather than their sum.
          const roll = await new Roll("1d6 * 10 + 1d6").evaluate();
          const dice = roll.dice.flatMap(die => die.results.filter(result => result.active !== false).map(result => result.result));
          const b = backgroundFromDice(this.content.backgrounds, dice);
          const message = await roll.toMessage({
            speaker: { alias: game.user.name },
            flavor: `Character Creation — Background (d66): ${dice.join("")} — ${escapeHTML(b.name)}`,
            flags: { [CREATOR_SCOPE]: { creatorRoll: { creationId: this.creationId, kind: "background", dice, background: b.name, tableKey: b.roll } } }
          });
          if (!message) throw new Error("The background roll was not posted to chat. Your background has not changed.");
          this.selectBackground(b.roll); this.rolls.push(`${dice.join(" / ")}: ${b.name}`);
        } else {
          if (!this.background) throw new Error("Select a background before rolling starting gold.");
          const extraGold = this.background.extraGold;
          const roll = await new Roll(extraGold ? `3d6 + ${extraGold}` : "3d6").evaluate();
          const message = await roll.toMessage({
            speaker: { alias: game.user.name },
            flavor: `Character Creation — Starting Gold: ${roll.total} gc${extraGold ? ` (includes ${extraGold} gc from ${escapeHTML(this.background.name)})` : ""}`,
            flags: { [CREATOR_SCOPE]: { creatorRoll: { creationId: this.creationId, kind: "gold", extraGold, total: roll.total } } }
          });
          if (!message) throw new Error("The gold roll was not posted to chat. Your starting gold has not changed.");
          this.draft.gold = roll.total - extraGold;
        }
      } finally { this._busy = false; }
    }
    if (action === "create") {
      if (this.step !== 3) return;
      if (!canCreateCrow()) throw new Error("Your Foundry role cannot create actors. Ask your GM to create the crow or grant that permission.");
      // Rebuild from the current draft, not a potentially stale preview.
      const plan = buildCrowPlan({ background: this.background, draft: this.draft, ...this.content, userId: game.user.id });
      const village = this.draft.homeVillageId ? game.actors.get(this.draft.homeVillageId) : null;
      if (this.draft.homeVillageId && (village?.type !== "village" || !village.visible)) throw new Error("The selected home village is unavailable. Choose another village or leave it unassigned.");
      if (village) plan.crow.flags[CREATOR_SCOPE].homeVillageId = village.id;
      this._busy = true; this._attempted = true;
      this.element.find("button").prop("disabled", true);
      try {
        const actor = await persistCrowPlan(plan, { ActorClass: Actor, randomID: () => foundry.utils.randomID(), userId: game.user.id, creationId: this.creationId });
        if (village?.isOwner) {
          try { await addCrowToVillage(village, actor); }
          catch (error) { ui.notifications.warn(`Crow created, but the village record could not be added: ${error.message} Add the Crow from the village sheet.`); }
        } else if (village) ui.notifications.info(`Home village saved. The Ref can add ${actor.name} from ${village.name}'s sheet to import the NPC connection.`);
        await this.close();
        actor.sheet.render(true);
        ui.notifications.info(`${actor.name} is ready. Review equipment positions and trait effects on the sheet.`);
      } catch (error) {
        this.error = `Creation could not be confirmed: ${error.message} Check the Actors directory for this crow and its pets before opening a new creator. Reference: ${this.creationId}`;
        this._busy = false; this.render();
      }
      return;
    }
    this.render();
  }

  async _updateObject() { /* Creation is an explicit review action; Enter does not create an actor. */ }
}

export function addCharacterCreatorButton(app, html = app?.element) {
  // V1 passes jQuery; V2 and detached sidebar windows pass DOM elements.
  const root = html?.querySelector ? html : html?.[0];
  if (!root?.querySelector) return;
  const existing = root.querySelector(".crows-create-crow");
  if (!canCreateCrow()) {
    root.querySelector(".crows-creator-actions")?.remove();
    existing?.remove();
    return;
  }
  if (existing) return;
  const doc = root.ownerDocument ?? document;
  const row = doc.createElement("div");
  row.className = "crows-creator-actions";
  const button = doc.createElement("button");
  button.type = "button"; button.className = "crows-create-crow";
  button.innerHTML = '<i class="fas fa-feather"></i> Create a Crow';
  button.addEventListener("click", () => {
    if (!canCreateCrow()) return ui.notifications.warn("You do not have permission to create actors.");
    new CrowsCharacterCreator().render(true);
  });
  row.append(button);
  // Keep this outside Foundry's conditional native action groups.
  const header = root.matches?.(".directory-header") ? root : root.querySelector(".directory-header");
  if (header) header.append(row);
  else root.prepend(row);
}

export function addCharacterCreatorToDocumentDirectory(app, html) {
  if (app?.documentName === "Actor" || app?.collection?.documentName === "Actor" || app?.tabName === "actors") {
    addCharacterCreatorButton(app, html);
  }
}

export function refreshCharacterCreatorButtons() {
  const directory = ui.actors;
  if (!directory) return;
  addCharacterCreatorButton(directory);
  if (directory.popout) addCharacterCreatorButton(directory.popout);
}
