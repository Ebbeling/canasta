import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * The install prompt.
 *
 * iOS fires no `beforeinstallprompt` at all, so it gets an instruction hint
 * instead of a button that would never appear.
 */
export function usePwaInstall(): {
  canInstall: boolean;
  iosHint: boolean;
  promptInstall: () => Promise<void>;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | undefined>();
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(undefined);
    };

    globalThis.addEventListener('beforeinstallprompt', onPrompt);
    globalThis.addEventListener('appinstalled', onInstalled);
    return () => {
      globalThis.removeEventListener('beforeinstallprompt', onPrompt);
      globalThis.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const standalone =
    globalThis.matchMedia?.('(display-mode: standalone)').matches ||
    (globalThis.navigator as { standalone?: boolean } | undefined)?.standalone === true;

  const isIos = /iPad|iPhone|iPod/.test(globalThis.navigator?.userAgent ?? '');

  return {
    canInstall: Boolean(deferred) && !installed && !standalone,
    iosHint: isIos && !standalone,
    async promptInstall() {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(undefined);
    },
  };
}
