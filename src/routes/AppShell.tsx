import { Outlet, useRouteError } from 'react-router';
import { DesktopRail } from '@/ui/app/DesktopRail';
import { PageBody } from '@/ui/app/Page';
import { RailStepsProvider } from '@/ui/app/RailStepsProvider';
import { ErrorPanel, LinkButton, PageTitle } from '@/ui/common/primitives';

/**
 * The frame every screen sits in.
 *
 * Below `md` this is what it always was: a phone-width column, with each screen
 * carrying its own header and the in-game destinations in a bottom bar.
 *
 * From `md` the design replaces that bar with a left rail, and everything to
 * the right of the rail belongs to the screen. `main` therefore has no width
 * and no padding of its own: a screen that wants a bar across the whole window
 * renders one, and a screen that wants a reading column asks for it. The shell
 * used to cap `main` itself, which quietly made every bar as narrow as the
 * text under it and left a wide window looking like a centred phone.
 */
export function AppShell() {
  return (
    <RailStepsProvider>
    <div className="min-h-dvh md:grid md:grid-cols-[auto_minmax(0,1fr)]">
      <a
        href="#inhoud"
        className="sr-only rounded-control bg-panel px-3 py-2 font-semibold shadow-soft focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
      >
        Naar de inhoud
      </a>

      <DesktopRail />

      <main id="inhoud" className="flex min-h-dvh w-full min-w-0 flex-col">
        <Outlet />
      </main>
    </div>
    </RailStepsProvider>
  );
}

export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : undefined;

  return (
    <PageBody>
      <div className="space-y-4 py-12">
        <PageTitle>Er ging iets mis</PageTitle>
        <ErrorPanel title="Deze pagina kon niet worden geladen.">
          {message ? <p className="mt-1 text-xs text-muted">{message}</p> : null}
        </ErrorPanel>
        <LinkButton to="/" variant="primary" size="lg" block>
          Naar het startscherm
        </LinkButton>
      </div>
    </PageBody>
  );
}

export function NotFoundRoute() {
  return (
    <PageBody>
      <div className="space-y-4 py-12">
        <PageTitle>Pagina niet gevonden</PageTitle>
        <p className="text-muted">Deze pagina bestaat niet.</p>
        <LinkButton to="/" variant="primary" size="lg" block>
          Naar het startscherm
        </LinkButton>
      </div>
    </PageBody>
  );
}
