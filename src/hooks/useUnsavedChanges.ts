import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';

/**
 * Three layers of protection against losing a filled-in round.
 *
 * 1. `useBlocker` for navigation inside the app — only available in a data
 *    router, which is why the app uses one.
 * 2. `beforeunload` for closing the tab or reloading, which `useBlocker`
 *    cannot see.
 * 3. The debounced draft in Dexie, written by the caller. That is the layer that
 *    actually survives a killed tab; these two are courtesy.
 */
export interface UnsavedChangesGuard {
  /**
   * Releases the guard for a navigation the user actually asked for, such as
   * the one that follows a successful save.
   *
   * It writes to a ref rather than relying on state, because `useBlocker`
   * evaluates synchronously during `navigate()`. A `dispatch` that clears the
   * dirty flag has not been applied yet at that point, so the guard would still
   * see the old value and stop the very navigation the save just earned.
   */
  markClean(): void;
  /**
   * True while a navigation is held, waiting for an answer.
   *
   * The hook reports the state and leaves the asking to the caller, which
   * renders the app's own dialog. It deliberately does not call `confirm()`:
   * a native dialog cannot be styled, blocks the whole page, and on iOS can be
   * suppressed entirely — which would silently turn the guard off.
   */
  blocked: boolean;
  /** Let the held navigation continue. */
  confirmLeave(): void;
  /** Stay where we are; the held navigation is dropped. */
  cancelLeave(): void;
}

export function useUnsavedChanges(dirty: boolean): UnsavedChangesGuard {
  // Mirrors `dirty` so the blocker reads the current value without waiting for
  // a re-render. Re-assigned on every render, so a fresh edit re-arms the guard
  // on its own — `markClean` cannot switch it off permanently.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers ignore custom text nowadays; the cancellation is what counts.
      event.returnValue = '';
    };

    globalThis.addEventListener('beforeunload', handler);
    return () => globalThis.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const markClean = useCallback(() => {
    dirtyRef.current = false;
  }, []);

  // `proceed` and `reset` only exist while the blocker is holding a navigation,
  // so both are read off the current blocker rather than captured once.
  const confirmLeave = useCallback(() => {
    blocker.proceed?.();
  }, [blocker]);

  const cancelLeave = useCallback(() => {
    blocker.reset?.();
  }, [blocker]);

  return { markClean, blocked: blocker.state === 'blocked', confirmLeave, cancelLeave };
}
