import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

/**
 * De laaggrenzen onderaan dit bestand zijn de belangrijkste regels erin.
 * Zonder mechanische handhaving importeert `src/domain` binnen twee weken Dexie.
 * Zie CANASTA_PWA_SPECIFICATION.md §36.
 */
export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  // --- Laaggrens 1: de pure kern kent geen framework, geen opslag, geen browser.
  {
    files: ['src/domain/**', 'src/rules/**', 'src/scoring/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react-*',
            'dexie',
            'dexie-*',
            '@/storage/*',
            '@/ui/*',
            '@/routes/*',
            '@/application/*',
            '@/hooks/*',
          ],
        },
      ],
    },
  },

  // --- Laaggrens 2: use cases zijn gewone async functies, geen React.
  //     Ook geen @/storage: de application-laag kent alleen de repository-
  //     interfaces uit ports.ts, nooit de Dexie-implementatie eronder.
  {
    files: ['src/application/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react-*',
            'dexie',
            'dexie-*',
            '@/storage/*',
            '@/ui/*',
            '@/routes/*',
            '@/hooks/*',
            '@/app/*',
          ],
        },
      ],
    },
  },

  // --- Laaggrens 3: opslag bewaart en haalt op, meer niet.
  //     Geen scorelogica, geen regelinterpretatie, geen React.
  //     De storage-laag mag de rules-laag alleen voor *types* gebruiken; de
  //     evaluator, de regelsets en de validatie blijven erbuiten.
  {
    files: ['src/storage/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react-*',
            '@/scoring/*',
            '@/ui/*',
            '@/routes/*',
            '@/rules/builtin*',
            '@/rules/registry/*',
            '@/rules/validation/*',
            '@/rules/initialMeld/*',
            '@/rules/resolve/*',
            '@/rules/expression/*',
          ],
        },
      ],
    },
  },


  // --- Laaggrens 4: de UI kent geen spelregels, geen engine, geen opslag.
  //     Alles loopt via de application-laag; @/domain en @/rules/schema mogen
  //     wel, want dat zijn types zonder gedrag.
  {
    files: ['src/ui/**', 'src/routes/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'dexie',
            'dexie-react-hooks',
            '@/storage/*',
            '@/scoring/*',
            '@/rules/builtin*',
            '@/rules/registry/*',
            '@/rules/resolve/*',
            '@/rules/validation/*',
            '@/rules/initialMeld/*',
            '@/rules/expression/*',
          ],
        },
      ],
    },
  },

  // --- Laaggrens 5: alleen de hooks-laag kent live queries.
  {
    files: ['src/hooks/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'dexie',
            '@/storage/*',
            '@/scoring/*',
            '@/rules/builtin*',
            '@/rules/registry/*',
          ],
        },
      ],
    },
  },

  // --- Geen variant-schakelaars. De engine mag nooit op `family` beslissen;
  //     regelgedrag komt uit data of uit een module die op id wordt opgezocht.
  {
    files: ['src/scoring/**', 'src/application/**', 'src/ui/**', 'src/routes/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='family']",
          message:
            'Beslis nooit op ruleSet.family. Gebruik configuratie, capabilities of een rule module (zie spec §15).',
        },
      ],
    },
  },

  // Laatste blok, zodat het de laaggrenzen hierboven overschrijft: tests mogen
  // een echte database en echte regelsets opzetten om tegenaan te draaien. De
  // grenzen gelden voor productiecode, niet voor de testopstelling.
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-restricted-imports': 'off' },
  },
);
