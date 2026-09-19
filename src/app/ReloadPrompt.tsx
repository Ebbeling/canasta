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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[--color-border] bg-[--color-panel] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
        <p className="flex-1 text-sm">
          {needRefresh
            ? 'Er is een nieuwe versie beschikbaar.'
            : 'Klaar voor gebruik zonder internet.'}
        </p>

        {needRefresh ? (
          <>
            <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
              Nu bijwerken
            </Button>
            <Button onClick={() => setNeedRefresh(false)}>Later</Button>
          </>
        ) : (
          <Button onClick={() => setOfflineReady(false)}>Sluiten</Button>
        )}
      </div>
    </div>
  );
}
