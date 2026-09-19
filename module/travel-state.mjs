/** Travel coordination only. Task descriptions and outcomes belong to imported content. */
export const TRAVEL_ROLES = ["supporter", "guide", "scout", "tracker"];
export const TRAVEL_PACES = ["slow", "normal", "fast"];
export const TRAVEL_STEPS = [
  { id: "pace", label: "Choose pace", hint: "Players vote; the Ref chooses the group's pace." },
  { id: "roles", label: "Choose roles", hint: "Choose roles, then resolve tests: supporters, guide, scouts, trackers. Use your imported rules for tasks and outcomes." },
  { id: "travel", label: "Travel & encounters", hint: "Resolve the journey and any travel encounters." },
  { id: "explore", label: "Explore destinations", hint: "Explore any points of interest or destinations using dungeon turns, or skip ahead." },
  { id: "rest", label: "Camp & rest", hint: "Resolve rest encounters, supplies, rest activities, and recovery on the character sheets." },
  { id: "miasma", label: "Resolve Miasma", hint: "Resolve resistance and effects where applicable, then finish the day." },
  { id: "complete", label: "Day complete", hint: "Start the next day when ready. Your party selection is remembered." }
];

export function initialTravelState() {
  return { session: null, day: 0, step: "pace", roster: null, pace: null, votes: {}, roles: {} };
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
  const state = structuredClone(current);
  const gm = user.isGM;
  const requireGM = () => { if (!gm) throw new Error("Only the Ref can change the travel procedure."); };
  if (!request || typeof request.action !== "string") throw new Error("Invalid travel request.");
  if (request.session !== state.session) throw new Error("The travel day changed. Use the refreshed window.");
  if (request.action === "start") {
    requireGM();
    if (state.session && state.step !== "complete") throw new Error("A travel day is already underway. Resume it first.");
    const roster = (state.roster ?? actors.filter(actor => actor.type === "crow").map(actor => actor.id))
      .filter(id => actors.some(actor => actor.id === id && actor.type === "crow"));
    return { ...initialTravelState(), session: sessionId, day: state.day + 1, roster };
  }
  if (!state.session && request.action !== "roster") throw new Error("The Ref needs to start a travel day first.");
  // Deleted actors and removed participants must not keep occupying a role.
  state.roster = (state.roster ?? actors.filter(actor => actor.type === "crow").map(actor => actor.id))
    .filter(id => actors.some(actor => actor.id === id && actor.type === "crow"));
  const owns = actor => actor && (gm || actor.testUserPermission(user, "OWNER"));
  switch (request.action) {
    case "cancel":
      requireGM();
      return { ...initialTravelState(), roster: state.roster,
        day: state.step === "complete" ? state.day : Math.max(0, state.day - 1) };
    case "roster": {
      requireGM();
      const actor = actors.find(actor => actor.id === request.actorId && actor.type === "crow");
      if (!actor) throw new Error("That crow is no longer available.");
      if (request.included === true && !state.roster.includes(actor.id)) state.roster.push(actor.id);
      if (request.included === false) state.roster = state.roster.filter(id => id !== actor.id);
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
      break;
    case "role": {
      if (state.step !== "roles" && !gm) throw new Error("Role selection is closed. Ask the Ref to reopen it.");
      const actor = actors.find(actor => actor.id === request.actorId);
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
