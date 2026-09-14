/** Shared attack-style circumstance controls for every power and resistance roll. */
export function renderCircumstanceSelector() {
  return `<div class="form-group circumstance-group">
    <label class="group-label"><i class="fas fa-balance-scale"></i> Circumstance</label>
    <div class="radio-list">
      ${[
        ["double-edge", "Double Edge", "+1 Outcome Tier"],
        ["edge", "Edge", "+2 to roll"],
        ["standard", "Standard Roll", "Normal (2d10)"],
        ["bane", "Bane", "-2 to roll"],
        ["double-bane", "Double Bane", "-1 Outcome Tier"]
      ].map(([value, title, description]) => `<label class="radio-option opt-${value}">
        <input type="radio" name="circumstance" value="${value}"${value === "standard" ? " checked" : ""} />
        <span class="opt-title">${title}</span>
        <span class="opt-desc">${description}</span>
      </label>`).join("")}
    </div>
  </div>`;
}
