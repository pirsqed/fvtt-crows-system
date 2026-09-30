import { activeDefense, woundCapacity } from "../equipment-rules.mjs";
import { calculateDamage } from "../damage.mjs";
import { damageSnapshot } from "../chat-state.mjs";
import { CrowsChatActions } from "../chat-actions.mjs";

/** Presentation only; allocation and writes are shared with other entry points. */
export async function openDamageAllocationDialog(initialDamage = 1, { commit } = {}) {
    const isCrow = this.type === "crow";
    const hasWounds = woundCapacity(this) > 0;
    const system = this.system;
    let initialDmg = Math.max(1, parseInt(initialDamage, 10) || 1);

    // Collect available active AD items
    let orderedItemSources = [];
    for (const item of this.items) {
      if (item.system?.isArmor) {
        const isEquipped = item.system.isEquipped !== false;
        const loc = item.system.location || "backpack1";
        const isStowed = loc === "ground" || loc === "stash";
        const currentAD = Number(item.system.armor?.defense) || 0;
        const maxAD = Number(item.system.armor?.maxDefense) || currentAD;
        const isActive = activeDefense(item);

        orderedItemSources.push({
          id: item.id,
          name: item.name,
          ad: currentAD,
          maxAD: maxAD,
          active: isActive,
          enabled: isActive && currentAD > 0
        });
      }
    }

    let useTempAD = (Number(system.tempAD) || 0) > 0;

    let snapshot;
    const renderDialogContent = () => {
      snapshot = damageSnapshot(this);
      orderedItemSources = orderedItemSources.filter(source => this.items.get(source.id)).map(source => {
        const item = this.items.get(source.id);
        return { ...source, ad: Number(item.system.armor?.defense) || 0,
          maxAD: Number(item.system.armor?.maxDefense) || 0, active: activeDefense(item) };
      });
      const curTempAD = Number(this.system?.tempAD) || 0;
      const curStamina = Number(this.system?.stamina?.value) ?? 10;
      const maxStamina = Number(this.system?.stamina?.max) ?? 10;
      const totalAD = this.system?.totalAD || 0;
      const totalWounds = this.system?.totalWounds || 0;

      let sourcesListHtml = "";
      if (orderedItemSources.length === 0 && curTempAD === 0) {
        sourcesListHtml = `<div class="ad-empty-msg"><em>No active AD sources available (no equipped armor, shields, or weapons with AD). Damage will apply directly to Stamina.</em></div>`;
      } else {
        sourcesListHtml = orderedItemSources.map((s, idx) => {
          return `
            <div class="ad-source-row flexrow ${s.enabled ? 'active' : 'inactive'}" data-item-id="${s.id}" data-index="${idx}">
              <div class="ad-order-controls flexcol">
                <button type="button" class="btn-reorder btn-move-up" data-index="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move Up (Absorb earlier)">▲</button>
                <button type="button" class="btn-reorder btn-move-down" data-index="${idx}" ${idx === orderedItemSources.length - 1 ? 'disabled' : ''} title="Move Down (Absorb later)">▼</button>
              </div>
              <label class="toggle-source-chk-lbl" title="Include/Exclude this item from absorbing damage">
                <input type="checkbox" class="chk-toggle-source" data-index="${idx}" ${s.enabled ? 'checked' : ''} ${s.active ? "" : "disabled"} />
              </label>
              <div class="ad-source-main flexcol">
                <div class="ad-source-title flexrow">
                  <strong>${s.name}</strong>
                  <span class="badge armor ${s.active ? 'worn' : 'stowed'}">${s.active ? 'Equipped' : 'Stowed'}</span>
                </div>
                <div class="ad-source-bar-wrapper flexrow">
                  <span class="ad-source-val">AD: <strong>${s.ad}</strong> / ${s.maxAD}</span>
                  <div class="ad-meter"><div class="ad-meter-fill" style="width: ${s.maxAD > 0 ? (s.ad / s.maxAD) * 100 : 0}%"></div></div>
                </div>
              </div>
              <div class="ad-single-repair-box">
                <button type="button" class="btn-repair-single-modal" data-item-id="${s.id}" title="Restore this item to full (${s.maxAD} AD)">
                  <i class="fas fa-hammer"></i> Full Repair
                </button>
              </div>
            </div>
          `;
        }).join("");
      }

      return `
        <form class="crows-dialog-form ad-manager-dialog flexcol">
          <div class="ad-manager-header flexrow">
            <div class="ad-stat-box flexcol">
              <span class="stat-lbl"><i class="fas fa-shield-alt"></i> Total Active AD</span>
              <span class="stat-num ad-total-display">${totalAD}</span>
            </div>
            <div class="ad-stat-box flexcol stamina">
              <span class="stat-lbl"><i class="fas fa-heart"></i> Stamina</span>
              <span class="stat-num">${curStamina} / ${maxStamina}</span>
            </div>
            ${hasWounds ? `
            <div class="ad-stat-box flexcol wounds ${totalWounds >= woundCapacity(this) - 2 ? 'critical' : ''}">
              <span class="stat-lbl"><i class="fas fa-skull"></i> Wounds</span>
              <span class="stat-num">${totalWounds} / ${woundCapacity(this)}</span>
            </div>
            ` : ''}
          </div>

          <!-- Reorderable AD Priority List -->
          <div class="ad-section-title flexrow">
            <h4><i class="fas fa-layer-group"></i> AD Absorption Priority (Use ▲ / ▼ to Reorder)</h4>
          </div>

          ${curTempAD > 0 ? `
          <div class="temp-ad-source-bar flexrow ${useTempAD ? 'active' : 'inactive'}">
            <label class="toggle-source-chk-lbl" title="Absorb with Temporary Magic AD first">
              <input type="checkbox" id="chk-use-temp-ad" ${useTempAD ? 'checked' : ''} />
            </label>
            <div class="flexcol" style="flex:1;">
              <div class="flexrow" style="justify-content:space-between; align-items:center;">
                <strong><i class="fas fa-sparkles"></i> Temporary / Magic AD</strong>
                <span class="badge temp">Temp AD: <b>${curTempAD}</b></span>
              </div>
            </div>
            <button type="button" class="btn-clear-temp-modal" title="Clear Temp AD"><i class="fas fa-times"></i> Clear</button>
          </div>
          ` : ''}

          <div class="ad-sources-list flexcol">
            ${sourcesListHtml}
          </div>

          <div class="temp-ad-setter flexrow" style="gap:6px; align-items:center; margin-top:4px; font-size:0.85rem;">
            <label><i class="fas fa-wand-magic-sparkles"></i> Set Temp Magic AD:</label>
            <input type="number" id="dialog-temp-ad-input" value="${curTempAD}" min="0" style="width:55px; text-align:center;" />
            <button type="button" id="dialog-save-temp-btn" class="btn-dialog-small"><i class="fas fa-save"></i> Set</button>
          </div>

          <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 8px 0;" />

          <!-- Damage Allocator Calculator -->
          <div class="damage-allocation-box flexcol">
            <div class="allocation-title flexrow">
              <h4><i class="fas fa-swords"></i> Allocate Incoming Damage</h4>
              <span class="alloc-hint">Temp AD ➔ Reordered AD Items ➔ Stamina ➔ Wounds</span>
            </div>
            
            <div class="alloc-input-row flexrow">
              <label for="incoming-dmg-val">Incoming Damage:</label>
              <input type="number" id="incoming-dmg-val" value="${initialDmg}" min="1" style="width: 75px; font-weight: bold; font-size: 1.15rem; text-align: center;" />
              <button type="button" id="btn-apply-damage-alloc" class="btn-danger-action">
                <i class="fas fa-shield-virus"></i> Absorb & Apply Damage
              </button>
            </div>

            <div id="damage-preview-breakdown" class="damage-preview-breakdown">
              <!-- Dynamic live calculation preview rendered here -->
            </div>
          </div>
        </form>
      `;
    };

    const dialog = new Dialog({
      title: `Armor Defense (AD) & Damage Allocation: ${this.name}`,
      content: renderDialogContent(),
      buttons: {
        restoreAll: {
          icon: '<i class="fas fa-hammer"></i>',
          label: "Repair All Items",
          callback: async () => {
            await this.repairAllArmor();
            ui.notifications.info(`Restored all ${this.name}'s items with AD to full!`);
            if (this.sheet) this.sheet.render(false);
          }
        },
        close: {
          label: "Close"
        }
      },
      default: "close",
      render: (html) => {
        const $html = html instanceof jQuery ? html : $(html);

        const calculateAllocation = () => calculateDamage({
          damageTotal: Math.max(0, parseInt($html.find("#incoming-dmg-val").val(), 10) || 0),
          tempAD: this.system.tempAD, useTempAD,
          stamina: this.system.stamina?.value, staminaMax: this.system.stamina?.max,
          sources: orderedItemSources, hasWounds
        });

        const updatePreviewUI = () => {
          const alloc = calculateAllocation();
          const lines = [];

          if (alloc.damageTotal <= 0) {
            $html.find("#damage-preview-breakdown").html(`<span class="preview-line">Enter damage amount above to preview absorption.</span>`);
            return;
          }

          for (const b of alloc.breakdown) {
            if (b.type === "temp") {
              lines.push(`<span class="preview-step"><i class="fas fa-sparkles"></i> Temp AD absorbs <b>${b.absorbed}</b> (remains ${b.remainingAD})</span>`);
            } else if (b.type === "item") {
              lines.push(`<span class="preview-step"><i class="fas fa-shield-alt"></i> ${b.source} absorbs <b>${b.absorbed}</b> (becomes ${b.remainingAD}/${b.maxAD})</span>`);
            } else if (b.type === "stamina") {
              lines.push(`<span class="preview-step danger"><i class="fas fa-heart-crack"></i> Stamina takes <b>${b.absorbed} damage</b> (${this.system.stamina.value} ➔ ${b.remainingAD})</span>`);
            } else if (b.type === "wounds") {
              if (hasWounds) {
                lines.push(`<span class="preview-step critical"><i class="fas fa-skull"></i> <b>${b.woundsCount} Excess Damage</b> inflicts <b>+${b.woundsCount} Backpack Wounds!</b></span>`);
              } else {
                lines.push(`<span class="preview-step critical"><i class="fas fa-skull"></i> <b>${b.woundsCount} Excess Damage</b> &bull; Target Defeated!</span>`);
              }
            }
          }

          if (alloc.staminaDamage === 0 && alloc.woundsCount === 0) {
            lines.push(`<span class="preview-step success"><i class="fas fa-check-circle"></i> All <b>${alloc.damageTotal} damage</b> completely absorbed by AD! (0 to Stamina)</span>`);
          }

          $html.find("#damage-preview-breakdown").html(lines.join(""));
        };

        const bindEvents = () => {
          $html.find("#incoming-dmg-val").on("input change", updatePreviewUI);

          // Temp AD toggle
          $html.find("#chk-use-temp-ad").change((ev) => {
            useTempAD = $(ev.currentTarget).is(":checked");
            updatePreviewUI();
          });

          // Source toggle
          $html.find(".chk-toggle-source").change((ev) => {
            const idx = parseInt($(ev.currentTarget).data("index"), 10);
            if (orderedItemSources[idx]) {
              orderedItemSources[idx].enabled = $(ev.currentTarget).is(":checked");
              const row = $html.find(`.ad-source-row[data-index="${idx}"]`);
              row.toggleClass("active", orderedItemSources[idx].enabled);
              row.toggleClass("inactive", !orderedItemSources[idx].enabled);
              updatePreviewUI();
            }
          });

          // Move Up
          $html.find(".btn-move-up").click((ev) => {
            ev.preventDefault();
            const idx = parseInt($(ev.currentTarget).data("index"), 10);
            if (idx > 0) {
              const temp = orderedItemSources[idx];
              orderedItemSources[idx] = orderedItemSources[idx - 1];
              orderedItemSources[idx - 1] = temp;
              initialDmg = parseInt($html.find("#incoming-dmg-val").val(), 10) || 1;
              $html.find(".ad-manager-dialog").replaceWith(renderDialogContent());
              bindEvents();
              updatePreviewUI();
            }
          });

          // Move Down
          $html.find(".btn-move-down").click((ev) => {
            ev.preventDefault();
            const idx = parseInt($(ev.currentTarget).data("index"), 10);
            if (idx < orderedItemSources.length - 1) {
              const temp = orderedItemSources[idx];
              orderedItemSources[idx] = orderedItemSources[idx + 1];
              orderedItemSources[idx + 1] = temp;
              initialDmg = parseInt($html.find("#incoming-dmg-val").val(), 10) || 1;
              $html.find(".ad-manager-dialog").replaceWith(renderDialogContent());
              bindEvents();
              updatePreviewUI();
            }
          });

          // Single Item Repair
          $html.find(".btn-repair-single-modal").click(async (ev) => {
            ev.preventDefault();
            const itemId = $(ev.currentTarget).data("itemId");
            await this.repairArmor(itemId);
            ui.notifications.info("Repaired item to full AD.");
            const itemObj = orderedItemSources.find(i => i.id === itemId);
            if (itemObj) {
              itemObj.ad = itemObj.maxAD;
              itemObj.enabled = true;
            }
            $html.find(".ad-manager-dialog").replaceWith(renderDialogContent());
            bindEvents();
            updatePreviewUI();
          });

          // Set Temp AD
          $html.find("#dialog-save-temp-btn").click(async (ev) => {
            ev.preventDefault();
            const val = parseInt($html.find("#dialog-temp-ad-input").val(), 10) || 0;
            await this.update({ "system.tempAD": Math.max(0, val) });
            useTempAD = val > 0;
            ui.notifications.info(`Set Temporary Magic AD to ${val}.`);
            $html.find(".ad-manager-dialog").replaceWith(renderDialogContent());
            bindEvents();
            updatePreviewUI();
          });

          // Clear Temp AD
          $html.find(".btn-clear-temp-modal").click(async (ev) => {
            ev.preventDefault();
            await this.update({ "system.tempAD": 0 });
            useTempAD = false;
            ui.notifications.info("Cleared Temporary Magic AD.");
            $html.find(".ad-manager-dialog").replaceWith(renderDialogContent());
            bindEvents();
            updatePreviewUI();
          });

          // Absorb & Apply Damage
          $html.find("#btn-apply-damage-alloc").click(async (ev) => {
            ev.preventDefault();
            const alloc = calculateAllocation();
            if (alloc.damageTotal <= 0) return;

            const button = ev.currentTarget;
            if (button.disabled) return;
            button.disabled = true;
            let result;
            try { result = await (commit ? commit(alloc) : CrowsChatActions.request({ action: "allocate-damage", actorUuid: this.uuid, snapshot, allocation: alloc })); }
            catch (err) { button.disabled = false; ui.notifications.warn(err.message); return; }
            if (!result) { button.disabled = false; return; }

            let breakdownHtml = result.breakdown.map(b => {
              if (b.type === "wounds") {
                return `
                  <div class="alloc-row" style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:0.85rem; color:#fca5a5;">
                    <span><strong><i class="fas fa-skull"></i> ${b.source}:</strong> +${b.woundsCount} Wounds</span>
                    <span>${result.woundedSlotNames?.length ? result.woundedSlotNames.join(", ") : ""}</span>
                  </div>
                `;
              }
              return `
                <div class="alloc-row" style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:0.85rem;">
                  <span><strong>${b.source}:</strong> Absorbed <b>${b.absorbed}</b></span>
                  <span style="color:#94a3b8;">Remaining: ${b.remainingAD}${b.maxAD !== undefined ? `/${b.maxAD}` : ''}</span>
                </div>
              `;
            }).join("");

            let outcomeClass = "success";
            let outcomeText = `<i class="fas fa-shield-alt"></i> All damage fully absorbed by AD!`;
            if (result.woundsCount > 0) {
              outcomeClass = "failure";
              outcomeText = `<i class="fas fa-skull"></i> Stamina Broken! Took ${result.woundsCount} Wound(s) (${result.woundedSlotNames.join(", ")})`;
            } else if (result.staminaDamage > 0) {
              outcomeClass = "failure";
              outcomeText = `<i class="fas fa-heart-crack"></i> ${result.staminaDamage} damage punched through to Stamina!`;
            }

            let cardHtml = "";
            if (isCrow) {
              // Detailed breakdown for player characters (Crows)
              cardHtml = `
                <div class="crows-roll-card damage-card">
                  <div class="card-header danger">
                    <i class="fas fa-shield-virus"></i> Damage Absorbed (${alloc.damageTotal} Total Damage)
                  </div>
                  <div class="card-body">
                    <div style="margin-bottom:8px;">
                      <strong>${this.name}</strong> took <strong>${alloc.damageTotal} damage</strong>:
                    </div>
                    <div style="background:rgba(0,0,0,0.35); padding:8px; border-radius:4px; border:1px solid rgba(255,255,255,0.08); margin-bottom:8px;">
                      ${breakdownHtml}
                    </div>
                    <div class="outcome ${outcomeClass}">
                      ${outcomeText}
                    </div>
                  </div>
                </div>
              `;
            } else {
              // Minimal card for monsters to prevent stat and death spoilers for players
              cardHtml = `
                <div class="crows-roll-card damage-card">
                  <div class="card-header danger">
                    <i class="fas fa-shield-virus"></i> Damage Dealt
                  </div>
                  <div class="card-body">
                    <div style="font-size: 1.05rem; margin-bottom: 2px;">
                      <strong>${this.name}</strong> took <span style="color:#f87171; font-weight: bold;">${alloc.damageTotal} damage</span>.
                    </div>
                  </div>
                </div>
              `;
            }

            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: this }),
              flavor: `Damage on ${this.name}`,
              content: cardHtml
            });

            // If it's a monster, whisper internal stamina & defeat status to GMs only
            if (!isCrow) {
              const gmUsers = game.users.filter(u => u.isGM).map(u => u.id);
              if (gmUsers.length > 0) {
                const curStam = Number(this.system?.stamina?.value) ?? 0;
                const maxStam = Number(this.system?.stamina?.max) ?? 10;
                const isDefeated = hasWounds ? this.system.isDead : curStam <= 0;
                const gmContent = `
                  <div style="font-size: 0.85rem; color: #cbd5e1; background: rgba(15, 23, 42, 0.7); padding: 8px; border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.3);">
                    <div style="font-weight: bold; margin-bottom: 4px;"><i class="fas fa-eye"></i> [GM Info] ${this.name}</div>
                    <div>Took <strong>${alloc.damageTotal} damage</strong> &bull; Remaining Stamina: <b>${curStam} / ${maxStam}</b></div>
                    ${isDefeated ? `<div style="color: #ef4444; font-weight: bold; margin-top: 4px;"><i class="fas fa-skull"></i> ${hasWounds ? "All inventory slots wounded" : "Stamina reached 0"} (${this.name} defeated / dead)!</div>` : ''}
                  </div>
                `;
                await ChatMessage.create({
                  whisper: gmUsers,
                  speaker: ChatMessage.getSpeaker({ actor: this }),
                  flavor: `GM Damage Log: ${this.name}`,
                  content: gmContent
                });
              }
            }

            dialog.close();
            if (this.sheet) this.sheet.render(false);
          });
        };

        bindEvents();
        updatePreviewUI();
      }
    }, { width: 540, classes: ["crows", "dialog", "crows-dialog", "ad-manager"] });

    dialog.render(true);
  }
