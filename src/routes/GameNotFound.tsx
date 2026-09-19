import { PageBody } from '@/ui/app/Page';
import { EmptyState, LinkButton } from '@/ui/common/primitives';

export function GameNotFound() {
  return (
    <PageBody>
      <div className="py-6">
      <EmptyState
        title="Deze partij bestaat niet meer."
        description="Mogelijk is hij verwijderd op dit apparaat."
        action={
          <LinkButton to="/games" variant="primary" size="lg" block>
            Naar het overzicht
          </LinkButton>
        }
      />
      </div>
    </PageBody>
  );
}
