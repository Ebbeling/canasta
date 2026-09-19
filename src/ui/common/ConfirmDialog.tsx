import { useRef, type ReactNode } from 'react';
import { Sheet } from './Sheet';
import { Button } from './primitives';

/**
 * The app's dialogs, so nothing ever falls back to `window.confirm`.
 *
 * Both shapes are the same `Sheet` the rest of the app already uses for modal
 * surfaces — one modal system, one set of tokens, one focus trap. What these
 * add is the standard action row and the wording conventions: the action that
 * continues sits on top where the thumb is, the way out sits underneath, and a
 * destructive action is coloured and focused so it can never be the accident.
 */

export type DialogTone = 'default' | 'danger';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Annuleren',
  onConfirm,
  onCancel,
  tone = 'default',
  icon,
  busy = false,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** The action that goes ahead, named after what it does. */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Also what Escape and the scrim do: backing out is always the safe path. */
  onCancel: () => void;
  tone?: DialogTone;
  icon?: ReactNode;
  busy?: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const danger = tone === 'danger';

  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      icon={icon}
      // A destructive dialog opens with focus on the way out, not on the
      // deletion. Everywhere else the panel keeps focus so the heading reads
      // first, which is the existing behaviour for every sheet in the app.
      initialFocusRef={danger ? cancelRef : undefined}
    >
      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant={danger ? 'danger' : 'primary'}
          size="lg"
          block
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button ref={cancelRef} variant="ghost" size="lg" block onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * One message and one way out — for something the user is told, not asked.
 */
export function AlertDialog({
  open,
  title,
  description,
  onClose,
  closeLabel = 'OK',
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description}>
      <div className="mt-4">
        <Button variant="primary" size="lg" block onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
    </Sheet>
  );
}
