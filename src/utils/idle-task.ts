type IdleTaskHandle = {
  cancel: () => void;
};

type IdleScheduler = {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleIdleTask(callback: () => void): IdleTaskHandle {
  const scheduler = globalThis as typeof globalThis & IdleScheduler;

  if (typeof scheduler.requestIdleCallback === 'function') {
    const handle = scheduler.requestIdleCallback(callback);
    return {
      cancel: () => scheduler.cancelIdleCallback?.(handle),
    };
  }

  const handle = setTimeout(callback, 0);
  return {
    cancel: () => clearTimeout(handle),
  };
}
