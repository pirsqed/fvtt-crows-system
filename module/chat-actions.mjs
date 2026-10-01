import { expertisePools, expertisePool, expertiseLabel, setExpertiseUses, spendChatExpertise } from "./expertise-pools.mjs";
import { rollMiasmaEffect } from "./miasma.mjs";
import { CHAT_SCOPE, getRollState, renderRollState, renderUndoExpertise, renderReviewActions, resolveActor, damageSnapshot, escapeHTML } from "./chat-state.mjs";
import { rollUsageDice } from "./usage-dice.mjs";
import { enqueueAction } from "./action-queue.mjs";
import { allocationForActor } from "./damage.mjs";

const SOCKET = `system.${CHAT_SCOPE}`;

export class CrowsChatActions {
  static pending = new Map();

  static activate(expertises = []) {
    this.expertiseLabels = Object.fromEntries(expertises.map(exp => [exp.key, exp.label]));
    game.socket.on(SOCKET, async packet => {
      if (packet?.channel !== "chat-actions") return;
      if (packet.reply) {
        const pending = this.pending.get(packet.id);
        if (pending && packet.recipient === game.user.id) {
          this.pending.delete(packet.id);
          clearTimeout(pending.timer);
          packet.error ? pending.reject(new Error(packet.error)) : pending.resolve(packet.result);
        }
        return;
      }
      if (game.users.activeGM?.id !== game.user.id) return;
      let result, error;
      try { result = await this.execute(packet.request, packet.userId); }
      catch (err) { error = err.message; }
      game.socket.emit(SOCKET, { channel: "chat-actions", reply: true, id: packet.id,
        recipient: packet.userId, result, error });
    });
  }

  static request(request) {
    if (game.users.activeGM?.id === game.user.id) return this.execute(request, game.user.id);
    if (!game.users.activeGM) {
      // A single connected user is also a single writer. Multiplayer requires the GM coordinator.
      if (game.users.filter(user => user.active).length === 1) return this.execute(request, game.user.id);
      return Promise.reject(new Error("A GM must be connected to coordinate chat actions."));
    }
    if (!game.system.socket) return Promise.reject(new Error("Restart Foundry to enable the system socket."));
    const id = foundry.utils.randomID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Chat action timed out. Check the card before retrying."));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      game.socket.emit(SOCKET, { channel: "chat-actions", id, userId: game.user.id, request });
    });
  }

  static execute(request, userId) {
    const pending = enqueueAction(() => {
      if (game.users.activeGM && game.users.activeGM.id !== game.user.id) throw new Error("The active Ref changed. Check the result before retrying.");
      return this.perform(request, userId);
    });
    return pending;
  }

  static async save(message, state) {
    await message.update({ [`flags.${CHAT_SCOPE}.rollState`]: state, content: renderRollState(state) });
  }

  static async perform(request, userId) {
    const requester = game.users.get(userId);
    if (["usage-dice", "allocate-damage"].includes(request.action)) {
      const document = await fromUuid(request.itemUuid ?? request.actorUuid);
      const actor = request.action === "usage-dice" ? document?.parent : document;
      if (!requester || !actor || !(requester.isGM || actor.testUserPermission(requester, "OWNER")))
        throw new Error("You do not have permission to change this actor.");
      if (request.action === "usage-dice") {
        const current = document.system.consumable?.currentUD ?? document.system.consumable?.maxUD ?? 0;
        if (current !== request.expected) throw new Error("The usage pool changed. Check the item before rolling again.");
        return rollUsageDice(actor, document);
      }
      if (request.snapshot !== damageSnapshot(actor)) throw new Error("The target changed. Reopen the damage dialog.");
      return actor.applyAllocatedDamage(allocationForActor(actor, request.allocation));
    }
    const message = game.messages.get(request.messageId);
    const user = game.users.get(userId);
    const current = message && getRollState(message);
    if (!current || current.version !== 1 || !user) throw new Error("This roll is unavailable.");
    if (message.whisper?.length && !user.isGM && message.author?.id !== userId
      && !message.whisper.includes(userId)) throw new Error("You cannot use this private roll.");
    const state = foundry.utils.deepClone(current);
    if (request.action === "review") {
      if (!user.isGM) throw new Error("Only the Ref/GM can reconcile an action.");
      if (request.revision !== state.revision) throw new Error("This roll changed. Reopen the review.");
      const action = state.actions[request.key];
      if (!action || !["pending", "needs review"].includes(action.status)) throw new Error("This action no longer needs review.");
      if (request.checked !== true || !["applied", "cancelled"].includes(request.resolution)) throw new Error("Check and correct the actor before resolving this action.");
      const transition = action.transition?.[request.resolution === "applied" ? "after" : "before"];
      if (!transition && ["expertise", "undo-expertise"].includes(request.key) && request.resolution === "applied")
        throw new Error("This older action has no saved tier transition. Restore its resources, cancel it, and make a new roll.");
      if (transition) {
        state.tier = transition.tier;
        state.expertise = transition.expertise;
        state.expertiseUndone = transition.expertiseUndone;
        if (request.key === "undo-expertise") state.actions.expertise.status = transition.expertiseStatus;
      }
      state.reviews ??= [];
      state.reviews.push({ key: request.key, resolution: request.resolution, userId,
        note: String(request.note ?? "").slice(0, 1000), action: foundry.utils.deepClone(action) });
      action.status = request.key === "undo-expertise" && request.resolution === "applied" ? "cancelled" : request.resolution;
      state.revision++;
      await this.save(message, state);
      return { reconciled: true };
    }
    const actor = await resolveActor(state.actorUuid);
    const owns = document => document && (user.isGM || document.testUserPermission(user, "OWNER"));
    let key, apply;
    if (request.action === "expertise") {
      if (!owns(actor) || !state.expertiseAllowed) throw new Error("You do not own this roll's actor.");
      if (state.expertise || state.isDoom || state.tier >= 3
        || Object.values(state.actions).some(action => action.status !== "cancelled"))
        throw new Error("This roll can no longer be upgraded.");
      const exp = expertisePool(actor, request.key);
      if (!exp || !(Number(exp.value) > 0)) throw new Error("No expertise uses remain.");
      key = "expertise";
      apply = async () => {
        const result = await spendChatExpertise(actor, request.key);
        if (!result.success) throw new Error("Could not spend expertise.");
        state.tier++;
        state.expertise = { key: request.key, label: expertiseLabel(actor, request.key, this.expertiseLabels), remaining: result.remaining };
        state.revision++;
        return result;
      };
    } else if (request.action === "undo-expertise") {
      if (!user.isGM) throw new Error("Only the Ref/GM can undo expertise.");
      if (request.revision !== state.revision) throw new Error("This roll changed. Try again from the updated card.");
      if (!state.expertise || state.actions.expertise?.status !== "applied"
        || Object.values(state.actions).some(action => ["pending", "needs review"].includes(action.status)))
        throw new Error("This expertise cannot be undone until pending actions have been reviewed.");
      const exp = expertisePool(actor, state.expertise.key);
      if (!exp) throw new Error("The original actor or expertise is unavailable.");
      key = "undo-expertise";
      apply = async () => {
        const remaining = Math.min(Number(exp.max), Number(exp.value) + 1);
        if (!Number.isFinite(remaining)) throw new Error("The expertise uses need GM review.");
        await setExpertiseUses(actor, state.expertise.key, remaining);
        state.tier--;
        state.expertise = null;
        state.actions.expertise.status = "cancelled";
        state.expertiseUndone = true;
        state.revision++;
        return { remaining };
      };
    } else if (request.action === "damage") {
      const target = await resolveActor(request.targetUuid);
      if (!owns(target)) throw new Error("You do not have permission to manage damage for this target.");
      if (state.targets.length && !state.targets.some(t => t.uuid === request.targetUuid))
        throw new Error("That token was not a target of this attack.");
      if (request.revision !== state.revision) throw new Error("This roll changed. Reopen the damage dialog.");
      const damage = (state.special && !state.expertise ? state.special : state.outcomes[state.tier]).numericDamage;
      if (!(damage > 0) || !Number.isSafeInteger(request.allocation?.damageTotal) || request.allocation.damageTotal < 1)
        throw new Error("Enter a positive whole damage amount.");
      if (request.snapshot !== damageSnapshot(target)) throw new Error("The target changed. Reopen the damage dialog.");
      key = `damage:${request.targetUuid}`;
      const allocation = allocationForActor(target, request.allocation);
      apply = () => target.applyAllocatedDamage(allocation);
    } else if (["gain", "clear"].includes(request.action)) {
      if (!owns(actor) || state.kind !== "miasma" || (request.action === "gain" ? state.tier !== 1 : state.tier !== 3))
        throw new Error("This Miasma action is no longer available.");
      key = "miasma";
      apply = () => request.action === "gain" ? actor.adjustCruelty(1) : actor.clearCruelty();
    } else throw new Error("Unknown chat action.");
    if (state.actions[key] && state.actions[key].status !== "cancelled")
      throw new Error("This action has already been applied or needs review.");
    // Persist the claim first. A disconnect or partial write must not silently allow a second application.
    const before = { tier: state.tier, expertise: state.expertise ?? null,
      expertiseUndone: state.expertiseUndone ?? false, expertiseStatus: state.actions.expertise?.status };
    let after;
    if (request.action === "expertise") after = { ...before, tier: state.tier + 1,
      expertise: { key: request.key, label: expertiseLabel(actor, request.key, this.expertiseLabels),
        remaining: Number(expertisePool(actor, request.key).value) - 1 } };
    if (request.action === "undo-expertise") after = { ...before, tier: state.tier - 1, expertise: null,
      expertiseUndone: true, expertiseStatus: "cancelled" };
    state.actions[key] = { status: "pending", userId,
      ...(after ? { transition: { before, after } } : {}),
      ...(request.action === "damage" ? { damageTotal: request.allocation.damageTotal } : {}) };
    await this.save(message, state);
    try {
      const result = await apply();
      state.actions[key].status = request.action === "undo-expertise" ? "cancelled" : "applied";
      await this.save(message, state);
      return result;
    } catch (err) {
      state.actions[key].status = "needs review";
      await this.save(message, state);
      throw err;
    }
  }

  static bind(message, html) {
    // Message content is shared; filter GM controls separately for each viewer.
    if (!game.user.isGM) html.find('[data-action="undo-expertise"]').remove();
    else if (!html.find('[data-action="undo-expertise"]').length) {
      const control = renderUndoExpertise(getRollState(message));
      if (control) html.find(".crows-chat-actions").append(control);
    }
    const review = renderReviewActions(getRollState(message));
    if (review) {
      if (!game.user.isGM) html.find('[data-action="review"]').remove();
      else if (!html.find('[data-action="review"]').length) html.find(".crows-chat-actions").append(review);
    }
    html.find(".crows-state-action").click(async event => {
      event.preventDefault();
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      try { await this.click(message, button.dataset); }
      catch (err) { ui.notifications.warn(err.message); }
      finally { button.disabled = false; }
    });
  }

  static async click(message, data) {
    const state = getRollState(message);
    if (data.action === "review") {
      if (!game.user.isGM) throw new Error("Only the Ref/GM can reconcile an action.");
      const action = state.actions[data.key];
      const resolve = resolution => async html => {
        try { await this.request({ messageId: message.id, action: "review", key: data.key,
          revision: state.revision, resolution, checked: html.find('[name="checked"]').is(':checked'),
          note: html.find('[name="note"]').val() }); }
        catch (error) { ui.notifications.warn(error.message); }
      };
      return new Dialog({ title: "Review uncertain action",
        content: `<form><p><strong>${escapeHTML(data.key)}</strong> — ${escapeHTML(action?.status)}</p>
          ${action?.damageTotal != null ? `<p>Requested damage: ${action.damageTotal}</p>` : ""}
          ${action?.transition ? `<p>Intended tier: ${action.transition.before.tier} → ${action.transition.after.tier}. Expertise: ${escapeHTML(action.transition.after.expertise?.label ?? action.transition.before.expertise?.label ?? "none")}.</p>` : ""}
          <p>Inspect the actor and correct any partial changes first. These controls update this card only; they do not spend, refund, heal, or apply damage.</p>
          <p>Choose Applied if the intended result is now complete, or Cancelled if its resource changes have been restored.</p>
          <label><input type="checkbox" name="checked"> I checked and corrected the actor.</label>
          <p><label>Review note <input type="text" name="note" maxlength="1000"></label></p></form>`,
        buttons: { applied: { label: "Record Applied", callback: resolve("applied") },
          cancelled: { label: "Record Cancelled", callback: resolve("cancelled") }, close: { label: "Close" } }, default: "close"
      }).render(true);
    }
    const actor = await resolveActor(state.actorUuid);
    if (data.action === "expertise") {
      if (!actor?.isOwner) throw new Error("You do not own this roll's actor.");
      const options = expertisePools(actor).filter(([, exp]) => exp.value > 0);
      if (!options.length) throw new Error("No expertise uses remain.");
      return new Dialog({
        title: "Apply Expertise (+1 Tier)",
        content: `<form class="crows-dialog-form"><p>Choose an expertise with the Ref.</p><div class="form-group"><select name="expertise">${options.map(([key, exp]) =>
          `<option value="${escapeHTML(key)}">${escapeHTML(expertiseLabel(actor, key, this.expertiseLabels))} (${exp.value}/${exp.max})</option>`).join("")}</select></div></form>`,
        buttons: {
          apply: {
            icon: '<i class="fas fa-check"></i>',
            label: "Apply",
            callback: async html => {
              try { await this.request({ messageId: message.id, action: "expertise", key: html.find('[name="expertise"]').val() }); }
              catch (err) { ui.notifications.warn(err.message); }
            }
          },
          cancel: {
            label: "Cancel"
          }
        }
      }, { classes: ["crows", "dialog", "crows-dialog"] }).render(true);
    }
    if (data.action === "damage") {
      const selected = state.targets[Number(data.targetIndex)];
      const fallback = Array.from(game.user.targets ?? [])[0] ?? canvas.tokens.controlled[0];
      const targetUuid = selected?.uuid ?? (fallback?.document?.uuid);
      if (!targetUuid) throw new Error("Target or select a token first.");
      const target = await resolveActor(targetUuid);
      if (!target?.isOwner) throw new Error("You do not own this target.");
      const snapshot = damageSnapshot(target);
      const amount = (state.special && !state.expertise ? state.special : state.outcomes[state.tier]).numericDamage;
      return target.openDamageAllocationDialog(amount, { commit: allocation => this.request({
        messageId: message.id, action: "damage", targetUuid, snapshot, revision: state.revision, allocation
      }) });
    }
    await this.request({ messageId: message.id, action: data.action, revision: state.revision });
    if (data.action === "gain") await rollMiasmaEffect(actor);
  }
}
