/** Deadline arithmetic is independent of render frequency and background-tab throttling. */
export function timerRemaining(state, now) {
  const stored = Math.max(0, Number(state.remainingSeconds ?? (state.durationMinutes || 30) * 60));
  if (!state.isRunning) return stored;
  const deadline = state.endsAt ?? ((state.lastTick ?? now) + stored * 1000);
  return Math.max(0, (deadline - now) / 1000);
}

export function updateTimer(state, updates, now) {
  const remaining = timerRemaining(state, now);
  const next = { ...state, remainingSeconds: remaining, ...updates, lastTick: now };
  next.remainingSeconds = Math.max(0, Number(next.remainingSeconds));
  next.isRunning = !!next.isRunning && next.remainingSeconds > 0;
  if (next.remainingSeconds > 0) next.expiredAt = null;
  next.endsAt = next.isRunning ? now + next.remainingSeconds * 1000 : null;
  return next;
}

export function timerDisplay(state, now) {
  const remaining = Math.ceil(timerRemaining(state, now));
  const duration = (state.durationMinutes || 30) * 60;
  const progress = Math.min(100, Math.max(0, (1 - remaining / duration) * 100));
  const running = !!state.isRunning && remaining > 0;
  return { ...state, remainingSeconds: remaining, isRunning: running,
    formattedTime: `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`,
    progressPercent: progress.toFixed(1), topSandY: (25 + progress * 0.51).toFixed(1),
    bottomSandY: (135 - progress * 0.51).toFixed(1), bottomSandWidth: Math.min(26, 6 + progress * 0.2).toFixed(1),
    hasBottomSand: progress > 2, isUrgent: (remaining <= 180 && running) || remaining === 0 };
}
