import { timerRemaining, updateTimer, timerDisplay } from "../timer-state.mjs";
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
  static now() { return game.time?.serverTime ?? Date.now(); }

  static isAuthority() { return game.user.isGM && game.users.activeGM?.id === game.user.id; }

  static enqueue(action) {
    const pending = (this._queue ?? Promise.resolve()).then(action);
    this._queue = pending.catch(() => {});
    return pending;
  }

  static updateState(updates) {
    return this.enqueue(() => this._writeState(updates));
  }

  static async _writeState(updates) {
    if (!this.isAuthority()) {
      ui.notifications.warn("The active GM controls the Dungeon Turn timer.");
      return;
    }
    const merged = updateTimer(this.getState(), updates, this.now());
    await game.settings.set("fvtt-crows-system", "dungeonTimerState", merged);
    return merged;
  }

  async getData() {
    const state = CrowsDungeonTimer.getState();
    return { ...timerDisplay(state, CrowsDungeonTimer.now()), isGM: game.user.isGM,
      greedBonus: [0, 30, 20, 10][state.turn] ?? 0,
      isCollapsed: this._isCollapsed, showSettings: this._showSettings };
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

    this._startLocalTimerLoop();
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
      try { await this.endTurn(); }
      catch (err) { ui.notifications.warn(`Turn resolution needs review: ${err.message}`); }
    });

    // GM: Reset Turn
    html.find(".btn-reset-turn").click(async ev => {
      ev.preventDefault();
      const state = CrowsDungeonTimer.getState();
      await CrowsDungeonTimer.updateState({
        resolvingTurn: false,
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


  }

  /**
   * Smooth, persistent drag-and-drop handler for the Hourglass HUD
   */
  _activateDraggable(html) {
    this._dragCleanup?.();
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
      if (e.button !== 0 || e.target.closest(".timer-btn")) return;
      e.preventDefault();

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
      try { localStorage.setItem("crows-dungeon-timer-pos", JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      })); } catch (err) { console.debug("Crows | Timer position could not be saved", err); }
    };

    header.addEventListener("mousedown", onMouseDown);
    this._dragCleanup = () => {
      header.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }

  /**
   * High-precision local timer loop (updates UI smoothly every second)
   */
  _startLocalTimerLoop() {
    if (this._interval) return;
    this._interval = setInterval(() => this._tick().catch(err => console.error("Crows | Timer update failed", err)), 250);
    this._tick().catch(err => console.error("Crows | Timer update failed", err));
  }

  async _tick() {
    const state = CrowsDungeonTimer.getState();
    const now = CrowsDungeonTimer.now();
    this._updateDOM(timerDisplay(state, now));
    const expired = timerRemaining(state, now) === 0;
    const expiryKey = `${state.turn}:${state.expiredAt ?? state.endsAt ?? state.lastTick}`;
    if ((state.isRunning || state.expiredAt) && expired && this._lastGong !== expiryKey) {
      this._lastGong = expiryKey;
      this._playGongSound();
      if (game.user.isGM) ui.notifications.warn("The sand has run out. End Turn to check for an encounter and advance.");
    }
    if (expired && state.isRunning && CrowsDungeonTimer.isAuthority() && !this._expiring) {
      this._expiring = true;
      try {
        await CrowsDungeonTimer.enqueue(async () => {
          const latest = CrowsDungeonTimer.getState();
          if (latest.isRunning && timerRemaining(latest, CrowsDungeonTimer.now()) === 0)
            await CrowsDungeonTimer._writeState({ remainingSeconds: 0, isRunning: false,
              expiredAt: latest.endsAt ?? (latest.lastTick + latest.remainingSeconds * 1000) });
        });
      } finally { this._expiring = false; }
    }
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

      setTimeout(() => ctx.close(), 4000);
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

    el.find(".digital-clock").text(state.formattedTime);
    el.find(".progress-bar-fill").css("width", `${state.progressPercent}%`).toggleClass("urgent", state.isUrgent);
    el.find(".sand-top-level").attr("y", state.topSandY);
    el.find(".sand-bottom-level").attr("y", state.bottomSandY);
    el.find(".sand-top-level, .sand-bottom-level").attr("fill", state.isUrgent ? "url(#crows-sand-crimson)" : "url(#crows-sand-gold)");
    el.find(".sand-mound").attr("cy", state.bottomSandY).attr("rx", state.bottomSandWidth)
      .attr("fill", state.isUrgent ? "#f87171" : "#fef08a").toggle(state.hasBottomSand);
    el.find(".sand-stream").toggle(state.isRunning).toggleClass("urgent", state.isUrgent)
      .attr("stroke", state.isUrgent ? "#ef4444" : "#fde047");
    el.toggleClass("urgent", state.isUrgent).toggleClass("running", state.isRunning).toggleClass("paused", !state.isRunning);
    el.find(".digital-clock").parent().toggleClass("pulse", state.isUrgent);
  }

  /**
   * Resolves the end of a Dungeon Turn according to MCDM Crows Playtest 2 rules
   */
  async endTurn() {
    const expectedTurn = CrowsDungeonTimer.getState().turn;
    return CrowsDungeonTimer.enqueue(() => this._endTurn(expectedTurn));
  }

  async _endTurn(expectedTurn) {
    if (!CrowsDungeonTimer.isAuthority()) {
      ui.notifications.warn("The active GM controls the Dungeon Turn timer.");
      return;
    }
    const state = CrowsDungeonTimer.getState();
    if (state.turn !== expectedTurn) return;
    if (state.resolvingTurn) {
      ui.notifications.warn("This turn resolution is pending or needs review. Check chat before resetting the timer.");
      return;
    }
    await CrowsDungeonTimer._writeState({ isRunning: false, resolvingTurn: true });
    const currentTurn = state.turn || 1;
    const nextTurn = currentTurn + 1;
    const en = state.en || 9;

    // 1. Play Gong Sound
    if (timerRemaining(state, CrowsDungeonTimer.now()) > 0) this._playGongSound();

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
    await CrowsDungeonTimer._writeState({
      resolvingTurn: false,
      turn: nextTurn,
      remainingSeconds: (state.durationMinutes || 30) * 60,
      isRunning: false
    });

    this.render();
  }

  close(options = {}) {
    this._dragCleanup?.();
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    return super.close(options);
  }
}
