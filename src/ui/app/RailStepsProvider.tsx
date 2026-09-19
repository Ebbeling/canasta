import { useMemo, useState, type ReactNode } from 'react';
import { RailStepsContext, type RailStep } from './railSteps';

/** Carries a screen's steps up to the rail. See `railSteps.ts`. */
export function RailStepsProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<RailStep[] | undefined>();
  const value = useMemo(() => ({ steps, publish: setSteps }), [steps]);

  return <RailStepsContext.Provider value={value}>{children}</RailStepsContext.Provider>;
}
