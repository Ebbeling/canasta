import { EmptyState, LinkButton } from '@/ui/common/primitives';

export function GameNotFound() {
  return (
    <EmptyState
      title="Deze partij bestaat niet meer."
      description="Mogelijk is hij verwijderd op dit apparaat."
      action={
        <LinkButton to="/games" variant="primary">
          Naar het overzicht
        </LinkButton>
      }
    />
  );
}
