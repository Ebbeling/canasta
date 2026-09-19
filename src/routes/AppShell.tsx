import { Outlet, useRouteError } from 'react-router';
import { ErrorPanel, LinkButton, PageTitle } from '@/ui/common/primitives';

/**
 * The frame every screen sits in.
 *
 * Deliberately thin: the design gives each screen its own header — a big title
 * on the home screen, a centred bar with a back affordance everywhere else —
 * so a single global navigation bar would only compete with it. What stays here
 * is the skip link, the page column and the safe-area padding.
 *
 * The column is phone-width at every size. This is a scorecard used one-handed
 * beside a table of cards; stretching it across a desktop window would make the
 * scores harder to read, not easier.
 */
export function AppShell() {
  return (
    <div className="min-h-dvh">
      <a
        href="#inhoud"
        className="sr-only rounded-control bg-panel px-3 py-2 font-semibold shadow-soft focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
      >
        Naar de inhoud
      </a>

      <main
        id="inhoud"
        className="mx-auto flex min-h-dvh w-full max-w-page flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6"
      >
        <Outlet />
      </main>
    </div>
  );
}

export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : undefined;

  return (
    <div className="mx-auto w-full max-w-page space-y-4 px-4 py-12">
      <PageTitle>Er ging iets mis</PageTitle>
      <ErrorPanel title="Deze pagina kon niet worden geladen.">
        {message ? <p className="mt-1 text-xs text-muted">{message}</p> : null}
      </ErrorPanel>
      <LinkButton to="/" variant="primary" size="lg" block>
        Naar het startscherm
      </LinkButton>
    </div>
  );
}

export function NotFoundRoute() {
  return (
    <div className="space-y-4 py-12">
      <PageTitle>Pagina niet gevonden</PageTitle>
      <p className="text-muted">Deze pagina bestaat niet.</p>
      <LinkButton to="/" variant="primary" size="lg" block>
        Naar het startscherm
      </LinkButton>
    </div>
  );
}
