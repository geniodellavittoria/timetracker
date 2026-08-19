import { expect, test } from '@playwright/test';

/**
 * Regression test for a bug where `applyWorkloadWith` in SettingsPage.tsx
 * multiplied the workload percent by 10 instead of 100 before computing the
 * weekly target, making the redistributed "Stunden pro Wochentag" values
 * (and the data that actually gets saved) 10x smaller than the "Wochenziel"
 * summary text right above them.
 */
test('distributes the weekly target correctly across working days', async ({ page }) => {
  const email = `e2e-${Date.now()}-${test.info().workerIndex}@example.test`;
  const password = 'a very good password';

  await page.goto('/register');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByLabel('Passwort bestätigen').fill(password);
  await page.getByRole('button', { name: 'Registrieren' }).click();

  await page.waitForURL(/\/weeks\//);
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();

  const workloadInputs = page.locator('.workload-inputs');
  await workloadInputs.getByLabel('Vollzeit-Woche').fill('40');
  await workloadInputs.getByLabel('Pensum').fill('80');

  // Uncheck Wednesday, leaving 4 working days (Mo, Di, Do, Fr) — the exact
  // scenario reported: 40h full-time at 80% over 4 days should be 32h/week,
  // 8h/day.
  await page.locator('.works-on').getByLabel('Mi', { exact: true }).uncheck();

  const result = page.locator('.workload-result');
  await expect(result).toContainText('32 Std 00 Min');
  await expect(result).toContainText('auf 4 Tage verteilt');
  await expect(result).toContainText('8 Std 00 Min');

  const mondayInput = page.getByLabel('Montag Zielstunden');
  await expect(mondayInput).toHaveValue('8');

  const mondayRow = page.locator('.weekday-row', { hasText: 'Montag' });
  await expect(mondayRow.locator('.weekday-note')).toContainText('8 Std 00 Min');

  const wednesdayRow = page.locator('.weekday-row', { hasText: 'Mittwoch' });
  await expect(wednesdayRow.locator('.weekday-note')).toContainText('Frei');

  await expect(page.locator('.weekly-total')).toContainText('32 Std 00 Min');
});
