import { CrowsTravel } from "../travel.mjs";
import { TRAVEL_PACES, TRAVEL_ROLES, TRAVEL_STEPS, roleWarnings } from "../travel-state.mjs";

const label = value => value.charAt(0).toUpperCase() + value.slice(1);

const STEP_ICONS = {
  pace: "fa-tachometer-alt",
  roles: "fa-user-tag",
  travel: "fa-route",
  explore: "fa-compass",
  rest: "fa-campground",
  miasma: "fa-skull-crossbones",
  complete: "fa-flag-checkered"
};

const PACE_META = {
  slow: { icon: "fa-shield-alt", desc: "Travel cautiously and deliberately." },
  normal: { icon: "fa-walking", desc: "Steady standard travel pace across the wilds." },
  fast: { icon: "fa-running", desc: "Prioritize speed and cover ground swiftly." }
};

export class CrowsTravelHelper extends FormApplication {
  static instance;
  static seenSession;

  constructor(...args) {
    super(...args);
    CrowsTravelHelper.instance = this;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "crows-travel-helper", title: "Crows: Travel",
      template: "systems/fvtt-crows-system/templates/travel-helper.html",
      classes: ["crows", "crows-travel-helper", "crows-dialog"], width: 780, height: 720,
      resizable: true, closeOnSubmit: false, submitOnChange: false, scrollY: [".travel-body"]
    });
  }

  static show() {
    this.instance ??= new this();
    return this.instance.render(true);
  }

  static sync() {
    const state = CrowsTravel.getState();
    const eligible = game.user.isGM || (state.roster ?? []).some(id => game.actors.get(id)?.isOwner);
    if (state.session && state.step !== "complete" && this.seenSession !== state.session && eligible) {
      this.seenSession = state.session;
      this.show();
    } else if (this.instance?.rendered) this.instance.render();
  }

  getData() {
    const state = CrowsTravel.getState();
    this.session = state.session;
    const isGM = game.user.isGM;
    const roster = (state.roster ?? game.actors.filter(actor => actor.type === "crow").map(actor => actor.id))
      .filter(id => game.actors.get(id)?.type === "crow");
    const ownsTraveler = roster.some(id => game.actors.get(id)?.isOwner);
    const voting = Boolean(state.session && state.step === "pace" && ownsTraveler);
    const counts = Object.fromEntries(TRAVEL_PACES.map(pace => [pace, Object.values(state.votes).filter(vote => vote === pace).length]));
    const stepIndex = TRAVEL_STEPS.findIndex(step => step.id === state.step);
    const members = roster.map(id => game.actors.get(id)).filter(actor => isGM || actor.visible || actor.isOwner).map(actor => ({
      id: actor.id,
      name: actor.name,
      img: actor.img || "icons/svg/mystery-man.svg",
      isDead: Boolean(actor.system?.isDead),
      canOpen: actor.visible || actor.isOwner,
      canAssign: Boolean(state.session && (isGM || (state.step === "roles" && actor.isOwner))),
      role: label(state.roles[actor.id] || "Unassigned "),
      roleKey: state.roles[actor.id] || "",
      roles: [{ id: "", label: "Unassigned", selected: !state.roles[actor.id] }, ...TRAVEL_ROLES.map(role => ({
        id: role, label: `${label(role)} (${roster.filter(id => state.roles[id] === role).length}/${role === "guide" ? 1 : 3})`, selected: state.roles[actor.id] === role
      }))]
    }));
    const currentStepObj = TRAVEL_STEPS[stepIndex] || TRAVEL_STEPS[0];
    return {
      state, isGM, busy: this.busy, error: this.error, hasDay: Boolean(state.session),
      rosterOpen: Boolean(this.rosterOpen), nextDay: state.day + 1,
      showTables: !["pace", "roles", "complete"].includes(state.step),
      hasGM: Boolean(game.users.activeGM), completed: state.step === "complete", voting,
      isRolesStep: state.step === "roles", isPaceStep: state.step === "pace",
      rosterCount: roster.length,
      paceLabel: state.pace ? label(state.pace) : "Awaiting Ref's choice",
      paces: TRAVEL_PACES.map(pace => ({
        id: pace, label: label(pace), count: counts[pace],
        icon: PACE_META[pace]?.icon || "fa-shoe-prints",
        desc: PACE_META[pace]?.desc || "",
        voted: state.votes[game.user.id] === pace, chosen: state.pace === pace
      })),
      steps: TRAVEL_STEPS.map((step, index) => ({
        ...step,
        number: index + 1,
        icon: STEP_ICONS[step.id] || "fa-circle",
        current: state.step === step.id,
        passed: stepIndex > index
      })),
      currentStep: { ...currentStepObj, icon: STEP_ICONS[currentStepObj.id] || "fa-compass" },
      nextStep: TRAVEL_STEPS[stepIndex + 1], previousStep: TRAVEL_STEPS[stepIndex - 1],
      members, warnings: roleWarnings({ ...state, roster }),
      candidates: isGM ? game.actors.filter(actor => actor.type === "crow").map(actor => ({
        id: actor.id,
        name: actor.name,
        img: actor.img || "icons/svg/mystery-man.svg",
        isDead: Boolean(actor.system?.isDead),
        selected: roster.includes(actor.id)
      })) : [],
      tables: isGM ? game.tables.contents.map(table => ({ id: table.id, name: table.name, selected: this.tableId === table.id })).sort((a, b) => a.name.localeCompare(b.name)) : []
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".travel-roster-drawer").on("toggle", event => {
      if (event.currentTarget.isConnected) this.rosterOpen = event.currentTarget.open;
    });
    html.find("[name=travelTable]").on("change", event => { this.tableId = event.currentTarget.value; });
    html.find("[data-travel-action]").on("click", event => {
      event.preventDefault();
      const { travelAction: action, pace, step } = event.currentTarget.dataset;
      this.send({ action, pace, step });
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
    html.find(".travel-open-table").on("click", event => {
      event.preventDefault();
      if (!game.user.isGM) return;
      const table = game.tables.get(html.find("[name=travelTable]").val());
      if (table) table.sheet.render(true);
      else ui.notifications.info("Select an imported world table first.");
    });
  }

  async send(request) {
    if (this.busy) return;
    const drawer = this.element.find(".travel-roster-drawer")[0];
    if (drawer) this.rosterOpen = drawer.open;
    this.busy = true;
    this.error = null;
    this.element.find("fieldset").prop("disabled", true);
    try { await CrowsTravel.request({ ...request, session: this.session }); }
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
