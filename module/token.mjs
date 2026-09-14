import { CrowsLoot } from "./loot.mjs";

/** Linked loot can expose its scene exterior without publishing the world actor. */
export class CrowsToken extends Token {
  _canView(user, event) {
    if (this.actor?.type !== "loot" || !this.document.actorLink) return super._canView(user, event);
    if (!this.layer.active || canvas.regions._placementContext || this.layer._draggedToken) return false;
    if (canvas.controls.ruler.active || (CONFIG.Canvas.rulerClass.canMeasure && event?.type === "pointerdown")) return false;
    return user.isGM || CrowsLoot.canInspectToken(this.document);
  }
}
