import { expect, test } from '@playwright/test';

/**
 * Setting a Ferien allowance and marking a day as Ferien must show up as one
 * used day, both in the Settings section and in the header badge.
 */
test('a Ferien day counts against the configured allowance', async ({ page }) => {
  const email = `e2e-${Date.now()}-${test.info().workerIndex}-vacation@example.test`;
  const password = 'a very good password';

  await page.goto('/register');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByLabel('Passwort bestätigen').fill(password);
  await page.getByRole('button', { name: 'Registrieren' }).click();
  await page.waitForURL(/\/weeks\//);

  await page.getByRole('link', { name: 'Einstellungen' }).click();
  const card = page.locator('#vacation-card');
  await card.locator('summary').click();
  await card.getByLabel('Ferientage').fill('25');
  await card.getByRole('button', { name: 'Ferienanspruch speichern' }).click();
  await expect(card.locator('.saved-tick')).toBeVisible();
  await expect(page.locator('.vacation-badge')).toContainText('25 übrig');

  // Today if it's a workday (taken), otherwise next Monday (planned). Both
  // count as used, and both stay inside the default Pensum period.
  await page.getByRole('link', { name: 'Woche' }).click();
  const weekday = (new Date().getDay() + 6) % 7; // 0 = Monday
  let row = page.locator('.day-row', { hasText: 'Heute' });
  if (weekday >= 5) {
    await page.getByRole('button', { name: 'Nächste Periode' }).click();
    row = page.locator('.day-row').first();
  }
  await row.locator('.day-type').selectOption('vacation');
  await expect(row.locator('.saved-tick')).toBeVisible();

  await expect(page.locator('.vacation-badge')).toContainText('24 übrig');
  await page.locator('.vacation-badge').click();
  await expect(page.locator('#vacation-card')).toHaveAttribute('open', '');
  await expect(page.locator('#vacation-card .chart-legend')).toContainText('verbleibend 24');
});

/**
 * Each Ferien year keeps its own saved allowance when paging back and forth,
 * also when paging faster than the years load.
 */
test('a saved allowance survives switching Ferien years', async ({ page }) => {
  const email = `e2e-${Date.now()}-${test.info().workerIndex}-years@example.test`;
  const password = 'a very good password';

  await page.goto('/register');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByLabel('Passwort bestätigen').fill(password);
  await page.getByRole('button', { name: 'Registrieren' }).click();
  await page.waitForURL(/\/weeks\//);

  await page.getByRole('link', { name: 'Einstellungen' }).click();
  const card = page.locator('#vacation-card');
  await card.locator('summary').click();
  const days = card.getByRole('spinbutton', { name: 'Ferientage' });
  const save = card.getByRole('button', { name: 'Ferienanspruch speichern' });
  const next = card.getByRole('button', { name: 'Nächstes Ferienjahr' });
  const prev = card.getByRole('button', { name: 'Vorheriges Ferienjahr' });

  await days.fill('25');
  await save.click();
  await expect(card.locator('.saved-tick')).toBeVisible();

  await next.click();
  await expect(card.locator('summary')).toContainText('kein Anspruch erfasst');
  await days.fill('20');
  await save.click();
  await expect(card.locator('.saved-tick')).toBeVisible();

  await prev.click();
  await expect(days).toHaveValue('25');
  await expect(card.locator('summary')).toContainText('von 25 Tagen');
  await next.click();
  await expect(days).toHaveValue('20');

  // Without waiting for any year to load in between.
  await prev.click();
  await prev.click();
  await next.click();
  await expect(days).toHaveValue('25');
  await next.click();
  await expect(days).toHaveValue('20');
  await expect(card.locator('summary')).toContainText('von 20 Tagen');
});

/**
 * Booking a range fills only the empty workdays unless overwriting is ticked,
 * and removing it deletes only the Ferien. 2030-W10 (Mon 4 – Sun 10 Mar) is
 * always inside a new account's default Pensum period, whenever this runs.
 */
test('books and removes Ferien over a date range', async ({ page }) => {
  const email = `e2e-${Date.now()}-${test.info().workerIndex}-range@example.test`;
  const password = 'a very good password';

  await page.goto('/register');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByLabel('Passwort bestätigen').fill(password);
  await page.getByRole('button', { name: 'Registrieren' }).click();
  await page.waitForURL(/\/weeks\//);

  // An Arbeit entry on Wednesday that booking must respect.
  const status = await page.evaluate(() => fetch('/api/entries/2030-03-06', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dayType: 'normal', blocks: [{ arrival: '08:00', leave: '17:00', breakMinutes: 30 }], note: null }),
  }).then((r) => r.status));
  expect(status).toBe(201);

  await page.getByRole('link', { name: 'Einstellungen' }).click();
  const card = page.locator('#vacation-card');
  await card.locator('summary').click();
  const range = card.locator('.vacation-range');
  await range.getByLabel('Von').fill('2030-03-04');
  await range.getByLabel('Bis').fill('2030-03-10');

  await expect(range.locator('.period-history')).toContainText('Arbeit erfasst');
  await range.getByRole('button', { name: '4 Tage als Ferien eintragen' }).click();
  await expect(range.locator('.saved-tick')).toContainText('4 Tage eingetragen');

  const types = async () => {
    await page.goto('/weeks/2030-W10');
    await expect(page.locator('.day-row').first().locator('.day-type')).toBeVisible();
    return page.locator('.day-row').evaluateAll((rows) =>
      rows.map((r) => (r.querySelector('select.day-type') as HTMLSelectElement | null)?.value ?? 'frei'));
  };
  expect(await types()).toEqual(['vacation', 'vacation', 'normal', 'vacation', 'vacation', 'frei', 'frei']);

  const reopen = async () => {
    await page.goto('/settings#vacation-card');
    await range.getByLabel('Von').fill('2030-03-04');
    await range.getByLabel('Bis').fill('2030-03-10');
  };

  await reopen();
  await range.getByLabel('Bestehende Arbeitstage überschreiben').check();
  await range.getByRole('button', { name: '1 Tag als Ferien eintragen' }).click();
  await expect(range.locator('.saved-tick')).toBeVisible();
  expect(await types()).toEqual(['vacation', 'vacation', 'vacation', 'vacation', 'vacation', 'frei', 'frei']);

  await reopen();
  await range.getByRole('button', { name: '5 Ferientage entfernen' }).click();
  await expect(range.locator('.saved-tick')).toContainText('5 Tage entfernt');
  // Every workday is empty again — including Wednesday, whose Arbeit entry was overwritten.
  expect(await types()).toEqual(['normal', 'normal', 'normal', 'normal', 'normal', 'frei', 'frei']);
});
