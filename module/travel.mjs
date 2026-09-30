import { saveTravelJournalDay, refreshTravelJournalAccess } from "./travel-journal.mjs";
import { applyTravelAction, initialTravelState } from "./travel-state.mjs";

export const TRAVEL_SCOPE = "fvtt-crows-system";
const SOCKET = `system.${TRAVEL_SCOPE}`;

/** One GM serializes writes, so simultaneous selections cannot overwrite the party state. */
export class CrowsTravel {
  static queue = Promise.resolve();
  static pending = new Map();

  static register(onChange) {
    game.settings.register(TRAVEL_SCOPE, "travelJournalAudience", {
      name: "Travel journal readers", hint: "Who can read the Travel Journal. Changing this also updates existing entries; the live travel helper remains shared.",
      scope: "world", config: true, type: String, default: "all",
      choices: {all:"All players", trusted:"Trusted Players and above"},
      onChange: () => this.refreshJournalAccess()
    });
    for (const hook of ["ready", "createUser", "updateUser", "deleteUser", "userConnected"]) {
      Hooks.on(hook, () => this.refreshJournalAccess());
    }
    game.settings.register(TRAVEL_SCOPE, "travelState", {
      name: "Travel day", scope: "world", config: false, type: Object,
      default: initialTravelState(), onChange
    });
  }

  static refreshJournalAccess() {
    const pending = this.queue.then(() => refreshTravelJournalAccess());
    this.queue = pending.catch(error => {
      console.error("Crows | Travel journal permissions", error);
      ui.notifications.error("Travel journal permissions could not be updated. Check journal ownership before sharing.");
    });
    return this.queue;
  }

  static getState() { return game.settings.get(TRAVEL_SCOPE, "travelState") ?? initialTravelState(); }

  static activate() {
    game.socket.on(SOCKET, async packet => {
      if (packet?.channel !== "travel") return;
      if (packet.reply) {
        const pending = this.pending.get(packet.id);
        if (!pending || packet.recipient !== game.user.id) return;
        clearTimeout(pending.timer);
        this.pending.delete(packet.id);
        packet.error ? pending.reject(new Error(packet.error)) : pending.resolve();
        return;
      }
      if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
      let error;
      try { await this.execute(packet.request, packet.userId); }
      catch (err) { error = err.message; }
      game.socket.emit(SOCKET, { channel: "travel", reply: true, id: packet.id, recipient: packet.userId, error });
    });
  }

  static request(request) {
    if (!game.users.activeGM) return Promise.reject(new Error("A Ref must be connected to coordinate travel. Reopen the helper when they return."));
    if (game.users.activeGM.id === game.user.id) return this.execute(request, game.user.id);
    const id = foundry.utils.randomID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Travel update timed out. Check the current selection before trying again."));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      game.socket.emit(SOCKET, { channel: "travel", id, userId: game.user.id, request });
    });
  }

  static execute(request, userId) {
    const pending = this.queue.then(async () => {
      if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) throw new Error("The active Ref changed. Try again.");
      const current = structuredClone(this.getState());
      const savingDay = current.session && current.step === "complete" && ["start", "finish"].includes(request.action);
      if (savingDay && typeof request.journalNotes === "string") current.notes = request.journalNotes.slice(0,8000);
      const state = applyTravelAction(current, request, {
        user: game.users.get(userId), users: game.users.contents, actors: game.actors.contents,
        sessionId: foundry.utils.randomID()
      });
      if (savingDay) {
        try { await saveTravelJournalDay(current); }
        catch (error) { throw new Error(`Could not save the travel journal. Your day is still open; retry after fixing the error. ${error.message}`); }
      }
      await game.settings.set(TRAVEL_SCOPE, "travelState", state);
      return state;
    });
    this.queue = pending.catch(() => {});
    return pending;
  }
}
