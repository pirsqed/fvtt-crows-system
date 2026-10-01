/** Interpret legacy text without changing the actor until the editor is saved. */
export function npcMovement(system) {
  if (system.movement) return structuredClone(system.movement);
  const result = { base: 0, modes: [], notes: "" };
  const notes = [];
  let baseFound = false;
  for (const part of String(system.speed ?? "5").split(/[,;]+/).map(s => s.trim()).filter(Boolean)) {
    const base = /^(\d+)(?:\s+(.*))?$/.exec(part);
    const mode = /^([\p{L}][\p{L} -]*?)\s+(\d+)(?:\s+(.*))?$/u.exec(part);
    if (base && !baseFound) {
      result.base = Number(base[1]);
      baseFound = true;
      if (base[2]) notes.push(`Base: ${base[2]}`);
    } else if (mode) {
      result.modes.push({ name: mode[1], value: Number(mode[2]) });
      if (mode[3]) notes.push(`${mode[1]}: ${mode[3]}`);
    } else notes.push(part);
  }
  result.notes = notes.join("; ");
  return result;
}

export function formatNpcSpeed(system, penalty = 0) {
  if (!system.movement) {
    // Preserve legacy prose until explicitly edited; adjust only speed values.
    return String(system.speed ?? "5").split(/([,;])/).map(part =>
      part.replace(/^(\s*(?:[\p{L}][\p{L} -]*?\s+)?)(\d+)/u,
        (_, prefix, value) => prefix + Math.max(0, Number(value) - penalty))).join("");
  }
  const { base, modes, notes } = system.movement;
  const current = value => Math.max(0, value - penalty);
  const text = [String(current(base)), ...modes.map(mode => `${mode.name} ${current(mode.value)}`)].join(" · ");
  return notes ? `${text} (${notes})` : text;
}

export function validateNpcMovement(movement) {
  const validSpeed = value => Number.isInteger(value) && value >= 0;
  if (!validSpeed(movement.base) || movement.modes.some(mode => !mode.name.trim() || !validSpeed(mode.value))) {
    throw new Error("Give each speed a non-negative whole number and each additional type a name.");
  }
  return movement;
}
