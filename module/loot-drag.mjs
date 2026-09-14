import { CrowsLoot } from "./loot.mjs";

/** Native item drags over loose loot, so existing sheet drop handlers work too. */
export class CrowsLootDrag {
  static handles = new Map();

  static start() {
    this.stop();
    this.root = document.createElement("div");
    this.root.className = "crows-map-items";
    document.body.append(this.root);
    this.tick = () => this.refresh();
    canvas.app.ticker.add(this.tick);
    this.key = event => {
      this.root.classList.toggle("reposition", game.user.isGM && event.shiftKey);
    };
    this.blur = () => this.root.classList.remove("reposition");
    window.addEventListener("keydown", this.key);
    window.addEventListener("keyup", this.key);
    window.addEventListener("blur", this.blur);
    this.refresh();
  }

  static stop() {
    if (this.tick) canvas.app?.ticker.remove(this.tick);
    window.removeEventListener("keydown", this.key);
    window.removeEventListener("keyup", this.key);
    window.removeEventListener("blur", this.blur);
    this.root?.remove();
    this.handles.clear();
  }

  static refresh() {
    const active = new Set();
    const view = canvas.app.view ?? canvas.app.canvas;
    const rect = view.getBoundingClientRect();
    const scaleX = rect.width / canvas.app.screen.width;
    const scaleY = rect.height / canvas.app.screen.height;
    for (const token of canvas.tokens.placeables) {
      const item = CrowsLoot.looseItem(token);
      if (!canvas.tokens.active || !token.visible || !token.isVisible || !item) continue;
      active.add(token.id);
      let handle = this.handles.get(token.id);
      if (!handle) {
        handle = document.createElement("div");
        handle.className = "crows-map-item";
        handle.draggable = true;
        handle.addEventListener("dragstart", event => {
          const current = CrowsLoot.looseItem(token);
          if (!current) return event.preventDefault();
          event.dataTransfer.setData("text/plain", JSON.stringify({ ...current.toDragData(), crowsMapItem: true }));
          event.dataTransfer.effectAllowed = "move";
          const ghost = document.createElement("img");
          ghost.src = current.img;
          ghost.className = "crows-map-item-ghost";
          document.body.append(ghost);
          event.dataTransfer.setDragImage(ghost, 24, 24);
          setTimeout(() => ghost.remove(), 0);
        });
        // Matching loose stacks can be merged through the ordinary item transfer path.
        handle.addEventListener("dragover", event => event.preventDefault());
        handle.addEventListener("drop", event => {
          event.preventDefault();
          event.stopPropagation();
          let data;
          try { data = JSON.parse(event.dataTransfer.getData("text/plain")); }
          catch { return; }
          CrowsLoot.onDropCanvasData(canvas, { ...data, x: token.center.x, y: token.center.y })
            .catch(err => { console.error("Crows | Item drop failed", err); ui.notifications.error("Could not move the item."); });
        });
        handle.addEventListener("dblclick", () => token.actor.sheet.render(true, { token: token.document }));
        this.root.append(handle);
        this.handles.set(token.id, handle);
      }
      handle.title = `${item.name}: drag to a sheet or token. Double-click to open.${game.user.isGM ? " Hold Shift to move the map token." : ""}`;
      const point = canvas.stage.worldTransform.apply({ x: token.document.x, y: token.document.y });
      Object.assign(handle.style, {
        left: `${rect.left + point.x * scaleX}px`, top: `${rect.top + point.y * scaleY}px`,
        width: `${token.w * canvas.stage.scale.x * scaleX}px`,
        height: `${token.h * canvas.stage.scale.y * scaleY}px`
      });
    }
    for (const [id, handle] of this.handles) {
      if (active.has(id)) continue;
      handle.remove();
      this.handles.delete(id);
    }
  }
}
