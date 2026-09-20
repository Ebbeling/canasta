import { PageBody } from '@/ui/app/Page';
import { EmptyState, LinkButton } from '@/ui/common/primitives';

export function TournamentNotFound() {
  return (
    <PageBody>
      <div className="py-6">
        <EmptyState
          title="Dit toernooi bestaat niet meer."
          description="Mogelijk is het verwijderd op dit apparaat."
          action={
            <LinkButton to="/tournaments" variant="primary" size="lg" block>
              Naar de toernooien
            </LinkButton>
          }
        />
      </div>
    </PageBody>
  );
}
