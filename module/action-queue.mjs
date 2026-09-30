/** Shared by the active Ref's inventory and resource operations. Rejections never stall later work. */
let pending = Promise.resolve();
export function enqueueAction(action) {
  const next = pending.then(action);
  pending = next.catch(() => {});
  return next;
}
