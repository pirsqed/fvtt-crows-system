export const MIASMA_EFFECTS_TABLE = [
  {
    min: 1, max: 2,
    title: "Despondent",
    firstEffect: "You become despondent. You only speak if spoken to first and give one-word responses until you exit the Miasma.",
    secondEffect: "You have an edge on tests made to sneak or hide."
  },
  {
    min: 3, max: 4,
    title: "Ravenous and Greedy",
    firstEffect: "You become ravenous and greedy. You must eat at least 2 rations during a rest to get the benefits of a rest until you are out of the Miasma.",
    secondEffect: "Your ravenous nature makes you good at finding food. You gain a +2 bonus on tests made related to the forage role."
  },
  {
    min: 5, max: 6,
    title: "Destructive Rage",
    firstEffect: "You enter a destructive rage and destroy one mundane item randomly chosen by the Ref from your backpack.",
    secondEffect: "Destroying something makes you feel good. You regain 3 Stamina or, if your Stamina is full, lose 1 wound."
  },
  {
    min: 7, max: 8,
    title: "Deceitful",
    firstEffect: "You become deceitful for the sake of it. You only communicate in lies and try to get away with it until you are out of the Miasma.",
    secondEffect: "You lie even to yourself. Choose an expertise you do not have. You gain that expertise."
  },
  {
    min: 9, max: 10,
    title: "Lazy",
    firstEffect: "You become lazy. You refuse to have any travel role until you are out of the Miasma.",
    secondEffect: "When you rest, you recover 2 wounds instead of 1."
  },
  {
    min: 11, max: 12,
    title: "Relish Violence",
    firstEffect: "You relish violence. In combat, you must keep pursuing and fighting your foes until you can no longer sense them. This effect ends when you no longer have cruelty.",
    secondEffect: "Your relish in violence gives you a +1 damage bonus on weapon attacks."
  },
  {
    min: 13, max: 999,
    title: "Full Corruption (NPC)",
    firstEffect: "All of your other Miasma effects end and all your levels of cruelty disappear. You can't suffer any new Miasma effects and are permanently selfish and cruel. You become an NPC controlled by the Ref.",
    secondEffect: "Finishing a rest in the Miasma regains the uses of your expertises."
  }
];

/** Callable from sheets, chat, or macros without a sheet instance. */
export async function rollMiasmaEffect(actor) {
    const cruelty = Number(actor.system.cruelty) || 0;
    const formula = `1d10 + ${cruelty}`;
    const roll = new Roll(formula);
    await roll.evaluate();

    const total = roll.total;
    let matched = MIASMA_EFFECTS_TABLE.find(entry => total >= entry.min && total <= entry.max);
    if (!matched) matched = MIASMA_EFFECTS_TABLE[MIASMA_EFFECTS_TABLE.length - 1];

    const isFullCorruption = total >= 13;

    const cardHtml = `
      <div class="crows-item-card miasma-effect-card" style="background: linear-gradient(135deg, #1e112a 0%, #100a18 100%); border: 1px solid rgba(168, 85, 247, 0.45); border-radius: 6px; padding: 10px 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);">
        <div class="card-header flexrow" style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(168, 85, 247, 0.3); padding-bottom:6px; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <i class="fas fa-skull-crossbones" style="color:#c084fc; font-size:1.2rem;"></i>
            <div>
              <h3 style="margin:0; font-size:1.05rem; font-weight:700; color:#f3e8ff;">Miasma Effect: ${matched.title}</h3>
              <div style="font-size:0.75rem; color:#d8b4fe;">Roll: <strong>${total}</strong> <span style="opacity:0.8;">(1d10 + ${cruelty} Cruelty)</span></div>
            </div>
          </div>
          <span class="badge" style="background:${isFullCorruption ? '#7f1d1d' : '#581c87'}; color:#f3e8ff; border:1px solid ${isFullCorruption ? '#ef4444' : '#9333ea'};">
            ${isFullCorruption ? 'CORRUPTED' : 'Miasma Roll'}
          </span>
        </div>
        <div class="miasma-effects-body" style="font-size:0.85rem; line-height:1.45; color:#e2e8f0; display:flex; flex-direction:column; gap:8px;">
          <div class="effect-box primary-effect" style="background:rgba(0,0,0,0.3); border-left:3px solid #c084fc; padding:6px 10px; border-radius:0 4px 4px 0;">
            <strong style="color:#e9d5ff;"><i class="fas fa-exclamation-triangle"></i> 1st Effect:</strong>
            <p style="margin:4px 0 0 0;">${matched.firstEffect}</p>
          </div>
          <div class="effect-box secondary-effect" style="background:rgba(0,0,0,0.3); border-left:3px solid #38bdf8; padding:6px 10px; border-radius:0 4px 4px 0;">
            <strong style="color:#bae6fd;"><i class="fas fa-shield-alt"></i> 2nd Effect:</strong>
            <p style="margin:4px 0 0 0;">${matched.secondEffect}</p>
          </div>
        </div>
        ${!isFullCorruption ? `
          <div class="crows-chat-actions" style="margin-top: 10px;">
            <button type="button" class="crows-miasma-apply-effect-btn" data-actor-id="${actor.id}" data-roll="${total}" data-title="${matched.title}" data-first="${encodeURIComponent(matched.firstEffect)}" data-second="${encodeURIComponent(matched.secondEffect)}" style="background: linear-gradient(135deg, #7e22ce, #6b21a8); border: 1px solid #a855f7; color: #f3e8ff; width: 100%; padding: 6px; border-radius: 4px; font-weight: 700; cursor: pointer;">
              <i class="fas fa-plus-circle"></i> Add Effect to Character Sheet
            </button>
          </div>
        ` : `
          <div style="margin-top:8px; padding:6px 10px; background:rgba(220,38,38,0.2); border:1px solid #dc2626; border-radius:4px; font-size:0.8rem; color:#fca5a5; text-align:center;">
            <strong>Critical Soul Corruption:</strong> This Crow becomes an NPC controlled by the Ref!
          </div>
        `}
      </div>
    `;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      flavor: `${actor.name} rolled on the Miasma Effects table`,
      content: cardHtml
    });
}
