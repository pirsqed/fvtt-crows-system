/** Travel coordination only. Task descriptions and outcomes belong to imported content. */
export const TRAVEL_ROLES = ["supporter", "guide", "scout", "tracker"];
export const TRAVEL_PACES = ["slow", "normal", "fast"];
export const TRAVEL_STEPS = [
  { id: "pace", label: "Choose pace", hint: "Players vote; the Ref chooses the group's pace." },
  { id: "roles", label: "Choose roles", hint: "Choose roles, then resolve tests: supporters, guide, scouts, trackers. Use your imported rules for tasks and outcomes." },
  { id: "travel", label: "Encounter check", hint: "The Ref rolls an encounter check during the travel day." },
  { id: "explore", label: "Explore destinations", hint: "Explore a point of interest, continue to camp, or conclude travel at your destination." },
  { id: "rest", label: "Camp & rest", hint: "Resolve rest encounters, supplies, rest activities, and recovery on the character sheets." },
  { id: "miasma", label: "Resolve Miasma", hint: "Resolve resistance and effects where applicable, then finish the day." },
  { id: "complete", label: "Day complete", hint: "Start the next day, or finish travel here. Your party selection is remembered." }
];

export function initialTravelState() {
  return { journeyId: null, journey: { title: "", origin: "", goals: "", notes: "" }, session: null, day: 0, step: "pace", roster: null, pace: null, votes: {}, roles: {}, travelEN: null, restEN: null, hexes: null, adjusted: {}, notes: "", lost: false, guests: {}, records: {}, encounters: [] };
}

export function roleWarnings(state) {
  return TRAVEL_ROLES.flatMap(role => {
    const count = state.roster.filter(id => state.roles[id] === role).length;
    const limit = role === "guide" ? 1 : 3;
    return count > limit ? [`${role}: ${count} assigned (usual limit ${limit}). The Ref can adjust assignments.`] : [];
  });
}

/** Pure reducer: all requests are checked against the latest saved day and user permissions. */
export function applyTravelAction(current, request, { user, actors, users, sessionId }) {
  if (!user?.active) throw new Error("This user is no longer connected.");
  const state = { ...initialTravelState(), ...structuredClone(current) };
  if (!current.adjusted && Number.isInteger(current.travelEN)) state.adjusted.travelEN = true;
  const available = id => actors.some(actor => actor.id === id && !actor.system?.isDead) || Object.hasOwn(state.guests, id);
  const gm = user.isGM;
  const requireGM = () => { if (!gm) throw new Error("Only the Ref can change the travel procedure."); };
  if (!request || typeof request.action !== "string") throw new Error("Invalid travel request.");
  if (request.session !== state.session) throw new Error("The travel day changed. Use the refreshed window.");
  if (request.action === "start" && request.journey) {
    requireGM();
    if (state.session) throw new Error("Journey details are set before starting a day.");
    state.journey = Object.fromEntries(["title", "origin", "goals", "notes"].map(field =>
      [field, String(request.journey[field] ?? state.journey[field] ?? "").trim().slice(0, ["title", "origin"].includes(field) ? 200 : 8000)]));
  }
  if (request.action === "start") {
    requireGM();
    if (state.session && state.step !== "complete") throw new Error("A travel day is already underway. Resume it first.");
    const roster = (state.roster ?? actors.filter(actor => actor.type === "crow").map(actor => actor.id))
      .filter(available);
    return { ...initialTravelState(), session: sessionId, journeyId: state.journeyId ?? (state.session ? "legacy" : sessionId), journey: state.journey, day: state.journeyId || state.session ? state.day + 1 : 1, roster, guests: state.guests, lost: state.lost };
  }
  if (!state.session && !["roster", "guest", "journey", "cancel-travel"].includes(request.action)) throw new Error("The Ref needs to start a travel day first.");
  // Deleted actors and removed participants must not keep occupying a role.
  state.roster = (state.roster ?? actors.filter(actor => actor.type === "crow").map(actor => actor.id))
    .filter(available);
  const owns = actor => actor && (gm || actor.testUserPermission?.(user, "OWNER"));
  switch (request.action) {
    case "cancel-travel":
      requireGM();
      if (state.session) throw new Error("Cancel the current day before cancelling travel.");
      return { ...initialTravelState(), roster: state.roster, guests: state.guests };
    case "finish":
      requireGM();
      if (state.step !== "complete") throw new Error("Complete the travel day before finishing travel.");
      // Keep the completed results available; the next journey starts at day one.
      return { ...state, session: null, journeyId: null, journey: initialTravelState().journey, step: "pace" };
    case "cancel":
      requireGM();
      return { ...initialTravelState(), journeyId: state.journeyId ?? "legacy", journey: state.journey, roster: state.roster, guests: state.guests, lost: state.lost,
        day: state.step === "complete" ? state.day : Math.max(0, state.day - 1) };
    case "journey": {
      requireGM();
      if (state.session) throw new Error("Journey details are set before starting a day.");
      if (!["title", "origin", "goals", "notes"].includes(request.field)) throw new Error("Unknown journey field.");
      state.journey = { ...state.journey, [request.field]: String(request.value ?? "").trim().slice(0, ["title", "origin"].includes(request.field) ? 200 : 8000) };
      break;
    }
    case "roster": {
      requireGM();
      const actor = actors.find(actor => actor.id === request.actorId) ?? (Object.hasOwn(state.guests, request.actorId) ? { id: request.actorId } : null);
      if (!actor || actor.system?.isDead) throw new Error("That traveler is no longer available.");
      if (request.included === true && !state.roster.includes(actor.id)) state.roster.push(actor.id);
      if (request.included === false) state.roster = state.roster.filter(id => id !== actor.id);
      break;
    }
    case "guest": {
      requireGM();
      const name = String(request.name ?? "").trim().slice(0, 120);
      if (!name) throw new Error("Enter a traveler name.");
      const id = `guest-${sessionId}`;
      state.guests[id] = name;
      state.roster.push(id);
      break;
    }
    case "role-adjust": {
      requireGM();
      if (!state.roster.includes(request.actorId)) throw new Error("That traveler is no longer in the party.");
      if (!["travelEN", "restEN", "hexes"].includes(request.field) || ![-1, 1].includes(request.delta)) throw new Error("Choose a travel EN, rest EN, or hex adjustment.");
      const total = (state[request.field] ?? 0) + request.delta;
      if (total < 0) throw new Error("The day's total cannot be negative.");
      const record = state.records[request.actorId] ?? {};
      state.records[request.actorId] = { ...record, [request.field]: (record[request.field] ?? 0) + request.delta };
      state[request.field] = total;
      state.adjusted[request.field] = true;
      break;
    }
    case "record": {
      const actor = actors.find(actor => actor.id === request.actorId);
      if (!state.roster.includes(request.actorId) || (!gm && !owns(actor))) throw new Error("You can only record results for a traveler you own.");
      if (!["result", "notes"].includes(request.field)) throw new Error("Unknown record field.");
      state.records[request.actorId] = { ...state.records[request.actorId], [request.field]: String(request.value ?? "").slice(0, 4000) };
      break;
    }
    case "overview": {
      requireGM();
      const { field } = request;
      if (["hexes", "travelEN", "restEN"].includes(field)) {
        const value = request.delta === undefined ? request.value : (state[field] ?? 0) + request.delta;
        if (!Number.isInteger(value) || value < 0) throw new Error("Enter a non-negative whole number.");
        state[field] = value;
        state.adjusted[field] = true;
      } else if (field === "lost") state.lost = Boolean(request.value);
      else if (field === "notes") state.notes = String(request.value ?? "").slice(0, 8000);
      else throw new Error("Unknown overview field.");
      break;
    }
    case "delete-encounter": {
      requireGM();
      if (!Number.isInteger(request.index) || !state.encounters[request.index]) throw new Error("Check no longer exists.");
      // Reject a stale delete if another Ref has changed or removed this entry.
      if (JSON.stringify(state.encounters[request.index]) !== request.expected) throw new Error("This encounter record changed. Review it and try again.");
      state.encounters.splice(request.index, 1);
      break;
    }
    case "encounter": {
      requireGM();
      if (request.index !== undefined) {
        if (!Number.isInteger(request.index) || !state.encounters[request.index]) throw new Error("Check no longer exists.");
        if (!["result", "notes"].includes(request.field)) throw new Error("Unknown check field.");
        state.encounters[request.index][request.field] = String(request.value ?? "").slice(0, 4000);
      } else state.encounters.push({ result: String(request.result ?? ""), notes: "", en: request.en ?? null, kind: request.kind === "Rest" || state.step === "rest" ? "Rest" : "Travel" });
      break;
    }
    case "vote": {
      if (state.step !== "pace") throw new Error("Pace voting is closed. The Ref can reopen it.");
      if (!state.roster.some(id => owns(actors.find(actor => actor.id === id)))) throw new Error("You need to own a crow in the traveling party to vote.");
      if (!TRAVEL_PACES.includes(request.pace)) throw new Error("Choose a travel pace.");
      state.votes[user.id] = request.pace;
      break;
    }
    case "pace":
      requireGM();
      if (!TRAVEL_PACES.includes(request.pace)) throw new Error("Choose a travel pace.");
      state.pace = request.pace;
      for (const [field, value] of Object.entries({ hexes: {slow:1,normal:2,fast:3}[request.pace], travelEN: {slow:8,normal:7,fast:6}[request.pace], restEN: {slow:8,normal:7,fast:6}[request.pace] })) {
        if (!state.adjusted[field] && state[field] == null) state[field] = value;
        else if (!state.adjusted[field] && current.pace) state[field] = value;
      }
      break;
    case "en":
      requireGM();
      if (!Number.isInteger(request.en) || request.en < 1 || request.en > 10) throw new Error("EN must be a whole number from 1 to 10.");
      state.travelEN = request.en;
      state.adjusted.travelEN = true;
      break;
    case "role": {
      if (state.step !== "roles" && !gm) throw new Error("Role selection is closed. Ask the Ref to reopen it.");
      const actor = actors.find(actor => actor.id === request.actorId) ?? (Object.hasOwn(state.guests, request.actorId) ? { id: request.actorId } : null);
      if (!state.roster.includes(request.actorId) || !owns(actor)) throw new Error("You can only assign a traveling crow you own.");
      if (request.role !== "" && !TRAVEL_ROLES.includes(request.role)) throw new Error("Choose a travel role.");
      const count = state.roster.filter(id => id !== actor.id && state.roles[id] === request.role).length;
      const limit = request.role === "guide" ? 1 : 3;
      if (!gm && request.role && count >= limit) throw new Error(request.role === "guide"
        ? "Someone else has the guide role. Choose another role or ask the Ref to reassign it."
        : "That role already has three travelers. Choose another role or ask the Ref.");
      // Ref assignments may exceed limits deliberately; the UI shows a non-blocking warning.
      if (request.role) state.roles[actor.id] = request.role;
      else delete state.roles[actor.id];
      break;
    }
    case "step":
      requireGM();
      if (!TRAVEL_STEPS.some(step => step.id === request.step)) throw new Error("Unknown travel step.");
      if (request.step !== "pace" && !state.pace) throw new Error("Choose the group's pace first; votes are advisory.");
      state.step = request.step;
      break;
    default: throw new Error("Unknown travel action.");
  }
  state.records = Object.fromEntries(Object.entries(state.records).filter(([id]) => state.roster.includes(id)));
  state.roles = Object.fromEntries(Object.entries(state.roles).filter(([id]) => state.roster.includes(id)));
  state.votes = Object.fromEntries(Object.entries(state.votes).filter(([id]) => {
    const voter = users.find(candidate => candidate.id === id);
    return voter && state.roster.some(actorId => {
      const actor = actors.find(candidate => candidate.id === actorId);
      return actor && (voter.isGM || actor.testUserPermission(voter, "OWNER"));
    });
  }));
  return state;
}
