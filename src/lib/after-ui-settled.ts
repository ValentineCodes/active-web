/** Runs work after the current UI commit / animations, without InteractionManager. */
export function afterUiSettled(callback: () => void): () => void {
  let cancelled = false;

  const run = () => {
    if (!cancelled) callback();
  };

  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 250 });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }

  let outer = 0;
  let inner = 0;
  outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(run);
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
  };
}
