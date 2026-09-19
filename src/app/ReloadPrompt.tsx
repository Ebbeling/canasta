import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/ui/common/primitives';

/**
 * The update prompt.
 *
 * `registerType: 'prompt'` and `clientsClaim: false` together mean a new version
 * never takes over on its own — the app keeps running the loaded version until
 * the user taps. That matters most exactly when it would be worst: halfway
 * through entering a round.
 */
export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <div className="flex w-full max-w-page flex-wrap items-center gap-3 rounded-card border border-border bg-panel px-4 py-3.5 shadow-soft">
        <p className="flex-1 text-sm font-medium">
          {needRefresh
            ? 'Er is een nieuwe versie beschikbaar.'
            : 'Klaar voor gebruik zonder internet.'}
        </p>

        {needRefresh ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>
              Later
            </Button>
            <Button variant="primary" size="sm" onClick={() => void updateServiceWorker(true)}>
              Nu bijwerken
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setOfflineReady(false)}>
            Sluiten
          </Button>
        )}
      </div>
    </div>
  );
}
