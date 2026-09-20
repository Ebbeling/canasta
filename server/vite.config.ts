import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Builds the tournament server into one Node module.
 *
 * Vite is already in this project, so the server is bundled with the tool that
 * is here rather than a second one that is not. The point of bundling at all is
 * the `@/` alias: the server imports the application layer straight out of
 * `src/`, and Node has no idea what `@/domain/tournament` means. Resolving that
 * at build time is cheaper than teaching the runtime about it.
 *
 * Dependencies stay external — `zod` is loaded from `node_modules` like any
 * other Node program would — so what lands in `dist` is this project's own code
 * and nothing else.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    // A server that has to be read when something goes wrong at a club evening
    // is worth more than a few saved kilobytes.
    minify: false,
    sourcemap: true,
    rollupOptions: {
      output: { format: 'esm', entryFileNames: 'main.js' },
    },
  },
});
