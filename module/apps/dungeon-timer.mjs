/**
 * CrowsDungeonTimer
 * An immersive, synchronized gothic hourglass HUD for tracking real-world Dungeon Turns (DT) in MCDM Crows.
 */
export class CrowsDungeonTimer extends Application {
  constructor(options = {}) {
    super(options);
    this._interval = null;
    this._isCollapsed = false;
    this._showSettings = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "crows-dungeon-timer-hud",
      classes: ["crows", "crows-hourglass-app"],
      template: "systems/fvtt-crows-system/templates/dungeon-timer.html",
      popOut: false,
      minimizable: false,
      resizable: false
    });
  }

  /**
   * Retrieves the current synchronized world timer state
   */
  static getState() {
    return game.settings.get("fvtt-crows-system", "dungeonTimerState") || {
      turn: 1,
      durationMinutes: 30,
      remainingSeconds: 1800,
      isRunning: false,
      en: 9,
      lastTick: Date.now()
    };
  }

  /**
   * Updates and broadcasts the synchronized timer state across all clients
   */
  static async updateState(updates) {
    if (!game.user.isGM) return;
    const current = CrowsDungeonTimer.getState();
    const merged = foundry.utils.mergeObject(current, updates);
    merged.lastTick = Date.now();
    await game.settings.set("fvtt-crows-system", "dungeonTimerState", merged);
  }

  async getData() {
    const state = CrowsDungeonTimer.getState();
    const durationTotal = (state.durationMinutes || 30) * 60;
    const remaining = Math.max(0, state.remainingSeconds ?? durationTotal);
    const progressPercent = Math.min(100, Math.max(0, ((durationTotal - remaining) / durationTotal) * 100));

    // Calculate Greed Bonus based on Playtest 2 rules (Page 13)
    let greedBonus = 0;
    if (state.turn === 1) greedBonus = 30;
    else if (state.turn === 2) greedBonus = 20;
    else if (state.turn === 3) greedBonus = 10;

    // Time formatting: MM:SS
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formattedTime = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    // SVG Hourglass Sand Calculations
    const topSandY = 25 + (progressPercent / 100) * 51;
    const bottomSandY = 135 - (progressPercent / 100) * 51;
    const hasBottomSand = progressPercent > 2;
    const bottomSandWidth = Math.min(26, 6 + (progressPercent / 100) * 20);

    // Urgent state if under 3 minutes (180s) or at 0
    const isUrgent = (remaining <= 180 && state.isRunning) || remaining === 0;

    return {
      isGM: game.user.isGM,
      turn: state.turn || 1,
      durationMinutes: state.durationMinutes || 30,
      remainingSeconds: remaining,
      formattedTime: formattedTime,
      progressPercent: progressPercent.toFixed(1),
      isRunning: !!state.isRunning,
      en: state.en || 9,
      greedBonus: greedBonus,
      isCollapsed: this._isCollapsed,
      showSettings: this._showSettings,
      isUrgent: isUrgent,
      topSandY: topSandY.toFixed(1),
      bottomSandY: bottomSandY.toFixed(1),
      hasBottomSand: hasBottomSand,
      bottomSandWidth: bottomSandWidth.toFixed(1)
    };
  }

  _injectHTML(html) {
    let container = document.getElementById("crows-dungeon-timer-layer");
    if (!container) {
      container = document.createElement("div");
      container.id = "crows-dungeon-timer-layer";
      document.body.appendChild(container);

      // Restore saved user position from localStorage if available
      try {
        const saved = JSON.parse(localStorage.getItem("crows-dungeon-timer-pos") || "null");
        if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
          container.style.left = `${saved.left}px`;
          container.style.top = `${saved.top}px`;
          container.style.bottom = "auto";
          container.style.right = "auto";
        }
      } catch (e) {}
    }
    container.innerHTML = "";
    container.appendChild(html[0]);
    this._element = html;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Make widget freely draggable across the screen by its header
    this._activateDraggable(html);

    // Collapse / Expand toggle
    html.find(".btn-collapse").click(ev => {
      ev.preventDefault();
      this._isCollapsed = !this._isCollapsed;
      this.render();
    });

    // Settings drawer toggle (GM only)
    html.find(".btn-settings").click(ev => {
      ev.preventDefault();
      this._showSettings = !this._showSettings;
      this.render();
    });

    if (!game.user.isGM) return;

    // GM: Play / Pause
    html.find(".btn-toggle-run").click(async ev => {
      ev.preventDefault();
      const state = CrowsDungeonTimer.getState();
      await CrowsDungeonTimer.updateState({ isRunning: !state.isRunning });
    });

    // GM: End Turn & Advance
    html.find(".btn-next-turn").click(async ev => {
      ev.preventDefault();
      await this.endTurn();
    });

    // GM: Reset Turn
    html.find(".btn-reset-turn").click(async ev => {
      ev.preventDefault();
      const state = CrowsDungeonTimer.getState();
      await CrowsDungeonTimer.updateState({
        remainingSeconds: (state.durationMinutes || 30) * 60,
        isRunning: false
      });
    });

    // GM: Manual Encounter Check
    html.find(".btn-roll-en").click(async ev => {
      ev.preventDefault();
      const state = CrowsDungeonTimer.getState();
      await game.crows.rollEncounterCheck(state.en || 9);
    });

    // GM: Settings - Duration Presets
    html.find(".btn-preset").click(async ev => {
      ev.preventDefault();
      const mins = parseInt(ev.currentTarget.dataset.minutes, 10) || 30;
      await CrowsDungeonTimer.updateState({
        durationMinutes: mins,
        remainingSeconds: mins * 60
      });
    });

    // GM: Settings - Encounter DC
    html.find(".btn-en").click(async ev => {
      ev.preventDefault();
      const en = parseInt(ev.currentTarget.dataset.en, 10) || 9;
      await CrowsDungeonTimer.updateState({ en: en });
    });

    // GM: Settings - Set Turn #
    html.find(".btn-apply-turn").click(async ev => {
      ev.preventDefault();
      const val = parseInt(html.find(".input-turn-num").val(), 10);
      if (!isNaN(val) && val >= 1) {
        await CrowsDungeonTimer.updateState({ turn: val });
      }
    });

    // Start local timer loop if not already running
    this._startLocalTimerLoop();
  }

  /**
   * Smooth, persistent drag-and-drop handler for the Hourglass HUD
   */
  _activateDraggable(html) {
    const header = html.find(".hourglass-header")[0];
    const container = document.getElementById("crows-dungeon-timer-layer");
    if (!header || !container) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onMouseDown = (e) => {
      // Don't drag if clicking buttons
      if (e.target.closest(".timer-btn")) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      container.style.bottom = "auto";
      container.style.right = "auto";
      container.style.left = `${initialLeft}px`;
      container.style.top = `${initialTop}px`;

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = Math.max(10, Math.min(window.innerWidth - container.offsetWidth - 10, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - container.offsetHeight - 10, initialTop + dy));

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      // Save position to localStorage
      const rect = container.getBoundingClientRect();
      localStorage.setItem("crows-dungeon-timer-pos", JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      }));
    };

    header.addEventListener("mousedown", onMouseDown);
  }

  /**
   * High-precision local timer loop (updates UI smoothly every second)
   */
  _startLocalTimerLoop() {
    if (this._interval) clearInterval(this._interval);

    this._interval = setInterval(async () => {
      const state = CrowsDungeonTimer.getState();
      if (!state.isRunning) return;

      if (game.user.isGM) {
        let remaining = state.remainingSeconds - 1;
        if (remaining <= 0) {
          remaining = 0;
          // Stop timer and play Gong sound! Does NOT auto-roll; waits for GM to advance.
          await CrowsDungeonTimer.updateState({ remainingSeconds: 0, isRunning: false });
          this._playGongSound();
          ui.notifications.warn("⏳ The sand has run out! The Dungeon Turn is complete. Press 'End Turn' to roll the Encounter Check and advance.");
        } else {
          // Sync state every 5 seconds to reduce database writes, while ticking locally
          if (remaining % 5 === 0) {
            await CrowsDungeonTimer.updateState({ remainingSeconds: remaining });
          } else {
            state.remainingSeconds = remaining;
            this._updateDOM(state);
          }
        }
      } else {
        // Player Client
        if (state.remainingSeconds > 0) {
          state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);
          if (state.remainingSeconds === 0) {
            this._playGongSound();
          }
          this._updateDOM(state);
        }
      }
    }, 1000);
  }

  /**
   * Plays a resonant atmospheric dungeon gong chime when the hourglass expires
   */
  _playGongSound() {
    try {
      // 1. Play core audio drum/horn fallback
      AudioHelper.play({ src: "sounds/drums.wav", volume: 0.9, autoplay: true });
    } catch (e) {}

    // 2. Synthesize deep metallic gong resonance via Web Audio API
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const freqs = [110, 164.8, 220, 330, 440];
      const now = ctx.currentTime;

      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = i % 2 === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.98, now + 3.5);

        gain.gain.setValueAtTime(0.3 / (i + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 3.5);
      });
    } catch (e) {
      console.warn("Crows | Web Audio Gong could not play:", e);
    }
  }

  /**
   * Fast DOM update for smooth clock & sand animation without re-rendering the whole widget
   */
  _updateDOM(state) {
    const el = this.element;
    if (!el || el.length === 0) return;

    const durationTotal = (state.durationMinutes || 30) * 60;
    const remaining = Math.max(0, state.remainingSeconds);
    const progressPercent = Math.min(100, Math.max(0, ((durationTotal - remaining) / durationTotal) * 100));

    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    el.find(".digital-clock").text(formatted);
    el.find(".progress-bar-fill").css("width", `${progressPercent}%`);

    // Sand SVG updates
    const topY = 25 + (progressPercent / 100) * 51;
    const bottomY = 135 - (progressPercent / 100) * 51;
    el.find(".sand-top-level").attr("y", topY.toFixed(1));
    el.find(".sand-bottom-level").attr("y", bottomY.toFixed(1));

    // Urgent class toggle in last 3 minutes or at 0
    const isUrgent = (remaining <= 180 && state.isRunning) || remaining === 0;
    el.find(".crows-hourglass-hud").toggleClass("urgent", isUrgent);
    el.find(".digital-clock").parent().toggleClass("pulse", isUrgent);
  }

  /**
   * Resolves the end of a Dungeon Turn according to MCDM Crows Playtest 2 rules
   */
  async endTurn() {
    const state = CrowsDungeonTimer.getState();
    const currentTurn = state.turn || 1;
    const nextTurn = currentTurn + 1;
    const en = state.en || 9;

    // 1. Play Gong Sound
    this._playGongSound();

    // 2. Perform Encounter Check (1d10 vs EN)
    const roll = new Roll("1d10");
    await roll.evaluate();
    const result = roll.total;

    let encounterOutcome = "";
    if (result === 10) {
      encounterOutcome = `
        <div class="outcome doom">
          <i class="fas fa-skull-crossbones"></i> IMMEDIATE ENCOUNTER! (Rolled 10)
        </div>
        <p class="flavor-sub">Monsters ambush or stumble upon the party right now!</p>
      `;
    } else if (result >= en) {
      encounterOutcome = `
        <div class="outcome mixed">
          <i class="fas fa-exclamation-triangle"></i> ENCOUNTER WARNING (Rolled ${result} &ge; EN ${en})
        </div>
        <p class="flavor-sub">Signs/sounds of a coming encounter are detected. The encounter occurs during the next Dungeon Turn!</p>
      `;
    } else {
      encounterOutcome = `
        <div class="outcome success">
          <i class="fas fa-shield-alt"></i> ALL QUIET (Rolled ${result} &lt; EN ${en})
        </div>
        <p class="flavor-sub">No encounter detected. The dungeon remains eerily silent.</p>
      `;
    }

    // Greed bonus calculation for next turn
    let nextGreed = "";
    if (nextTurn === 2) nextGreed = "+20% Greed Bonus on discovered treasure";
    else if (nextTurn === 3) nextGreed = "+10% Greed Bonus on discovered treasure";
    else nextGreed = "Standard treasure value (Greed bonus expired)";

    // 3. Post formatted Dungeon Turn Resolution Card in Chat
    const cardHtml = `
      <div class="crows-roll-card">
        <div class="card-header danger flexrow flex-between">
          <span><i class="fas fa-hourglass-end"></i> DUNGEON TURN ${currentTurn} ENDED</span>
          <span class="badge" style="background:#dc2626;color:#fff;">DT Complete</span>
        </div>
        <div class="card-body">
          <div class="dice-roll-total">Dungeon Encounter Check: <strong>${result}</strong> vs EN ${en}</div>
          ${encounterOutcome}
          
          <hr style="border-color: rgba(255,255,255,0.1); margin: 8px 0;" />
          
          <div class="dt-reminders">
            <h4 style="margin: 4px 0; color: #fde047;"><i class="fas fa-tasks"></i> End of Turn Checklist:</h4>
            <ul style="margin: 0; padding-left: 18px; font-size: 0.82rem; color: #e2e8f0;">
              <li><strong>Roll Usage Dice:</strong> Torches, Lanterns, and spells tracked in UD.</li>
              <li><strong>Condition Removal:</strong> Anyone suffering from <em>Weakened</em> loses the condition now.</li>
              <li><strong>Next Turn Greed:</strong> ${nextGreed}.</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    await roll.toMessage({
      flavor: `Dungeon Turn ${currentTurn} Resolution`,
      content: cardHtml
    });

    // 4. Reset timer and advance turn counter
    await CrowsDungeonTimer.updateState({
      turn: nextTurn,
      remainingSeconds: (state.durationMinutes || 30) * 60,
      isRunning: false
    });

    this.render();
  }

  close(options = {}) {
    if (this._interval) clearInterval(this._interval);
    return super.close(options);
  }
}
