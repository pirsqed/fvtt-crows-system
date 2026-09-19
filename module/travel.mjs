import { applyTravelAction, initialTravelState } from "./travel-state.mjs";

export const TRAVEL_SCOPE = "fvtt-crows-system";
const SOCKET = `system.${TRAVEL_SCOPE}`;

/** One GM serializes writes, so simultaneous selections cannot overwrite the party state. */
export class CrowsTravel {
  static queue = Promise.resolve();
  static pending = new Map();

  static register(onChange) {
    game.settings.register(TRAVEL_SCOPE, "travelState", {
      name: "Travel day", scope: "world", config: false, type: Object,
      default: initialTravelState(), onChange
    });
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
      const state = applyTravelAction(this.getState(), request, {
        user: game.users.get(userId), users: game.users.contents, actors: game.actors.contents,
        sessionId: foundry.utils.randomID()
      });
      await game.settings.set(TRAVEL_SCOPE, "travelState", state);
      return state;
    });
    this.queue = pending.catch(() => {});
    return pending;
  }
}
