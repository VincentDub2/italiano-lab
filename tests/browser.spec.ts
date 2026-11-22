import { test, expect } from '@playwright/test';

test('révision, difficultés, recherche, import et persistance', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.ITALIANO_TEST_URL ?? 'http://127.0.0.1:3211');
  await expect(page.getByRole('heading', {name: 'Aujourd’hui', exact:true,level:1})).toBeVisible();
  await expect(page.getByRole('heading', {name:'Séances',exact:true})).toBeVisible();
  const hero = await page.getByRole('heading', {name:'Aujourd’hui',exact:true,level:1}).boundingBox();
  const practice = await page.getByRole('heading', {name:'Séances',exact:true}).boundingBox();
  expect(hero!.y + hero!.height).toBeLessThan(practice!.y);
  await page.screenshot({path:'artifacts/dashboard-desktop.png',fullPage:true});
  await page.getByRole('link', {name:'Réviser',exact:true}).click();
  await page.getByRole('button', {name:'Commencer',exact:true}).click();
  await expect(page.locator('.answer')).toHaveCount(0);
  await page.getByRole('button', {name:'Révéler la réponse'}).click();
  await expect(page.locator('.answer')).toBeVisible();
  await page.getByRole('button', {name:/À revoir/}).click();
  await page.getByRole('link', {name:'Mes difficultés',exact:true}).click();
  await expect(page.locator('.simple-list > div')).toHaveCount(1);
  await page.reload();
  await page.getByRole('link', {name:'Mes difficultés',exact:true}).click();
  await expect(page.locator('.simple-list > div')).toHaveCount(1);
  await page.getByRole('link', {name:'Vocabulaire',exact:true}).click();
  await page.getByRole('searchbox').fill('zzzznothing');
  await expect(page.locator('.vocab-card')).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('combobox').selectOption({index:1});
  expect(await page.locator('.vocab-card').count()).toBeGreaterThan(0);
  await page.getByRole('link', {name:'Sources / Obsidian',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles('public/examples/cours-exemple.md');
  await expect(page.getByRole('status')).toContainText('2 expression(s) importée(s)');
  await page.reload();
  await page.getByRole('link', {name:'Vocabulaire',exact:true}).click();
  await page.getByRole('searchbox').fill('pomodori');
  await expect(page.locator('.vocab-card')).toHaveCount(1);
  await page.getByRole('link', {name:'Sources / Obsidian',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles('public/examples/cours-exemple.md');
  await expect(page.getByRole('status')).toContainText('0 expression(s) importée(s), 2 doublon(s)');
  expect(errors).toEqual([]);
});

test('mobile sans débordement sur chaque écran', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(process.env.ITALIANO_TEST_URL ?? 'http://127.0.0.1:3211');
  await expect(page.getByRole('heading', {name:'Aujourd’hui',exact:true,level:1})).toBeVisible();
  await expect(page.getByRole('heading', {name:'Séances',exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/dashboard-mobile.png',fullPage:true});
  const primary = page.getByRole('navigation',{name:'Navigation principale'});
  await expect(primary.getByRole('link')).toHaveText(['Aujourd’hui','Mes leçons','S’entraîner','Mon niveau']);
  for (const name of ['Mes leçons','S’entraîner','Mon niveau','Aujourd’hui','Réviser','Vocabulaire','Mes difficultés','Sources / Obsidian']) {
    await page.getByRole('link',{name,exact:true}).first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('Aujourd’hui distingue une indisponibilité d’une journée sans action',async ({page})=>{
 const base=process.env.ITALIANO_TEST_URL ?? 'http://127.0.0.1:3211';
 await page.route('**/api/today',route=>route.fulfill({status:500}));
 await page.goto(base);
 const primary=page.getByRole('region',{name:'À faire maintenant'});
 await expect(primary.getByRole('alert')).toContainText('Impossible de charger');
 await expect(primary.getByText('Rien d’obligatoire pour aujourd’hui')).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Entraînement libre'})).toBeVisible();
 await page.unroute('**/api/today');
 await primary.getByRole('button',{name:'Réessayer'}).click();
 await expect(primary.getByRole('alert')).toHaveCount(0);
});
