import { expect, test } from '@playwright/test';

async function registerFreshUser(page: import('@playwright/test').Page, suffix: string) {
  const email = `e2e-${Date.now()}-${test.info().workerIndex}-${suffix}@example.test`;
  const password = 'a very good password';

  await page.goto('/register');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByLabel('Passwort bestätigen').fill(password);
  await page.getByRole('button', { name: 'Registrieren' }).click();
  await page.waitForURL(/\/weeks\//);
}

/**
 * Regression test for a bug where `applyWorkloadWith` in SettingsPage.tsx
 * multiplied the workload percent by 10 instead of 100 before computing the
 * weekly target, making the redistributed "Stunden pro Wochentag" values
 * (and the data that actually gets saved) 10x smaller than the "Wochenziel"
 * summary text right above them.
 */
test('distributes the weekly target correctly across working days', async ({ page }) => {
  await registerFreshUser(page, 'a');

  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();

  const currentCard = page.locator('#current-period-card');
  await currentCard.getByLabel('Vollzeit-Woche').fill('40');
  await currentCard.getByLabel('Pensum').fill('80');

  // Uncheck Wednesday, leaving 4 working days (Mo, Di, Do, Fr) — the exact
  // scenario reported: 40h full-time at 80% over 4 days should be 32h/week,
  // 8h/day.
  await currentCard.locator('.works-on').getByLabel('Mi', { exact: true }).uncheck();

  const result = currentCard.locator('.workload-result');
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

/**
 * The core promise of dated Pensum periods: a period only governs its own
 * date range. Creating one backdated to 2026-01-01 must change the target
 * for a day in that range without touching the account's original
 * (Aug-1-provisioned) period or the days it still covers.
 */
test('a backdated period only changes balances within its own range', async ({ page }) => {
  await registerFreshUser(page, 'b');

  await page.getByRole('link', { name: 'Einstellungen' }).click();

  const scheduleCard = page.locator('#schedule-period-card');
  await scheduleCard.getByLabel('Gültig ab').fill('2026-01-01');
  await scheduleCard.getByLabel('Vollzeit-Woche').fill('40');
  await scheduleCard.getByLabel('Pensum').fill('50');
  await scheduleCard.getByRole('button', { name: 'Periode anlegen' }).click();

  await expect(page.locator('.period-history')).toContainText('ab 01.01.2026');

  // Week 2026-W06 (~early Feb) falls inside the new period's range but well
  // before the account's original period (provisioned at this-or-last
  // year's Aug 1), so only the new 50% (4h/day over Mon–Fri) applies here.
  await page.goto('/weeks/2026-W06');
  const mondayRow = page.locator('.day-row').first();
  await mondayRow.getByLabel('Kommen').fill('08:00');
  await mondayRow.getByLabel('Gehen').fill('12:00');

  await expect(mondayRow.locator('.day-balance')).toContainText('±0 Std 00 Min');
});
