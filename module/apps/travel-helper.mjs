import { travelJournalHTML } from "../travel-journal.mjs";
import { CrowsTravel } from "../travel.mjs";
import { TRAVEL_PACES, TRAVEL_ROLES, TRAVEL_STEPS, roleWarnings, initialTravelState } from "../travel-state.mjs";

const normalizeTableName = name => String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function findTravelReferenceTable(tables, name) {
  const expected = normalizeTableName(name);
  const aliases = new Set([expected, expected.replace("interesting ", "")]);
  const matches = table => {
    const key = table.flags?.["fvtt-crows-system"]?.importSource?.key;
    return aliases.has(normalizeTableName(table.name)) || (key && aliases.has(normalizeTableName(key.replace(/^[^:]*:/, ""))));
  };
  const exact = tables.find(matches);
  if (exact) return exact;
  // Ref-book source pages identify renamed imported tables without result-text matching.
  const pages = expected.startsWith("major ") ? [14] : expected.startsWith("minor ") ? [12, 13] : [];
  if (!pages.length) return null;
  return tables.find(table => {
    const source = table.flags?.["fvtt-crows-pdf-importer"]?.source;
    const actual = source?.pages ?? [source?.page];
    return source?.set === "ref" && actual.length === pages.length && pages.every(page => actual.includes(page));
  }) ?? null;
}

const REF_TABLE_PACK = "world.crows-ref-tables";
export async function readTravelCompendiumIndex(packs) {
  const pack = packs?.get(REF_TABLE_PACK);
  if (!pack || pack.documentName !== "RollTable") return [];
  const index = await pack.getIndex({fields:["flags.fvtt-crows-system.importSource", "flags.fvtt-crows-pdf-importer.source"]});
  return index.contents;
}

export async function resolveTravelReference(name, worldTables, packs) {
  const worldTable = findTravelReferenceTable(worldTables, name);
  if (worldTable) return worldTable;
  const index = await readTravelCompendiumIndex(packs);
  const match = findTravelReferenceTable(index, name);
  return match ? packs.get(REF_TABLE_PACK).getDocument(match._id ?? match.id) : null;
}

const label = value => value.charAt(0).toUpperCase() + value.slice(1);

const PACE_META = {
  slow: { hexes: 1, en: 8, test: "Edge on role tests" },
  normal: { hexes: 2, en: 7, test: "Unmodified role tests" },
  fast: { hexes: 3, en: 6, test: "Bane on role tests" }
};

const STEP_COPY = {
  pace: { title: "How fast will you travel?", hint: "Players vote. The Ref chooses the party's pace." },
  roles: { title: "Assign travel roles", hint: "Choose roles, then resolve tasks in order: supporters, guide, scouts, trackers." },
  travel: { title: "Encounter check", hint: "The Ref rolls an encounter check during the travel day." },
  explore: { title: "Explore a destination", hint: "Pause to explore a point of interest, or conclude travel when you reach your destination." },
  rest: { title: "Make camp", hint: "Check for a rest encounter. Resolve food, rest activities, and recovery on character sheets." },
  miasma: { title: "Resist the Miasma", hint: "After a rest in the Miasma, resolve each human's resistance and effects on their sheet." },
  complete: { title: "The day is done", hint: "Review the journal entry below. Finish Travel or Start next day saves it to the Travel Journal. Starting a new day then clears daily results and keeps your party and lost status." }
};

export class CrowsTravelHelper extends FormApplication {
  static instance;
  static seenSession;

  constructor(...args) {
    super(...args);
    CrowsTravelHelper.instance = this;
    this.drafts = new Map();
    this.openRoleNotes = new Set();
  }

  fieldKey(input) {
    if (input?.dataset?.record) return `record:${input.dataset.member}:${input.dataset.record}`;
    if (input?.dataset?.check) return `check:${input.dataset.index}:${input.dataset.check}`;
    if (input?.dataset?.overview) return `overview:${input.dataset.overview}`;
    if (input?.hasAttribute?.("data-journal-notes")) return "journalNotes";
    if (input?.name === "guestName") return "guest";
    return null;
  }

  render(...args) {
    const input = globalThis.document?.activeElement;
    if (this.element?.[0]?.contains(input) && this.fieldKey(input)) {
      this.editFocus = { key: this.fieldKey(input), start: input.selectionStart, end: input.selectionEnd };
    }
    return super.render(...args);
  }

  async _render(force, options = {}) {
    this.compendiumTables = [];
    this.referenceError = null;
    if (game.user.isGM) {
      try { this.compendiumTables = await readTravelCompendiumIndex(game.packs); }
      catch (error) { this.referenceError = "Could not read the Ref Tables compendium. Reopen the helper to retry."; }
    }
    return super._render(force, options);
  }

  async openReference(name) {
    if (!game.user.isGM) return;
    try {
      const table = await resolveTravelReference(name, game.tables.contents, game.packs);
      if (!table) throw new Error("Import your Ref Book PDF with Crows PDF Importer to use this table.");
      table.sheet.render(true);
    } catch (error) {
      this.error = error.message;
      this.render();
    }
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "crows-travel-helper", title: "Crows: Travel",
      template: "systems/fvtt-crows-system/templates/travel-helper.html",
      classes: ["crows", "crows-travel-helper", "crows-dialog"], width: 660, height: 620,
      resizable: true, closeOnSubmit: false, submitOnChange: false, scrollY: [".travel-body"]
    });
  }

  static show() {
    this.instance ??= new this();
    return this.instance.render(true);
  }

  static sync() {
    const state = { ...initialTravelState(), ...CrowsTravel.getState() };
    const eligible = game.user.isGM || (state.roster ?? []).some(id => game.actors.get(id)?.isOwner);
    if (state.session && state.step !== "complete" && this.seenSession !== state.session && eligible) {
      this.seenSession = state.session;
      this.show();
    } else if (this.instance?.rendered) this.instance.render();
  }

  getData() {
    const state = { ...initialTravelState(), ...CrowsTravel.getState() };
    if (this.session !== undefined && this.session !== state.session) {
      this.drafts.clear();
      this.editFocus = null;
    }
    this.session = state.session;
    const isGM = game.user.isGM;
    const roster = (state.roster ?? game.actors.filter(actor => actor.type === "crow").map(actor => actor.id))
      .filter(id => { const actor = game.actors.get(id); return actor ? !actor.system?.isDead : Object.hasOwn(state.guests, id); });
    const ownsTraveler = roster.some(id => game.actors.get(id)?.isOwner);
    const voting = Boolean(state.session && state.step === "pace" && ownsTraveler);
    const counts = Object.fromEntries(TRAVEL_PACES.map(pace => [pace, Object.values(state.votes).filter(vote => vote === pace).length]));
    const stepIndex = TRAVEL_STEPS.findIndex(step => step.id === state.step);
    const members = roster.map(id => game.actors.get(id) ?? { id, name: state.guests[id], visible: true, guest: true }).filter(actor => isGM || actor.visible || actor.isOwner).map(actor => ({
      id: actor.id,
      name: actor.name,
      img: actor.img || "icons/svg/mystery-man.svg",
      isDead: Boolean(actor.system?.isDead),
      canOpen: !actor.guest && (actor.visible || actor.isOwner),
      notesOpen: this.openRoleNotes.has(actor.id),
      canAdjustRole: isGM && state.step === "roles",
      roleAdjustments: [{field:"travelEN",label:"Travel EN"},{field:"restEN",label:"Rest EN"},{field:"hexes",label:"Hexes"}].map(metric => {
        const value = state.records[actor.id]?.[metric.field] ?? 0;
        return {...metric, value: value > 0 ? `+${value}` : String(value), actorId: actor.id, name: actor.name};
      }),
      adjustmentSummary: `Travel EN ${(state.records[actor.id]?.travelEN ?? 0) >= 0 ? "+" : ""}${state.records[actor.id]?.travelEN ?? 0}; rest EN ${(state.records[actor.id]?.restEN ?? 0) >= 0 ? "+" : ""}${state.records[actor.id]?.restEN ?? 0}; hexes ${(state.records[actor.id]?.hexes ?? 0) >= 0 ? "+" : ""}${state.records[actor.id]?.hexes ?? 0}`,
      canRecord: state.step === "roles" && (isGM || actor.isOwner),
      result: state.records[actor.id]?.result ?? "",
      notes: state.records[actor.id]?.notes ?? "",
      canAssign: Boolean(state.session && state.step === "roles" && (isGM || actor.isOwner)),
      role: label(state.roles[actor.id] || "Unassigned "),
      roleKey: state.roles[actor.id] || "",
      cruelty: Number(actor.system?.cruelty) || 0,
      roles: [{ id: "", label: "Unassigned", selected: !state.roles[actor.id] }, ...TRAVEL_ROLES.map(role => ({
        id: role, label: `${label(role)} (${roster.filter(id => state.roles[id] === role).length}/${role === "guide" ? 1 : 3})`, selected: state.roles[actor.id] === role
      }))]
    }));
    const currentStepObj = TRAVEL_STEPS[stepIndex] || TRAVEL_STEPS[0];
    const pace = PACE_META[state.pace];
    const candidates = isGM ? game.actors.filter(actor => !actor.system?.isDead).map(actor => ({
      id: actor.id, name: actor.name, type: actor.type, selected: roster.includes(actor.id)
    })) : [];
    const guestCandidates = isGM ? Object.entries(state.guests).map(([id, name]) => ({id, name, selected: roster.includes(id)})) : [];
    return {
      journalPreview: state.step === "complete" ? travelJournalHTML({...state, notes:this.drafts.get("journalNotes") ?? state.notes}, game.actors.filter(() => true)) : "",
      journalNotes: this.drafts.get("journalNotes") ?? state.notes,
      journalAudience: game.settings.get("fvtt-crows-system", "travelJournalAudience") === "trusted" ? "Trusted Players and above" : "all players",
      encounterRecords: state.encounters.map(record => ({...record, expected: JSON.stringify(record)})),
      state, isGM, busy: this.busy, error: this.error, hasDay: Boolean(state.session),
      rosterOpen: Boolean(this.rosterOpen), nextDay: state.day + 1,
      showOtherTables: ["travel", "rest"].includes(state.step),
      showTables: Boolean(state.session && ["roles", "travel", "rest"].includes(state.step)),
      showDayRecord: Boolean(state.session && !["pace", "roles", "complete"].includes(state.step)),
      showEncounterRecords: Boolean(state.session && ["travel", "rest"].includes(state.step)),
      canEditChecks: isGM && ["travel", "rest"].includes(state.step),
      rulesReference: state.session ? {
        pace: "Rules Book · p. 24 — pace, speed, roads & waterways",
        roles: "Rules Book · pp. 25–26 — roles; p. 27 — getting back on track",
        travel: "Rules Book · p. 29 — travel encounters",
        explore: "Rules Book · p. 29 — points of interest; pp. 13–14 — dungeon turns",
        rest: "Rules Book · pp. 14–15 — resting & rest activities",
        miasma: "Rules Book · pp. 27–28 — Miasma resistance & effects"
      }[state.step] : null,
      referenceTables: (state.step === "roles" ? [
        {name:"Minor Interesting Things", reference:"Ref Book · pp. 12–13"},
        {name:"Major Interesting Things", reference:"Ref Book · p. 14"}
      ] : ["travel", "rest"].includes(state.step) ? [{name:"Travel Encounters",reference:"Ref Book · p. 1"}] : []).map(entry => {
        const world = isGM ? findTravelReferenceTable(game.tables.contents, entry.name) : null;
        const packed = isGM && !world ? findTravelReferenceTable(this.compendiumTables ?? [], entry.name) : null;
        return {...entry, available: Boolean(world || packed), source: world ? "World table" : packed ? "Ref Tables compendium" : null};
      }),
      referenceError: this.referenceError,
      metrics: [{field:"hexes", label:"Hex allowance"}, {field:"travelEN", label:"Travel EN"}, {field:"restEN", label:"Rest EN"}].map(metric => ({...metric, value: state[metric.field]})),
      isTravelStep: state.step === "travel", isExploreStep: state.step === "explore",
      isRestStep: state.step === "rest", isMiasmaStep: state.step === "miasma",
      showSheets: state.step === "miasma",
      restEN: state.restEN, hasRestEN: Number.isInteger(state.restEN),
      stepNumber: stepIndex + 1, stepCount: TRAVEL_STEPS.length,
      stage: STEP_COPY[state.step] || STEP_COPY.pace,
      basePace: pace,
      travelEN: state.travelEN ?? null, hasTravelEN: Number.isInteger(state.travelEN),
      roleGroups: [...TRAVEL_ROLES, ""].map(role => ({
        label: role ? label(role) : "Unassigned / assisting",
        members: members.filter(member => member.roleKey === role)
      })).filter(group => group.members.length),
      hasGM: Boolean(game.users.activeGM), completed: state.step === "complete", voting,
      isRolesStep: state.step === "roles", isPaceStep: state.step === "pace",
      rosterCount: roster.length,
      paceLabel: state.pace ? label(state.pace) : "Awaiting Ref's choice",
      paces: TRAVEL_PACES.map(pace => ({
        id: pace, label: label(pace), count: counts[pace],
        ...PACE_META[pace],
        voted: state.votes[game.user.id] === pace, chosen: state.pace === pace
      })),
      steps: TRAVEL_STEPS.map((step, index) => ({
        ...step,
        number: index + 1,

        current: state.step === step.id,
        passed: stepIndex > index
      })),
      currentStep: currentStepObj,
      nextStep: TRAVEL_STEPS[stepIndex + 1], previousStep: TRAVEL_STEPS[stepIndex - 1],
      members, roleMembers: [...members].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id)), warnings: roleWarnings({ ...state, roster }),
      candidates: [...candidates, ...guestCandidates],
      crowCandidates: candidates.filter(actor => actor.type === "crow"),
      otherCandidates: candidates.filter(actor => actor.type !== "crow"),
      guestCandidates,
      otherActorsOpen: Boolean(this.otherActorsOpen),
      tables: isGM ? game.tables.contents.map(table => {
        const source = table.flags?.["fvtt-crows-pdf-importer"]?.source ?? table.flags?.["fvtt-crows-system"]?.source;
        const pages = source?.pages ?? (source?.page ? [source.page] : []);
        return { id: table.id, name: table.name, reference: pages.length ? `${source.set === "ref" ? "Ref Book" : "Source"}, pp. ${pages.join(", ")}` : "", selected: this.tableId === table.id };
      }).sort((a, b) => a.name.localeCompare(b.name)) : []
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("input[type=text], textarea, input[data-overview]").each((_index, input) => {
      const key = this.fieldKey(input);
      if (this.drafts.has(key)) input.value = this.drafts.get(key);
      if (this.editFocus?.key === key) {
        input.focus({ preventScroll: true });
        if (typeof input.setSelectionRange === "function" && input.type !== "number" && input.type !== "checkbox") input.setSelectionRange(this.editFocus.start, this.editFocus.end);
      }
    });
    this.editFocus = null;
    html.find("input[type=text], textarea, input[type=number]").on("input", event => {
      const input = event.currentTarget;
      const key = this.fieldKey(input);
      if (key) this.drafts.set(key, input.value);
      if (key === "journalNotes") html.find("[data-journal-preview-notes]").text(input.value || "No additional notes.");
    });
    html.find("[data-overview]").on("change", event => {
      const input = event.currentTarget;
      this.send({ action: "overview", field: input.dataset.overview, value: input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value });
    });
    html.find("[data-adjust]").on("click", event => {
      const input = event.currentTarget;
      this.send({action: "overview", field: input.dataset.adjust, delta: Number(input.dataset.delta)});
    });
    html.find("[data-role-adjust]").on("click", event => {
      const {roleAdjust: field, member: actorId, delta} = event.currentTarget.dataset;
      this.send({action:"role-adjust", actorId, field, delta:Number(delta)});
    });
    html.find("[data-role-notes]").on("toggle", event => {
      const element = event.currentTarget;
      if (!element.isConnected) return;
      if (element.open) this.openRoleNotes.add(element.dataset.roleNotes);
      else this.openRoleNotes.delete(element.dataset.roleNotes);
    });
    html.find("[data-record]").on("change", event => {
      const input = event.currentTarget;
      this.send({action: "record", actorId: input.dataset.member, field: input.dataset.record, value: input.value});
    });
    html.find("[data-delete-check]").on("click", event => {
      const input = event.currentTarget;
      this.send({action:"delete-encounter", index:Number(input.dataset.deleteCheck), expected:input.dataset.expected});
    });
    html.find("[data-check]").on("change", event => {
      const input = event.currentTarget;
      this.send({action: "encounter", index: Number(input.dataset.index), field: input.dataset.check, value: input.value});
    });
    html.find(".travel-add-check").on("click", () => this.send({action: "encounter"}));
    html.find(".travel-add-guest").on("click", () => this.send({action: "guest", name: html.find("[name=guestName]").val()}));
    html.find(".travel-other-actors").on("toggle", event => {
      if (event.currentTarget.isConnected) this.otherActorsOpen = event.currentTarget.open;
    });
    html.find(".travel-roster-drawer").on("toggle", event => {
      if (event.currentTarget.isConnected) this.rosterOpen = event.currentTarget.open;
    });
    html.find(".travel-roll-encounter").on("click", event => {
      event.preventDefault();
      this.rollEncounter();
    });
    html.find("[name=travelStep]").on("change", event => this.send({ action: "step", step: event.currentTarget.value }));
    html.find("[name=travelTable]").on("change", event => { this.tableId = event.currentTarget.value; });
    html.find("[data-travel-action]").on("click", event => {
      event.preventDefault();
      const { travelAction: action, pace, step } = event.currentTarget.dataset;
      const notes = html.find("[data-journal-notes]")[0];
      this.send({ action, pace, step, ...(["start", "finish"].includes(action) && notes ? {journalNotes:notes.value} : {}) });
    });
    html.find("[data-travel-member]").on("change", event => {
      this.rosterFocusId = event.currentTarget.dataset.travelMember;
      this.send({ action: "roster", actorId: this.rosterFocusId, included: event.currentTarget.checked });
    });
    if (!this.busy && this.rosterFocusId) {
      html.find("[data-travel-member]").each((_index, input) => {
        if (input.dataset.travelMember === this.rosterFocusId) input.focus({ preventScroll: true });
      });
      this.rosterFocusId = null;
    }
    html.find("[data-travel-role]").on("change", event => this.send({
      action: "role", actorId: event.currentTarget.dataset.travelRole, role: event.currentTarget.value
    }));
    html.find("[data-travel-actor]").on("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const actor = game.actors.get(event.currentTarget.dataset.travelActor);
      if (actor?.visible || actor?.isOwner) actor.sheet.render(true);
    });
    html.find("[data-reference-table]").on("click", event => {
      event.preventDefault();
      this.openReference(event.currentTarget.dataset.referenceTable);
    });
    html.find(".travel-open-table").on("click", event => {
      event.preventDefault();
      if (!game.user.isGM) return;
      const table = game.tables.get(html.find("[name=travelTable]").val());
      if (table) table.sheet.render(true);
      else ui.notifications.info("Select an imported world table first.");
    });
  }

  async rollEncounter() {
    const state = { ...initialTravelState(), ...CrowsTravel.getState() };
    if (this.busy || !game.user.isGM) return;
    if (state.session !== this.session || !["travel", "rest"].includes(state.step)) return;
    const resting = state.step === "rest";
    const en = resting ? state.restEN : state.travelEN;
    if (!Number.isInteger(en)) {
      this.error = `Set the ${resting ? "rest" : "travel"} EN in the overview before rolling.`;
      this.render();
      return;
    }
    this.busy = true;
    this.error = null;
    this.element.find("fieldset").prop("disabled", true);
    try {
      const check = await game.crows.rollEncounterCheck(en, resting ? { rest: true } : { travel: true });
      if (check) await CrowsTravel.request({ action: "encounter", session: state.session, result: String(check.result), en: check.en, ...(resting ? {kind:"Rest"} : {}) });
    }
    catch (error) { this.error = error.message; }
    finally { this.busy = false; this.render(); }
  }

  async send(request) {
    if (this.busy) return;
    const drawer = this.element.find(".travel-roster-drawer")[0];
    if (drawer) this.rosterOpen = drawer.open;
    const otherActors = this.element.find(".travel-other-actors")[0];
    if (otherActors) this.otherActorsOpen = otherActors.open;
    this.busy = true;
    this.error = null;
    this.element.find("fieldset").prop("disabled", true);
    try {
      await CrowsTravel.request({ ...request, session: this.session });
      if (request.action === "delete-encounter") {
        const shifted = new Map();
        for (const [key, value] of this.drafts) {
          const match = /^check:(\d+):(.*)$/.exec(key);
          if (!match || Number(match[1]) < request.index) shifted.set(key, value);
          else if (Number(match[1]) > request.index) shifted.set(`check:${Number(match[1]) - 1}:${match[2]}`, value);
        }
        this.drafts = shifted;
      }
      const key = request.action === "record" ? `record:${request.actorId}:${request.field}`
        : request.action === "overview" ? `overview:${request.field}`
        : request.action === "encounter" && request.index !== undefined ? `check:${request.index}:${request.field}`
        : request.action === "guest" ? "guest" : null;
      if (key && (request.action === "guest" || this.drafts.get(key) === String(request.value))) this.drafts.delete(key);
    }
    catch (error) { this.error = error.message; }
    finally { this.busy = false; this.render(); }
  }

  async _updateObject() { /* Shared state changes are explicit, serialized requests. */ }
}

export function addTravelButton(app, html = app?.element) {
  const root = html?.querySelector ? html : html?.[0];
  if (!root?.querySelector || root.querySelector(".crows-open-travel")) return;
  const button = (root.ownerDocument ?? document).createElement("button");
  button.type = "button";
  button.className = "crows-open-travel";
  button.innerHTML = '<i class="fas fa-route"></i> Travel';
  button.addEventListener("click", () => CrowsTravelHelper.show());
  const header = root.matches?.(".directory-header") ? root : root.querySelector(".directory-header");
  if (header) header.append(button);
  else root.prepend(button);
}

export function addTravelToDocumentDirectory(app, html) {
  if (app?.documentName === "Actor" || app?.collection?.documentName === "Actor" || app?.tabName === "actors") addTravelButton(app, html);
}

export function refreshTravelButton() {
  if (!ui.actors) return;
  addTravelButton(ui.actors);
  if (ui.actors.popout) addTravelButton(ui.actors.popout);
}
