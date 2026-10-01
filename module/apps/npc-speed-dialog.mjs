import { npcMovement, formatNpcSpeed, validateNpcMovement } from "../npc-speeds.mjs";

const escape = value => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);
const row = (mode = { name: "", value: 0 }) => `
  <div class="npc-speed-row">
    <input type="text" data-speed-name value="${escape(mode.name)}" placeholder="Fly, Swim, Climb…" aria-label="Movement type" />
    <input type="number" data-speed-value min="0" step="1" value="${mode.value}" aria-label="Movement speed" />
    <button type="button" data-remove-speed title="Remove speed" aria-label="Remove speed"><i class="fas fa-trash"></i></button>
  </div>`;

export function showNpcSpeedDialog(actor) {
  if (!actor.isOwner) return;
  const movement = npcMovement(actor.system);
  const dialog = new Dialog({
    title: `${actor.name}: Edit Speeds`,
    content: `<form class="crows-dialog-form npc-speed-editor">
      <div class="form-group"><label>Base speed</label><input type="number" data-base-speed min="0" step="1" value="${movement.base}" /></div>
      <h3>Additional speeds</h3>
      <div data-speed-rows>${movement.modes.map(row).join("")}</div>
      <button type="button" data-add-speed><i class="fas fa-plus"></i> Add Speed Type</button>
      <label>Movement notes<textarea data-speed-notes placeholder="Special movement rules or preserved import text">${escape(movement.notes)}</textarea></label>
      <p>Enter speeds before wounds. Each occupied wounded slot reduces every speed by 1, to a minimum of 0.</p>
      <p data-speed-error role="alert" hidden></p>
      <button type="button" data-save-speeds>Save Speeds</button>
    </form>`,
    buttons: { cancel: { label: "Cancel" } },
    render: html => {
      html.find('[data-add-speed]').on('click', () => html.find('[data-speed-rows]').append(row()));
      html.on('click', '[data-remove-speed]', event => event.currentTarget.closest('.npc-speed-row').remove());
      html.find('[data-save-speeds]').on('click', async event => {
        if (!actor.isOwner) return;
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const number = input => input.value.trim() === "" ? NaN : Number(input.value);
          const updated = validateNpcMovement({
            base: number(html.find('[data-base-speed]')[0]),
            modes: [...html.find('.npc-speed-row')].map(element => ({
              name: element.querySelector('[data-speed-name]').value.trim(),
              value: number(element.querySelector('[data-speed-value]'))
            })),
            notes: html.find('[data-speed-notes]').val().trim()
          });
          await actor.update({ "system.movement": updated, "system.speed": formatNpcSpeed({ movement: updated }) });
          await dialog.close();
        } catch (error) {
          html.find('[data-speed-error]').text(error.message).prop('hidden', false);
        } finally { button.disabled = false; }
      });
    }
  }, { width: 460, classes: ["crows", "dialog", "crows-dialog"] });
  return dialog.render(true);
}
