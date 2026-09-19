import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * A screen's own steps, for the rail to show.
 *
 * The design gives the setup wizard a rail of its own: where a game shows which
 * game you are in and where you can go, the wizard shows how far along you are.
 * The rail is rendered by the shell and the wizard lives under it, so the steps
 * travel up through this context rather than being worked out twice.
 *
 * It holds no step state of its own. The screen that owns the wizard publishes
 * what it already knows, and clears it on the way out.
 *
 * Kept apart from the provider component so that file exports only components —
 * otherwise fast refresh stops working for the whole tree.
 */

export interface RailStep {
  /** What the step is called, as the screen words it. */
  label: string;
  done: boolean;
  current: boolean;
}

export interface RailStepsValue {
  steps: RailStep[] | undefined;
  publish: (steps: RailStep[] | undefined) => void;
}

export const RailStepsContext = createContext<RailStepsValue>({
  steps: undefined,
  publish: () => {},
});

/** What the rail should show, if a screen has published anything. */
export function useRailSteps(): RailStep[] | undefined {
  return useContext(RailStepsContext).steps;
}

/**
 * Publish this screen's steps for as long as it is on screen.
 *
 * Keyed on the steps' own contents, so a re-render with the same steps does not
 * set state again and the effect cannot chase its own tail.
 */
export function usePublishRailSteps(steps: RailStep[]): void {
  const { publish } = useContext(RailStepsContext);
  const key = steps.map((step) => `${step.label}|${step.done}|${step.current}`).join('/');

  const latest = useRef(steps);
  latest.current = steps;

  useEffect(() => {
    publish(latest.current);
    return () => publish(undefined);
  }, [key, publish]);
}
