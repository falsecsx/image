function snapshotPointerEvent(event) {
  if (!event) return null;
  return {
    clientX: Number(event.clientX) || 0,
    clientY: Number(event.clientY) || 0,
    pointerId: event.pointerId,
    pointerType: event.pointerType || 'mouse',
    button: Number(event.button) || 0,
    buttons: Number(event.buttons) || 0,
    altKey: Boolean(event.altKey),
    ctrlKey: Boolean(event.ctrlKey),
    metaKey: Boolean(event.metaKey),
    shiftKey: Boolean(event.shiftKey)
  };
}

export function createCanvasInteractionScheduler(onFrame) {
  let frameId = null;
  let pendingEvent = null;
  const stats = {
    pointerEvents: 0,
    frames: 0,
    synchronousFlushes: 0,
    cancelledFrames: 0
  };

  const run = () => {
    frameId = null;
    const event = pendingEvent;
    pendingEvent = null;
    if (!event) return false;
    stats.frames += 1;
    onFrame?.(event);
    return true;
  };

  return {
    enqueue(event) {
      pendingEvent = snapshotPointerEvent(event);
      stats.pointerEvents += 1;
      if (frameId != null) return;
      frameId = requestAnimationFrame(run);
    },
    flush() {
      if (frameId != null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      if (!pendingEvent) return false;
      stats.synchronousFlushes += 1;
      return run();
    },
    cancel() {
      if (frameId != null) {
        cancelAnimationFrame(frameId);
        stats.cancelledFrames += 1;
      }
      frameId = null;
      pendingEvent = null;
    },
    getStats() {
      return { ...stats, pending: Boolean(pendingEvent), scheduled: frameId != null };
    },
    resetStats() {
      stats.pointerEvents = 0;
      stats.frames = 0;
      stats.synchronousFlushes = 0;
      stats.cancelledFrames = 0;
    }
  };
}
