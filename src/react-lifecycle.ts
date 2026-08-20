export type DeferredEffectLifetime = {
  acquire: () => () => void;
};

type Defer = (callback: () => void) => void;

/**
 * Defers disposal by one microtask so React StrictMode's setup-cleanup-setup
 * probe can reacquire the same owned resource before it is destroyed.
 */
export function createDeferredEffectLifetime(
  dispose: () => void,
  defer: Defer = queueMicrotask
): DeferredEffectLifetime {
  let lease = 0;

  return {
    acquire: () => {
      const acquiredLease = ++lease;
      return () => {
        defer(() => {
          if (lease === acquiredLease) dispose();
        });
      };
    },
  };
}
