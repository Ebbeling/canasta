import { useMemo, type ReactNode } from 'react';
import type { Services } from '@/application/services';
import { getContainer } from './container';
import { ServicesContext } from './servicesContext';

/**
 * Makes the application services available to the tree.
 *
 * Holds no state — it is a dependency seam, not a store. In production the
 * `services` prop is omitted and the singleton is used; a test passes services
 * built on an isolated database, so no module mocking is needed.
 */
export function ServicesProvider({
  services,
  children,
}: {
  services?: Services;
  children: ReactNode;
}) {
  const value = useMemo(() => services ?? getContainer(), [services]);
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}
