import { Outlet } from 'react-router';

/**
 * The frame a table device sits in.
 *
 * Deliberately almost nothing: no rail, no bottom bar, no link to anywhere else
 * in the app. A device paired to table 3 is a table, not an organiser with a
 * shortcut, and the surest way to keep it that way is to give it no navigation
 * at all.
 *
 * Portrait phone first, with a comfortable reading column on a tablet. The
 * screens inside keep their own spacing; this only sets the page.
 */
export function TableShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <a
        href="#tafel"
        className="sr-only rounded-control bg-panel px-3 py-2 font-semibold shadow-soft focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
      >
        Naar de inhoud
      </a>

      <main id="tafel" className="flex min-h-dvh w-full min-w-0 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
