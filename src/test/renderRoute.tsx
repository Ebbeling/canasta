import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { BUILTIN_RULE_SETS } from '@/rules/builtin';
import { createServices, type Services } from '@/application/services';
import { createTestStorage, type TestStorage } from '@/storage/testing';
import { fixedClock } from '@/storage/time';
import { ServicesProvider } from '@/app/ServicesProvider';
import { routes } from '@/app/routes';

export interface TestContext {
  services: Services;
  storage: TestStorage;
}

/**
 * An isolated database plus the real services on top of it.
 *
 * Seed through `context.services` before rendering, then render at the path you
 * want. Tests deliberately do not call `router.navigate()`: every render is a
 * cold load of that route, which is both closer to how the app is actually
 * opened and free of the jsdom/data-router `AbortSignal` mismatch.
 */
export async function createTestContext(): Promise<TestContext> {
  const storage = await createTestStorage();
  return {
    storage,
    services: createServices({
      repositories: storage.repositories,
      clock: fixedClock(),
      builtins: BUILTIN_RULE_SETS,
    }),
  };
}

export function renderAt(context: TestContext, path: string): RenderResult {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <ServicesProvider services={context.services}>
      <RouterProvider router={router} />
    </ServicesProvider>,
  );
}
