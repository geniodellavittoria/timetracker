import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const alias = {
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
  '@client': fileURLToPath(new URL('./src/client', import.meta.url)),
  '@worker': fileURLToPath(new URL('./src/worker', import.meta.url)),
};

// Read at config time in Node, handed to the Worker as a binding and applied in
// the setup file — the same migration files wrangler ships to production.
const migrations = await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url)));

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'shared',
          environment: 'node',
          include: ['test/shared/**/*.test.ts'],
        },
      },
      {
        plugins: [
          cloudflareTest({
            // Reuse the real wrangler config so test bindings match production.
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              compatibilityFlags: ['nodejs_compat'],
              bindings: { TEST_MIGRATIONS: migrations },
            },
          }),
        ],
        resolve: { alias },
        test: {
          name: 'worker',
          include: ['test/worker/**/*.test.ts'],
          setupFiles: ['./test/worker/setup.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'client',
          environment: 'happy-dom',
          include: ['test/client/**/*.test.tsx'],
          setupFiles: ['./test/client/setup.ts'],
        },
      },
    ],
  },
});
