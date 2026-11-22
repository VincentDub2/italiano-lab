import { test, expect } from '@playwright/test';

const base = process.env.ITALIANO_TEST_URL || 'http://127.0.0.1:3211';

test('les cartes À retenir précèdent les exercices sans compter dans la progression', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T12:00:00Z'));
  const exercise = { id: 'word', group_id: null, type: 'cloze', instruction: 'Complétez la salutation.', content: '___ Marco!', latestAttempt: null };
  const session = { id: 'today', title: 'Une salutation', objective: 'Saluer en italien.', scheduled_date: '2026-11-07', source: 'prof', total: 1, completed: 0, pending: 0, exercises: [exercise], reminders: [
    { title: 'Saluer', explanation: 'Une formule familière.', examples: [{ italian: 'Ciao!', french: 'Salut !' }, { italian: 'Buongiorno!', french: 'Bonjour !' }] },
    { title: 'Remercier', explanation: 'Une formule de politesse.', examples: [{ italian: 'Grazie!', french: 'Merci !' }] },
  ] };
  await page.route('**/api/revision-calendar', route => route.fulfill({ json: { state: 'missing', reminders: [] } }));
  await page.route('**/api/sessions', route => route.fulfill({ json: [session] }));
  await page.route(/\/api\/session\?id=today$/, route => route.fulfill({ json: session }));
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET' && request.url().includes('/api/')) writes.push(request.url()); });
  await page.goto(base);
  const practice = page.getByRole('region', { name: 'Votre pratique' });
  await practice.getByRole('button', { name: /Une salutation/ }).click();
  const cards = practice.getByRole('region', { name: 'À retenir' });
  await expect(cards.getByRole('heading', { name: 'Saluer' })).toBeVisible();
  await expect(cards.getByText('Une formule familière.')).toBeVisible();
  for (const text of ['Ciao!', 'Salut !', 'Buongiorno!', 'Bonjour !', 'Grazie!', 'Merci !']) await expect(cards.getByText(text, { exact: true })).toBeVisible();
  await expect(cards.getByRole('heading', { name: 'Remercier' })).toBeVisible();
  await expect(cards.locator('input, button, textarea, select')).toHaveCount(0);
  await expect(practice.getByText('0 / 1 items traités')).toBeVisible();
  expect(await cards.evaluate((el) => !!(el.compareDocumentPosition([...document.querySelectorAll('*')].find(e => e.textContent === 'Complétez la salutation.')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(writes).toEqual([]);
});

test('une ancienne séance sans cartes reste consultable', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T12:00:00Z'));
  const session = { id: 'old', title: 'Ancienne séance', objective: 'Réviser.', scheduled_date: '2026-11-07', source: 'prof', total: 1, completed: 0, pending: 0, exercises: [{ id: 'old-word', group_id: null, type: 'cloze', instruction: 'Complétez.', content: '___!', latestAttempt: null }] };
  await page.route('**/api/revision-calendar', route => route.fulfill({ json: { state: 'missing', reminders: [] } }));
  await page.route('**/api/sessions', route => route.fulfill({ json: [session] }));
  await page.route(/\/api\/session\?id=old$/, route => route.fulfill({ json: session }));
  await page.goto(base);
  const practice = page.getByRole('region', { name: 'Votre pratique' });
  await practice.getByRole('button', { name: /Ancienne séance/ }).click();
  await expect(practice.getByRole('region', { name: 'À retenir' })).toHaveCount(0);
  await expect(practice.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible();
});
