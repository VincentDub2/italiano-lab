import { test, expect } from '@playwright/test';
import type { Exercise } from '../src/components/sessions';

const base = process.env.ITALIANO_TEST_URL || 'http://127.0.0.1:3211';
test.use({ timezoneId: 'America/Los_Angeles' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T23:30:00Z'));
  await page.route('**/api/revision-calendar', route => route.fulfill({ json: { state: 'missing', reminders: [] } }));
  await page.route('**/api/feedback', route => route.fulfill({ json: [] }));
});

test('séances à faire : aujourd’hui, jours précédents, accès à toutes et mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const session = { objective: 'Retrouver les expressions utiles au quotidien.', source: 'prof', total: 3, pending: 0, exercises: [] };
  await page.route('**/api/sessions', route => route.fulfill({ json: [
    { ...session, id: 'future', title: 'Les voyages', scheduled_date: '2026-11-09', completed: 0 },
    { ...session, id: 'today', title: 'Salutations du jour', scheduled_date: '2026-11-07', completed: 0 },
    { ...session, id: 'pending', title: 'Texte envoyé au professeur', scheduled_date: '2026-11-07', completed: 3, pending: 1 },
    { ...session, id: 'previous', title: 'Au marché', scheduled_date: '2026-11-06', completed: 1, pending: 1 },
    { ...session, id: 'done', title: 'Les nombres terminés', scheduled_date: '2026-11-05', completed: 3 },
  ] }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  const section = page.getByRole('region', { name: 'Votre pratique' });
  await expect(section.getByRole('heading', { name: 'Aujourd’hui', exact: true })).toBeVisible();
  await expect(section.getByRole('heading', { name: 'À rattraper', exact: true })).toBeVisible();
  await expect(section.getByRole('button', { name: /Salutations du jour/ })).toContainText('Commencer');
  await expect(section.getByRole('button', { name: /Au marché/ })).toContainText('Continuer');
  await expect(section.getByRole('button', { name: /Les voyages|Texte envoyé|Les nombres terminés/ })).toHaveCount(0);
  await expect(section.getByRole('button', { name: 'À faire', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await section.getByRole('button', { name: 'Toutes les séances', exact: true }).click();
  await expect(section.getByRole('button', { name: /Les voyages/ })).toBeVisible();
  await expect(section.getByRole('button', { name: /Texte envoyé/ })).toContainText('Consulter');
  await expect(section.getByRole('button', { name: /Les nombres terminés/ })).toBeVisible();
  await section.getByRole('button', { name: 'À faire', exact: true }).click();
  await section.screenshot({ path: 'artifacts/sessions-todo-desktop.png' });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await section.screenshot({ path: 'artifacts/sessions-todo-mobile.png' });
  expect(errors).toEqual([]);
});

test('terminer une séance la retire des séances à faire et conserve sa consultation', async ({ page }) => {
  const exercise: Exercise = { id: 'word', group_id: null, type: 'cloze', instruction: 'Complétez la salutation.', content: '___ Marco!', latestAttempt: null };
  const session = { id: 'today', title: 'Une salutation', objective: 'Saluer en italien.', scheduled_date: '2026-11-07', source: 'prof', total: 1, completed: 0, pending: 0, exercises: [exercise] };
  await page.route('**/api/sessions', route => route.fulfill({ json: [session] }));
  await page.route(/\/api\/session\?id=today$/, route => route.fulfill({ json: session }));
  await page.route('**/api/attempt', route => {
    const { requestId, answer } = route.request().postDataJSON();
    session.completed = 1;
    exercise.latestAttempt = { id: 'answer', exercise_id: 'word', request_id: requestId, answer, is_correct: 1, status: 'corrected', feedback: { accepted: ['Ciao'] } };
    return route.fulfill({ json: exercise.latestAttempt });
  });
  await page.goto(base);
  const section = page.getByRole('region', { name: 'Votre pratique' });
  await section.getByRole('button', { name: /Une salutation/ }).click();
  await section.getByRole('textbox', { name: 'Votre réponse' }).fill('Ciao');
  await section.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(section.getByRole('status')).toContainText('Correct.');
  await section.getByRole('button', { name: 'Retour aux séances', exact: true }).click();
  await expect(section.getByText('Vous êtes à jour !', { exact: true })).toBeVisible();
  await expect(section.getByRole('button', { name: /Une salutation/ })).toHaveCount(0);
  await section.getByRole('button', { name: 'Toutes les séances', exact: true }).click();
  await section.getByRole('button', { name: /Une salutation/ }).click();
  await expect(section.getByRole('textbox', { name: 'Votre réponse' })).toHaveValue('Ciao');
  await section.getByRole('button', { name: 'Retour aux séances', exact: true }).click();
  await expect(section.getByRole('button', { name: 'Toutes les séances', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.unroute('**/api/sessions');
  await page.route('**/api/sessions', route => route.fulfill({ status: 500 }));
  await page.reload();
  await expect(section.getByRole('alert')).toContainText('Opération impossible.');
  await expect(section.getByText('Vous êtes à jour !', { exact: true })).toHaveCount(0);
});
