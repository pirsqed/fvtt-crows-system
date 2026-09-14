/** Preserve both whole-form and nested inventory scrolling across Foundry V1 renders. */
export function withPersistentScroll(BaseSheet) {
  return class extends BaseSheet {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        scrollY: [".window-content", "form", ".sheet-body", ".storage-item-list", ".editor-content"]
      });
    }

    requestRefresh() {
      if (this._crowsRendering) this._crowsRenderAgain = true;
      else if (this.rendered) this.render(false, { focus: false });
    }

    async _render(force = false, options = {}) {
      // Foundry V1 drops render calls during an in-flight render. A document update
      // can arrive after getData has read the old permissions but before it finishes.
      if (this._crowsRendering) {
        this._crowsRenderAgain = true;
        return;
      }
      this._crowsRendering = true;
      try {
        do {
          this._crowsRenderAgain = false;
          await super._render(force, options);
          force = false;
          options = { focus: false };
        } while (this._crowsRenderAgain && this.rendered);
      } finally {
        this._crowsRendering = false;
        this._crowsRenderAgain = false;
      }
    }

    _restoreScrollPositions(html) {
      // V1 passes the replacement form here. Searching its descendants misses the
      // form itself and the window-content scroller saved from the outer window.
      return super._restoreScrollPositions(this.element?.length ? this.element : html);
    }
  };
}
