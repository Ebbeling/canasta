import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// `base` moet gelijk zijn aan de GitHub Pages-subpad, en moet overeenkomen met
// zowel de service-worker-scope als de `basename` van de router. Die drie zijn
// samen één instelling; zie CANASTA_PWA_SPECIFICATION.md §25.
const BASE = '/canasta/';

/**
 * Schrijft `dist/404.html` als kopie van `index.html`.
 *
 * GitHub Pages kent geen SPA-fallback, dus de *eerste* load van een diepe link
 * als /canasta/games levert een harde 404 op — nog voordat er een service
 * worker is die dat zou kunnen opvangen. Pages serveert dit bestand met status
 * 404, de browser voert de bundle gewoon uit en `location.pathname` blijft
 * intact, waarna de router de route alsnog oppakt.
 *
 * Bewust hier en niet als stap in de workflow: zo levert elke build hetzelfde
 * artefact op en is het lokaal te controleren. Een kopieerstap die alleen in CI
 * bestaat, is een verschil dat je pas in productie ontdekt.
 */
function spaFallback() {
  return {
    name: 'canasta:spa-fallback',
    apply: 'build' as const,
    closeBundle() {
      const outDir = resolve(process.cwd(), 'dist');
      const index = resolve(outDir, 'index.html');
      if (existsSync(index)) copyFileSync(index, resolve(outDir, '404.html'));
    },
  };
}

export default defineConfig({
  base: BASE,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    spaFallback(),
    tailwindcss(),
    VitePWA({
      // Niet 'autoUpdate': een herlaad midden in een ronde-invoer is storend.
      registerType: 'prompt',
      // We registreren expliciet via `useRegisterSW`; 'auto' zou een tweede,
      // stille registratie toevoegen.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        id: BASE,
        name: 'Canasta Puntentelling',
        short_name: 'Canasta',
        description: 'Offline scorekaart voor Canasta',
        lang: 'nl',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#12151b',
        theme_color: '#12151b',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        // Nooit midden in een ronde de controle overnemen.
        clientsClaim: false,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    // Standaard 'node': de domein-, regel- en score-tests hebben geen DOM nodig.
    // Tests die er wel een nodig hebben zetten bovenaan `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.ts'],
    /*
     * Ruimer dan de standaard vijf seconden.
     *
     * De servertests starten een echte HTTP-server met een echte database, en
     * die draaien parallel aan de zware jsdom-tests. Op een machine met twee
     * kernen — een CI-runner — haalt een jsdom-test die normaal een halve
     * seconde kost daardoor de standaardlimiet niet. Twintig seconden is nog
     * steeds kort genoeg om een test die écht hangt te laten falen.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**',
        'src/rules/**',
        'src/scoring/**',
        'src/application/**',
        'src/hooks/**',
      ],
    },
  },
});
