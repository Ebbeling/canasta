import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * Vitest runs without `globals: true`, so Testing Library's automatic cleanup
 * never registers itself. Without this, rendered DOM leaks from one test into
 * the next and queries start matching the wrong element.
 *
 * `cleanup()` is safe in the node environment too: it no-ops when nothing was
 * rendered, so this one setup file serves both the pure and the jsdom tests.
 */
afterEach(() => {
  cleanup();
});

/**
 * jsdom supplies its own `AbortSignal`, which Node's `Request` validator does
 * not accept ("Expected signal to be an instance of AbortSignal"). React
 * Router's data router attaches one when it navigates, which surfaces as an
 * unhandled rejection that has nothing to do with the code under test.
 *
 * Dropping the signal is safe here: nothing in this app makes a network
 * request, so there is never anything to abort.
 */
const BaseRequest = globalThis.Request;
if (typeof BaseRequest === 'function') {
  globalThis.Request = class extends BaseRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init ? { ...init, signal: undefined } : init);
    }
  };
}
