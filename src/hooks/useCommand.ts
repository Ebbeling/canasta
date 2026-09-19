import { useCallback, useEffect, useRef, useState } from 'react';

export type CommandState = 'idle' | 'running' | 'done' | 'failed';

export interface Command<A, R> {
  run(args: A): Promise<R | undefined>;
  state: CommandState;
  error?: Error;
  result?: R;
  reset(): void;
}

/**
 * Runs a write.
 *
 * Deliberately not a live query: a failed save must leave the user's typed input
 * on screen, so the rejection is captured here instead of bubbling to the route
 * error boundary. Double submits are ignored while one is in flight.
 */
export function useCommand<A, R>(fn: (args: A) => Promise<R>): Command<A, R> {
  const [state, setState] = useState<CommandState>('idle');
  const [error, setError] = useState<Error | undefined>();
  const [result, setResult] = useState<R | undefined>();

  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (args: A) => {
      if (running.current) return undefined;
      running.current = true;
      setState('running');
      setError(undefined);

      try {
        const value = await fn(args);
        if (mounted.current) {
          setResult(value);
          setState('done');
        }
        return value;
      } catch (caught) {
        if (mounted.current) {
          setError(caught instanceof Error ? caught : new Error(String(caught)));
          setState('failed');
        }
        return undefined;
      } finally {
        running.current = false;
      }
    },
    [fn],
  );

  const reset = useCallback(() => {
    setState('idle');
    setError(undefined);
    setResult(undefined);
  }, []);

  return { run, state, error, result, reset };
}
