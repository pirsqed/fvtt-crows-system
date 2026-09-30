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
  // Observer (2) permits reading; Trusted Player is role 2 and above.
  const ownership = {default: audience === "trusted" ? 0 : 2};
  if (audience === "trusted") for (const user of users) ownership[user.id] = user.isGM ? 3 : user.role >= 2 ? 2 : 0;
  return ownership;
}

function journal() { return game.journal.contents.find(entry => entry.getFlag(SCOPE, "travelJournal") === true); }
function ownership() { return travelJournalOwnership(game.users.contents, game.settings.get(SCOPE, "travelJournalAudience")); }

export async function refreshTravelJournalAccess() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  const entry = journal();
  if (entry) await entry.update({ownership:ownership()}, {diff:false,recursive:false});
}

export async function saveTravelJournalDay(state) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) throw new Error("Only the active Ref can save the travel journal.");
  if (!state.session || state.step !== "complete") throw new Error("Complete the day before saving its journal entry.");
  let entry = journal();
  if (!entry) entry = await JournalEntry.create({name:"Travel Journal", ownership:ownership(), flags:{[SCOPE]:{travelJournal:true}}});
  else await entry.update({ownership:ownership()}, {diff:false,recursive:false});
  const pageData = {name:`Day ${state.day}`, type:"text", text:{content:travelJournalHTML(state,game.actors.contents),format:1}, ownership:{default:-1}, flags:{[SCOPE]:{travelSession:state.session}}};
  const existing = entry.pages.contents.find(page => page.getFlag(SCOPE,"travelSession") === state.session);
  // Retrying after a settings-write failure updates the same page instead of duplicating it.
  if (existing) await existing.update(pageData);
  else await entry.createEmbeddedDocuments("JournalEntryPage",[{...pageData,sort:(Math.max(0,...entry.pages.contents.map(page => page.sort ?? 0))+100000)}]);
  return entry;
}
