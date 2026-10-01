const SCOPE = "fvtt-crows-system";
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const lines = value => escape(value).replace(/\r?\n/g, "<br>");
const signed = value => `${Number(value ?? 0) >= 0 ? "+" : ""}${Number(value ?? 0)}`;
const display = value => value == null ? "Not recorded" : escape(value);

/** The same escaped HTML is used in the preview and saved journal page. */
export function travelJournalHTML(state, actors = []) {
  const party = (state.roster ?? []).map(id => ({id, name: actors.find(actor => actor.id === id)?.name ?? state.guests?.[id] ?? "Unavailable traveler"}))
    .sort((a,b) => a.name.localeCompare(b.name, undefined, {sensitivity:"base",numeric:true}));
  const totals = [["Hex allowance", "hexes"], ["Travel EN", "travelEN"], ["Rest EN", "restEN"]];
  const base = {slow:{hexes:1,travelEN:8,restEN:8},normal:{hexes:2,travelEN:7,restEN:7},fast:{hexes:3,travelEN:6,restEN:6}}[state.pace];
  const rows = party.map(({id,name}) => {
    const record = state.records?.[id] ?? {};
    return `<tr><td>${escape(name)}</td><td>${escape(state.roles?.[id] ?? "Unassigned / assisting")}</td><td>${signed(record.hexes)}</td><td>${signed(record.travelEN)}</td><td>${signed(record.restEN)}</td><td>${lines(record.result) || "—"}</td></tr>`;
  }).join("");
  const outcomes = party.filter(({id}) => state.records?.[id]?.notes).map(({id,name}) => `<p><strong>${escape(name)}:</strong> ${lines(state.records[id].notes)}</p>`).join("");
  const checks = (state.encounters ?? []).map(check => `<li><strong>${escape(check.kind ?? "Encounter")} check</strong> — EN ${display(check.en)}; result: ${lines(check.result) || "Not recorded"}${check.notes ? `<br>${lines(check.notes)}` : ""}</li>`).join("");
  return `<h2>Travel day ${escape(state.day)}</h2>
<p><strong>Pace:</strong> ${escape(state.pace ?? "Not recorded")} · <strong>Position:</strong> ${state.lost ? "Lost" : "On track"}</p>
<table><thead><tr><th>Measure</th><th>Pace base</th><th>Role changes</th><th>Other adjustments</th><th>Final</th></tr></thead><tbody>${totals.map(([label,field]) => {
    const roleTotal = party.reduce((sum,{id}) => sum + Number(state.records?.[id]?.[field] ?? 0), 0);
    const other = base && state[field] != null ? signed(state[field] - base[field] - roleTotal) : "—";
    return `<tr><td>${label}</td><td>${display(base?.[field])}</td><td>${signed(roleTotal)}</td><td>${other}</td><td>${display(state[field])}</td></tr>`;
  }).join("")}</tbody></table>
<p><em>Hex allowance is the recorded travel budget, not a measurement of distance actually traveled. Other adjustments are the difference between the final total, pace base, and recorded role changes.</em></p>
<h3>Travelers & roles</h3>${rows ? `<table><thead><tr><th>Traveler</th><th>Role</th><th>Hexes</th><th>Travel EN</th><th>Rest EN</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No travelers recorded.</p>"}
${outcomes ? `<h3>Role outcomes</h3>${outcomes}` : ""}
<h3>Encounter checks</h3>${checks ? `<ul>${checks}</ul>` : "<p>No encounter checks recorded.</p>"}
<h3>Notes</h3><p data-journal-preview-notes>${lines(state.notes) || "No additional notes."}</p>`;
}

export function travelJournalOwnership(users, audience) {
  // Owner (3) permits editing; Observer (2) keeps the journal readable to everyone.
  const ownership = {default: audience === "trusted" ? 2 : 3};
  if (audience === "trusted") for (const user of users) ownership[user.id] = user.isGM || user.role >= 2 ? 3 : 2;
  return ownership;
}

export function journeyJournalHTML(journey = {}) {
  return `<h1>${escape(journey.title || "Travel Journal")}</h1>
<p><strong>Starting location:</strong> ${lines(journey.origin) || "Not recorded"}</p>
<h2>Goals</h2><p>${lines(journey.goals) || "Not recorded"}</p>
<h2>Journey notes</h2><p>${lines(journey.notes) || "No additional notes."}</p>`;
}

function journals() { return game.journal.contents.filter(entry => entry.getFlag(SCOPE, "travelJournal") === true); }
function ownership() { return travelJournalOwnership(game.users.contents, game.settings.get(SCOPE, "travelJournalAudience")); }

export async function refreshTravelJournalAccess() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  for (const entry of journals()) await entry.update({ownership:ownership()}, {diff:false,recursive:false});
}

export async function saveTravelJournalDay(state) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) throw new Error("Only the active Ref can save the travel journal.");
  if (!state.session || state.step !== "complete") throw new Error("Complete the day before saving its journal entry.");
  const journeyId = state.journeyId ?? "legacy";
  let entry = journals().find(entry => (entry.getFlag(SCOPE,"travelJourney") ?? "legacy") === journeyId);
  if (!entry) entry = await JournalEntry.create({name:state.journey?.title || "Travel Journal", ownership:ownership(), flags:{[SCOPE]:{travelJournal:true, travelJourney:journeyId}}});
  else await entry.update({ownership:ownership()}, {diff:false,recursive:false});
  if (journeyId !== "legacy" && !entry.pages.contents.some(page => page.getFlag(SCOPE,"travelOverview"))) {
    await entry.createEmbeddedDocuments("JournalEntryPage",[{name:"Journey",type:"text",sort:0,
      text:{content:journeyJournalHTML(state.journey),format:1},ownership:{default:-1},flags:{[SCOPE]:{travelOverview:true}}}]);
  }
  // Once saved, pages belong to the players. Retrying or saving later days must
  // not overwrite their journal edits, even if the travel-state write failed.
  const existing = entry.pages.contents.find(page => page.getFlag(SCOPE,"travelSession") === state.session);
  if (!existing) {
    const pageData = {name:`Day ${state.day}`, type:"text", text:{content:travelJournalHTML(state,game.actors.contents),format:1}, ownership:{default:-1}, flags:{[SCOPE]:{travelSession:state.session}}};
    await entry.createEmbeddedDocuments("JournalEntryPage",[{...pageData,sort:(Math.max(0,...entry.pages.contents.map(page => page.sort ?? 0))+100000)}]);
  }
  return entry;
}
