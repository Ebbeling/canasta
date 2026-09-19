import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, Close } from '@/ui/common/icons';
import { IconButton } from '@/ui/common/primitives';

/**
 * The header every screen wears.
 *
 * One shape: an optional leading affordance, a centred title with an optional
 * second line, and an optional trailing action. The two side slots keep a fixed
 * width so the title stays optically centred whether or not they are filled.
 */
export function AppBar({
  title,
  subtitle,
  back,
  onBack,
  backLabel = 'Terug',
  dismiss = false,
  action,
  titleId,
  headingLevel = 'h1',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Where the leading affordance goes. Omit both to hide it. */
  back?: string;
  onBack?: () => void;
  backLabel?: string;
  /** Renders a close cross instead of a chevron — for a focus mode. */
  dismiss?: boolean;
  action?: ReactNode;
  titleId?: string;
  headingLevel?: 'h1' | 'h2';
}) {
  const navigate = useNavigate();
  const Heading = headingLevel;

  const hasBack = back !== undefined || onBack !== undefined;

  const leading = hasBack ? (
    <IconButton label={backLabel} onClick={() => (onBack ? onBack() : navigate(back ?? '/'))}>
      {dismiss ? <Close /> : <ChevronLeft />}
    </IconButton>
  ) : (
    <span className="size-10 shrink-0" aria-hidden="true" />
  );

  return (
    <div className="flex items-center gap-2 px-1 pt-3.5 pb-2">
      {leading}
      <div className="min-w-0 flex-1 text-center">
        <Heading id={titleId} className="truncate text-body font-semibold">
          {title}
        </Heading>
        {subtitle ? <div className="text-caption text-muted">{subtitle}</div> : null}
      </div>
      {action ?? <span className="size-10 shrink-0" aria-hidden="true" />}
    </div>
  );
}
