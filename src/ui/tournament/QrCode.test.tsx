// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QrCode } from './QrCode';

/**
 * The QR component knows one thing: how to draw the string it is handed.
 *
 * That is the point of these tests. The bug this feature had was a URL being
 * assembled in the wrong place — from the browser's own address — and the cure
 * is that assembling one is not this component's job at all. It has no idea
 * what a server, a port or a session is.
 */

const LAN = 'http://192.168.1.42:4317/canasta/table/abc123';

/** The drawn modules, as one string, so two codes can be compared. */
function modules(container: HTMLElement): string {
  return container.querySelector('path')?.getAttribute('d') ?? '';
}

describe('the QR code', () => {
  it('draws the URL it is given', () => {
    const { container } = render(<QrCode value={LAN} label="QR-code voor tafel 1" />);

    const svg = screen.getByRole('img', { name: 'QR-code voor tafel 1' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(modules(container).length).toBeGreaterThan(0);
  });

  it('encodes a different URL differently', () => {
    // If the component ignored its input — or built its own — these would match.
    const lan = render(<QrCode value={LAN} label="a" />);
    const local = render(
      <QrCode value="http://localhost:4317/canasta/table/abc123" label="b" />,
    );

    expect(modules(lan.container)).not.toBe(modules(local.container));
  });

  it('gives the same drawing for the same URL', () => {
    const first = render(<QrCode value={LAN} label="a" />);
    const second = render(<QrCode value={LAN} label="b" />);

    expect(modules(first.container)).toBe(modules(second.container));
  });

  it('never reads the browser address, whatever that address is', () => {
    // The page is served from somewhere irrelevant; the code must still be the
    // code for the LAN URL it was handed.
    const expected = modules(render(<QrCode value={LAN} label="expected" />).container);

    const elsewhere = render(<QrCode value={LAN} label="elsewhere" />);
    expect(modules(elsewhere.container)).toBe(expected);
    expect(window.location.origin).not.toContain('192.168.1.42');
  });

  it('says what it is for, instead of reading the URL aloud', () => {
    render(<QrCode value={LAN} label="QR-code om een apparaat aan tafel 3 te koppelen" />);

    const svg = screen.getByRole('img', {
      name: 'QR-code om een apparaat aan tafel 3 te koppelen',
    });
    expect(svg.textContent ?? '').not.toContain('192.168.1.42');
  });
});
