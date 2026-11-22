import { test, expect } from '@playwright/test';

test('révision, difficultés, recherche, import et persistance', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.ITALIANO_TEST_URL ?? 'http://127.0.0.1:3211');
  await expect(page.getByRole('heading', {name: /Un peu d’italien/})).toBeVisible();
  await expect(page.getByRole('heading', {name:'Séances',exact:true})).toBeVisible();
  const hero = await page.getByRole('heading', {name:/Un peu d’italien/}).boundingBox();
  const practice = await page.getByRole('heading', {name:'Séances',exact:true}).boundingBox();
  expect(hero!.y + hero!.height).toBeLessThan(practice!.y);
  await page.screenshot({path:'artifacts/dashboard-desktop.png',fullPage:true});
  await page.getByRole('button', {name:'Commencer ma révision'}).click();
  await expect(page.locator('.answer')).toHaveCount(0);
  await page.getByRole('button', {name:'Révéler la réponse'}).click();
  await expect(page.locator('.answer')).toBeVisible();
  await page.getByRole('button', {name:/À revoir/}).click();
  await page.getByRole('button', {name:'Mes difficultés',exact:true}).click();
  await expect(page.locator('.simple-list > div')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', {name:'Mes difficultés',exact:true}).click();
  await expect(page.locator('.simple-list > div')).toHaveCount(1);
  await page.getByRole('button', {name:'Vocabulaire',exact:true}).click();
  await page.getByRole('searchbox').fill('zzzznothing');
  await expect(page.locator('.vocab-card')).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('combobox').selectOption({index:1});
  expect(await page.locator('.vocab-card').count()).toBeGreaterThan(0);
  await page.getByRole('button', {name:'Sources / Obsidian',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles('public/examples/cours-exemple.md');
  await expect(page.getByRole('status')).toContainText('2 expression(s) importée(s)');
  await page.reload();
  await page.getByRole('button', {name:'Vocabulaire',exact:true}).click();
  await page.getByRole('searchbox').fill('pomodori');
  await expect(page.locator('.vocab-card')).toHaveCount(1);
  await page.getByRole('button', {name:'Sources / Obsidian',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles('public/examples/cours-exemple.md');
  await expect(page.getByRole('status')).toContainText('0 expression(s) importée(s), 2 doublon(s)');
  expect(errors).toEqual([]);
});

test('mobile sans débordement sur chaque écran', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(process.env.ITALIANO_TEST_URL ?? 'http://127.0.0.1:3211');
  await expect(page.getByRole('heading', {name:/Un peu d’italien/})).toBeVisible();
  await expect(page.getByRole('heading', {name:'Séances',exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/dashboard-mobile.png',fullPage:true});
  for (const name of ['Aujourd’hui','Réviser','Vocabulaire','Mes difficultés','Sources / Obsidian']) {
    await page.getByRole('navigation',{name:'Navigation principale'}).getByRole('button',{name,exact:true}).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
