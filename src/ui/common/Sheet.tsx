import { useCallback, useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A bottom sheet, the design's one modal shape.
 *
 * It is a real dialog: labelled, modal, closed by Escape or by the scrim, and
 * it keeps focus inside while it is open. On a small screen a sheet beats a
 * centred dialog — it stays within thumb reach and never clips.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  labelledBy,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  /** Rendered as the sheet's heading unless `labelledBy` points elsewhere. */
  title?: string;
  description?: ReactNode;
  /** A decorative tile above the heading — used to mark a destructive step. */
  icon?: ReactNode;
  children: ReactNode;
  labelledBy?: string;
  /**
   * Where focus should land instead of the panel itself. A destructive dialog
   * points this at its cancel button, so the safe choice is the one already
   * under the user's fingers.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const descriptionId = useId();

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panel.current) return;

      const targets = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (targets.length === 0) return;

      const first = targets[0]!;
      const last = targets.at(-1)!;
      const active = document.activeElement;

      // A plain wrap-around trap; the sheet is small enough that nothing else
      // is needed, and it keeps a screen reader from wandering into the page.
      if (event.shiftKey && (active === first || !panel.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey, true);

    // Focus the sheet itself rather than its first control: the heading is read
    // first, so the user hears what opened before what they can do about it.
    // A dialog that names a safer starting point wins.
    (initialFocusRef?.current ?? panel.current)?.focus();

    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
    // `initialFocusRef` is a ref object, so its identity is stable and listing
    // it here does not re-run the effect on every render.
  }, [open, handleKey, initialFocusRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* The scrim is decorative; Escape and the sheet's own buttons are the
          documented ways out, so it carries no role of its own. */}
      <div
        className="absolute inset-0 animate-scrim bg-dim"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? headingId : undefined)}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-page animate-sheet rounded-t-sheet bg-panel px-5 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+1.375rem)] shadow-sheet outline-none sm:mb-6 sm:rounded-b-sheet"
      >
        <div className="mx-auto mb-3.5 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        {icon ? <div className="mb-3.5">{icon}</div> : null}
        {title ? (
          <h2 id={headingId} className="font-display text-2xl leading-snug tracking-title">
            {title}
          </h2>
        ) : null}
        {description ? (
          <div id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted text-pretty">
            {description}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
