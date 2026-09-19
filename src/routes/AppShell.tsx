import { Outlet, useRouteError } from 'react-router';
import { DesktopRail } from '@/ui/app/DesktopRail';
import { ErrorPanel, LinkButton, PageTitle } from '@/ui/common/primitives';

/**
 * The frame every screen sits in.
 *
 * Below `md` this is what it always was: a phone-width column, with each screen
 * carrying its own header and the in-game destinations in a bottom bar.
 *
 * From `md` the design replaces that bar with a left rail and gives the content
 * a reading column of 880px inside 48px of page padding — not a stretched
 * phone. A screen that wants more room for a wide arrangement marks itself with
 * `data-wide`, and the column grows to the 960px the design uses for round
 * entry; `:has()` keeps that decision with the screen that knows it, without
 * threading a prop through the router. A browser without `:has()` simply keeps
 * the 880px column, which is a narrower layout rather than a broken one.
 */
export function AppShell() {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[auto_minmax(0,1fr)]">
      <a
        href="#inhoud"
        className="sr-only rounded-control bg-panel px-3 py-2 font-semibold shadow-soft focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
      >
        Naar de inhoud
      </a>

      <DesktopRail />

      <main
        id="inhoud"
        className="mx-auto flex min-h-dvh w-full max-w-page flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 md:max-w-[61rem] md:px-12 md:pb-10 md:pt-5 md:has-[[data-wide]]:max-w-[66rem]"
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
