import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * A QR code, drawn as SVG.
 *
 * SVG rather than a canvas or an image so it is sharp on whatever the organiser
 * holds it up on, prints properly, and needs no ref, no effect and no cleanup.
 * The modules are emitted as one `<path>`: a few hundred separate rectangles is
 * a lot of DOM for something that never changes.
 *
 * `currentColor` on purpose — the code inherits the text colour and is
 * therefore correct in both themes without a second palette. The light quiet
 * zone comes from the card behind it, which is why the four-module margin the
 * specification asks for is drawn rather than assumed.
 */
export function QrCode({
  value,
  size = 200,
  label,
  className = '',
}: {
  value: string;
  /** Rendered edge length in pixels. The code itself stays resolution-free. */
  size?: number;
  /** What a screen reader should say instead of reading the URL aloud. */
  label: string;
  className?: string;
}) {
  const { path, extent } = useMemo(() => {
    // Type 0 lets the library pick the smallest version that fits; 'M' recovers
    // about 15% of the code, which is the usual choice for a screen that may be
    // photographed at an angle in a badly lit club room.
    const code = qrcode(0, 'M');
    code.addData(value);
    code.make();

    const count = code.getModuleCount();
    const margin = 4;
    const parts: string[] = [];

    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (code.isDark(row, column)) {
          parts.push(`M${column + margin} ${row + margin}h1v1h-1z`);
        }
      }
    }

    return { path: parts.join(''), extent: count + margin * 2 };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={`rounded-control bg-white p-2 text-black ${className}`}
      shapeRendering="crispEdges"
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
