import { useEffect, useRef, useState } from 'react';
import type { FieldVM } from '@/application/viewmodels/roundForm';
import { Backspace } from '@/ui/common/icons';
import { Sheet } from '@/ui/common/Sheet';
import { Button, SectionLabel } from '@/ui/common/primitives';

/**
 * The thumb-sized way to enter points.
 *
 * Card scores are typed in tens and hundreds while holding a fan of cards, so
 * the sheet offers quick additions derived from the field's own `step` as well
 * as a plain pad. It is an alternative to the field's input, never the only way
 * in: the input behind it stays focusable, labelled and typeable.
 *
 * Every keystroke commits. There is no "cancel" in the design, and committing
 * live keeps the breakdown and the draft in step with what is on screen.
 */
export function NumberPad({
  open,
  onClose,
  field,
  context,
  value,
  onCommit,
}: {
  open: boolean;
  onClose: () => void;
  field: FieldVM;
  context?: string;
  value: number;
  onCommit: (next: number) => void;
}) {
  // A string, because "0" → "4" must replace rather than add, and a half-typed
  // "-" is a real state while the user is still going.
  const [draft, setDraft] = useState(String(value));
  // The same value in a ref. Two quick taps land in separate events that both
  // read state from the same render, so reading `draft` directly would drop the
  // first digit — on a pad meant to be tapped fast, that is the whole point.
  const draftRef = useRef(draft);

  useEffect(() => {
    if (!open) return;
    draftRef.current = String(value);
    setDraft(String(value));
    // Only on open: re-syncing on every commit would fight the typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const step = field.step ?? 1;
  const quickAdds = [1, 2, 4, 10].map((multiplier) => step * multiplier);

  function push(next: string) {
    const cleaned = next === '' || next === '-' ? '0' : next;
    draftRef.current = next;
    setDraft(next);
    onCommit(Number(cleaned));
  }

  function digit(d: string) {
    const current = draftRef.current;
    push(current === '0' ? d : `${current}${d}`.slice(0, 7));
  }

  function add(amount: number) {
    push(String(Number(draftRef.current || '0') + amount));
  }

  const key =
    'flex min-h-14 items-center justify-center rounded-control font-display text-2xl font-semibold ' +
    'tabular transition-colors active:bg-border';

  return (
    <Sheet open={open} onClose={onClose} title={field.label}>
      <div className="mt-1 flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between gap-3">
          {context ? <SectionLabel as="div">{context}</SectionLabel> : <span />}
          {step > 1 ? (
            <span className="text-caption text-muted">stappen van {step}</span>
          ) : null}
        </div>

        <div
          className="flex items-center justify-end gap-2 rounded-btn bg-panel2 px-4.5 py-3"
          aria-live="polite"
        >
          <span className="font-display text-5xl font-semibold leading-none tabular tracking-display">
            {draft === '' ? '0' : draft}
          </span>
          <span aria-hidden="true" className="h-10 w-0.5 self-center rounded-full bg-accent" />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {quickAdds.map((amount) => (
            <Button
              key={amount}
              size="md"
              className="rounded-tile text-sm"
              onClick={() => add(amount)}
            >
              +{amount}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" className={`${key} bg-surface`} onClick={() => digit(d)}>
              {d}
            </button>
          ))}
          <button
            type="button"
            className={`${key} text-sm text-muted`}
            onClick={() => push('0')}
          >
            Wis
          </button>
          <button type="button" className={`${key} bg-surface`} onClick={() => digit('0')}>
            0
          </button>
          <button
            type="button"
            aria-label="Laatste cijfer wissen"
            className={`${key} text-muted`}
            onClick={() => push(draftRef.current.slice(0, -1))}
          >
            <Backspace />
          </button>
        </div>

        <Button variant="primary" size="lg" block onClick={onClose}>
          Klaar
        </Button>
      </div>
    </Sheet>
  );
}
