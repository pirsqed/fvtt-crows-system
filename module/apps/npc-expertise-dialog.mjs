import { EXPERTISES_CONFIG } from "../expertises.mjs";

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);
const choices = Object.values(EXPERTISES_CONFIG).flat();

export async function saveNpcExpertise(actor, id, draft) {
  if (!actor.isOwner) throw new Error("You cannot edit this NPC.");
  const entries = (actor.system.customExpertises ?? []).map(entry => ({ ...entry }));
  const index = entries.findIndex(entry => entry.id === id);
  if (id && index < 0) throw new Error("This expertise was removed. Close this editor and reopen the sheet.");
  if (draft === null) {
    if (index < 0) return;
    entries.splice(index, 1);
  } else {
    const name = draft.name.trim();
    if (!name || !Number.isInteger(draft.value) || !Number.isInteger(draft.max)
      || draft.value < 0 || draft.max < 0 || draft.value > draft.max) {
      throw new Error("Enter an expertise name and whole-number uses between zero and the maximum.");
    }
    const entry = { id: id || foundry.utils.randomID(), name, notes: draft.notes.trim(), value: draft.value, max: draft.max };
    if (index < 0) entries.push(entry);
    else entries[index] = entry;
  }
  return actor.update({ "system.customExpertises": entries });
}

export function showNpcExpertiseDialog(actor, id) {
  if (!actor.isOwner) return;
  const existing = actor.system.customExpertises?.find(entry => entry.id === id);
  if (id && !existing) return;
  const entry = existing ?? { name: "", notes: "", value: 1, max: 1 };
  const selected = choices.find(choice => choice.label.toLowerCase() === entry.name.toLowerCase());
  const custom = !!existing && !selected;
  const groups = { general: "General", spellcasting: "Spellcasting", weapon: "Weapon" };
  const options = Object.entries(EXPERTISES_CONFIG).map(([key, list]) => `<optgroup label="${groups[key]}">${list.map(choice =>
    `<option value="${choice.key}" ${choice.key === selected?.key ? "selected" : ""}>${escape(choice.label)}</option>`).join("")}</optgroup>`).join("");
  const dialog = new Dialog({
    title: `${actor.name}: ${existing ? "Edit" : "Add"} Expertise`,
    content: `<form class="crows-dialog-form npc-expertise-editor">
      <div class="form-group"><label>Expertise</label><select data-choice>
        <option value="" ${!existing ? "selected" : ""}>Choose an expertise…</option>${options}
        <option value="custom" ${custom ? "selected" : ""}>Custom…</option>
      </select></div>
      <div data-custom-row ${custom ? "" : "hidden"}><label>Custom expertise<input type="text" data-custom-name value="${custom ? escape(entry.name) : ""}" /></label></div>
      <p data-hint>${escape(selected?.hint)}</p>
      <div class="form-group"><label>Remaining uses</label><input type="number" data-value min="0" step="1" value="${entry.value}" /></div>
      <div class="form-group"><label>Maximum uses</label><input type="number" data-max min="0" step="1" value="${entry.max}" /></div>
      <div class="npc-expertise-use-actions"><button type="button" data-spend>Spend 1</button><button type="button" data-recover>Recover</button></div>
      <label>Notes<textarea data-notes>${escape(entry.notes)}</textarea></label>
      <p data-error role="alert" hidden></p>
      <div class="npc-expertise-use-actions"><button type="button" data-save>Save Expertise</button>${existing ? '<button type="button" data-delete>Delete Expertise</button>' : ''}</div>
    </form>`,
    buttons: { cancel: { label: "Cancel" } },
    render: html => {
      html.find('[data-choice]').on('change', () => {
        const key = html.find('[data-choice]').val();
        html.find('[data-custom-row]').prop('hidden', key !== "custom");
        html.find('[data-hint]').text(choices.find(choice => choice.key === key)?.hint ?? "");
      });
      const number = selector => {
        const value = html.find(selector).val();
        return value.trim() === "" ? NaN : Number(value);
      };
      html.find('[data-spend]').on('click', () => html.find('[data-value]').val(Math.max(0, number('[data-value]') - 1)));
      html.find('[data-recover]').on('click', () => html.find('[data-value]').val(number('[data-max]')));
      let saving = false;
      const commit = async remove => {
        if (saving) return;
        saving = true;
        try {
          const key = html.find('[data-choice]').val();
          await saveNpcExpertise(actor, id, remove ? null : {
            name: key === "custom" ? html.find('[data-custom-name]').val() : choices.find(choice => choice.key === key)?.label ?? "",
            value: number('[data-value]'), max: number('[data-max]'), notes: html.find('[data-notes]').val()
          });
          await dialog.close();
        } catch (error) { html.find('[data-error]').text(error.message).prop('hidden', false); }
        finally { saving = false; }
      };
      html.find('[data-save]').on('click', () => commit(false));
      html.find('[data-delete]').on('click', () => commit(true));
    }
  }, { width: 460, classes: ["crows", "dialog", "crows-dialog"] });
  return dialog.render(true);
}
