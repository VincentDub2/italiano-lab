import { test, expect } from '@playwright/test';

const base = process.env.ITALIANO_TEST_URL || 'http://127.0.0.1:3211';
test.use({ timezoneId: 'America/Los_Angeles' });

test('calendrier : sélection, navigation, rappels multiples et dates de Rome', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Preserve TZDate subclasses when freezing the clock.
  await page.addInitScript(() => {
    const timestamp = new Date('2026-11-06T23:30:00Z').getTime();
    globalThis.Date = new Proxy(Date, {
      construct(target, args, newTarget) {
        return Reflect.construct(target, args.length ? args : [timestamp], newTarget);
      },
      get(target, property) {
        return property === 'now' ? () => timestamp : Reflect.get(target, property);
      },
    });
  });
  await page.route('**/api/revision-calendar', route => route.fulfill({ json: { state: 'available', reminders: [
    { theme: 'Salutations', step: 'J3', date: '2026-11-03', due: true },
    { theme: 'Au marché', step: 'J1', date: '2026-11-07', due: true },
    { theme: 'Les nombres', step: 'J3', date: '2026-11-07', due: true },
    { theme: 'Piacere', step: 'J7', date: '2026-11-11', due: false },
    { theme: 'Les voyages', step: 'J14', date: '2026-12-04', due: false },
  ].map((reminder,index)=>({...reminder,id:String(index),source:'external'})) } }));
  await page.goto(base);
  const section = page.getByRole('region', { name: 'Rappels thématiques' });
  await expect(section.getByRole('heading', { name: 'samedi 7 novembre 2026' })).toBeVisible();
  await expect(section.getByRole('button', { name: 'samedi 7 novembre 2026, 2 rappels', exact: true })).toHaveText('7');
  await expect(section.getByRole('gridcell', { selected: true })).toHaveAttribute('data-day', '2026-11-07');
  await expect(section.getByRole('list', { name: 'Rappels du jour' }).getByRole('listitem')).toHaveCount(2);
  await expect(section.getByText('Au marché', { exact: true })).toBeVisible();
  await expect(section.getByText('4 rappels ce mois-ci')).toBeVisible();
  await section.getByRole('button', { name: 'mardi 3 novembre 2026, 1 rappel', exact: true }).click();
  await expect(section.getByText('Salutations', { exact: true })).toBeVisible();
  await expect(section.getByText('Calendrier externe · Date passée', { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Aujourd’hui', exact: true }).click();
  await section.getByRole('button', { name: 'Piacere · J7 mercredi 11 novembre 2026', exact: true }).click();
  await expect(section.getByRole('list', { name: 'Rappels du jour' })).toContainText('Piacere');
  const day = section.getByRole('button', { name: 'mercredi 11 novembre 2026, 1 rappel', exact: true });
  await day.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(section.getByRole('heading', { name: 'jeudi 12 novembre 2026' })).toBeVisible();
  await expect(section.getByText('Aucun rappel ce jour-là.')).toBeVisible();
  await section.getByRole('button', { name: 'Mois suivant', exact: true }).click();
  await expect(section.getByRole('grid', { name: 'décembre 2026' })).toBeVisible();
  await section.getByRole('button', { name: 'vendredi 4 décembre 2026, 1 rappel', exact: true }).click();
  await expect(section.getByText('Les voyages', { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Mois précédent', exact: true }).click();
  await expect(section.getByRole('grid', { name: 'novembre 2026' })).toBeVisible();
  await section.getByRole('button', { name: 'Aujourd’hui', exact: true }).click();
  await section.screenshot({ path: 'artifacts/reminders-calendar-desktop.png' });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await section.screenshot({ path: 'artifacts/reminders-calendar-mobile.png' });
  await expect(section.getByText('Les rappels externes signalent les cours prévus', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Séances', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('calendrier : données absentes, calendrier vide et erreur', async ({ page }) => {
  const section = page.getByRole('region', { name: 'Rappels thématiques' });
  await page.route('**/api/revision-calendar', route => route.fulfill({ json: { state: 'available', reminders: [] } }));
  await page.goto(base);
  await expect(section.getByText('Aucun rappel dans le calendrier.')).toBeVisible();
  await expect(section.getByRole('grid')).toBeVisible();
  await page.unroute('**/api/revision-calendar');
  await page.route('**/api/revision-calendar', route => route.fulfill({ json: { state: 'missing', reminders: [] } }));
  await page.reload();
  await expect(section.getByText('Aucune donnée de rappels disponible : fichier introuvable.')).toBeVisible();
  await page.unroute('**/api/revision-calendar');
  await page.route('**/api/revision-calendar', route => route.fulfill({ status: 500 }));
  await page.reload();
  await expect(section.getByRole('alert')).toContainText('indisponible');
});
