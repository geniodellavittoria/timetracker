/**
 * Fails the build if wrangler.jsonc still carries the placeholder database id.
 *
 * Runs automatically via the `predeploy` npm script. Without it, deploying with
 * the placeholder succeeds and the app only breaks at runtime, with a D1 error
 * that doesn't obviously point back at this line of config.
 */
import { readFileSync } from 'node:fs';

const CONFIG = new URL('../wrangler.jsonc', import.meta.url);
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

const source = readFileSync(CONFIG, 'utf8');
const match = /"database_id"\s*:\s*"([^"]*)"/.exec(source);

if (!match) {
  fail('No `database_id` found in wrangler.jsonc.');
}

const id = match[1];

if (id === PLACEHOLDER || /^[0-]+$/.test(id)) {
  fail(
    'wrangler.jsonc still has the placeholder `database_id`.\n\n' +
    '  Create the database and copy the id it prints:\n' +
    '      npx wrangler d1 create timetracker\n\n' +
    '  Then replace the zeros in wrangler.jsonc, and apply the schema:\n' +
    '      npm run db:remote',
  );
}

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  fail(`\`database_id\` is not a UUID: ${JSON.stringify(id)}`);
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}
