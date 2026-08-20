import { expect, test } from '@playwright/test';

/**
 * Applying a canton's holiday template must create ordinary `holiday`
 * entries the user can see and edit — proves the whole path (client-side
 * date computation, existing-entry check, per-date PUT, refetch) against the
 * real API/DB, the way the Pensum-periods e2e suite already does.
 */
test('applying a canton template creates an editable holiday entry', async ({ page }) => {
  const email = `e2e-${Date.now()}-${test.info().workerIndex}-holiday@example.test`;
  const password = 'a very good password';

  await page.goto('/register');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByLabel('Passwort bestätigen').fill(password);
  await page.getByRole('button', { name: 'Registrieren' }).click();
  await page.waitForURL(/\/weeks\//);

  await page.getByRole('link', { name: 'Einstellungen' }).click();

  // "Feiertage" starts collapsed — only "Pensum" is open by default.
  const holidayCard = page.locator('#holiday-template-card');
  await holidayCard.locator('summary').click();
  await holidayCard.getByLabel('Kanton').selectOption('ZH');

  await expect(holidayCard.locator('.period-history')).toContainText('Nationalfeiertag');
  await holidayCard.getByRole('button', { name: /Feiertage anwenden/ }).click();
  await expect(holidayCard.locator('.saved-tick')).toBeVisible();

  // 2026-08-01 (Nationalfeiertag, every canton) is a Saturday, in week 2026-W31.
  await page.goto('/weeks/2026-W31');
  const dayRow = page.locator('.day-row', { hasText: '1. Aug' });
  await expect(dayRow.locator('.day-type')).toHaveValue('holiday');
  await expect(dayRow.getByLabel('Notiz')).toHaveValue('Nationalfeiertag');
});
