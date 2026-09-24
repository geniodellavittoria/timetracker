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
