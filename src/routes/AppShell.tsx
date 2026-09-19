import { Link, Outlet, useRouteError } from 'react-router';
import { ErrorPanel, LinkButton } from '@/ui/common/primitives';

export function AppShell() {
  return (
    <div className="min-h-dvh">
      <a
        href="#inhoud"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded-lg focus:bg-[--color-panel] focus:px-3 focus:py-2"
      >
        Naar de inhoud
      </a>

      <header className="border-b border-[--color-border] bg-[--color-panel]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Canasta
          </Link>
          <nav aria-label="Hoofdmenu" className="flex gap-1 text-sm">
            <Link to="/games" className="rounded-lg px-3 py-2 hover:bg-[--color-panel-muted]">
              Partijen
            </Link>
            <Link to="/settings" className="rounded-lg px-3 py-2 hover:bg-[--color-panel-muted]">
              Instellingen
            </Link>
          </nav>
        </div>
      </header>

      <main
        id="inhoud"
        className="mx-auto max-w-3xl px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
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
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <ErrorPanel title="Er ging iets mis">
        <p>Deze pagina kon niet worden geladen.</p>
        {message ? <p className="mt-2 text-xs text-[--color-ink-muted]">{message}</p> : null}
      </ErrorPanel>
      <LinkButton to="/" variant="primary">
        Naar het startscherm
      </LinkButton>
    </div>
  );
}

export function NotFoundRoute() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pagina niet gevonden</h1>
      <p className="text-[--color-ink-muted]">Deze pagina bestaat niet.</p>
      <LinkButton to="/" variant="primary">
        Naar het startscherm
      </LinkButton>
    </div>
  );
}
