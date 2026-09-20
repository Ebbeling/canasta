import { afterEach, describe, expect, it } from 'vitest';
import { newId } from './ids';

/**
 * Ids, on a plain-HTTP address.
 *
 * `crypto.randomUUID` only exists in a *secure* context. A table device lives
 * at `http://192.168.1.42:8787` after scanning a QR code, which is not one — so
 * on the exact devices this app was built for, the obvious call throws and the
 * table can neither start a game nor hand in a round.
 */

const real = crypto.randomUUID;

afterEach(() => {
  Object.defineProperty(crypto, 'randomUUID', { value: real, configurable: true });
});

/** Pretends we are on a LAN address rather than on localhost or https. */
function withoutSecureContext(): void {
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('is a v4 UUID where the platform offers one', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('is still a v4 UUID where it does not', () => {
    withoutSecureContext();
    expect(newId()).toMatch(UUID_V4);
  });

  it('does not throw on an insecure origin', () => {
    withoutSecureContext();
    expect(() => newId()).not.toThrow();
  });

  it('keeps giving different ids', () => {
    withoutSecureContext();
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
  });
});
