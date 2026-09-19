import { createContext, useContext } from 'react';
import type { Services } from '@/application/services';

/**
 * Kept apart from the provider component so the provider file exports only
 * components — otherwise fast refresh stops working for the whole tree.
 */
export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) {
    throw new Error('useServices moet binnen een <ServicesProvider> worden gebruikt.');
  }
  return services;
}
