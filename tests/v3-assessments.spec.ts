import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const base = process.env.ITALIANO_TEST_URL || 'http://127.0.0.1:3211';
const title = 'Expliquer un changement à la régie';
const prompt = 'Prévenez Martina que la répétition au théâtre est déplacée après la panne.';
const privateExamples = /GRILLE_PRIVEE_V3|MODELE_PRIVE_V3|EXPLICATION_PRIVEE_V3|CHOIX_PRIVE_V3|RETARDATO_PRIVE_V3/;
const privateKeys = /"suggestedGrade"|"accepted"|"answer_json"|"orders"|"rubric"/;

test('mini-bilan proposé, réalisé sans aide et corrigé via le vrai prof MCP', async ({ page, request, context }) => {
 if (!process.env.ITALIANO_DB_PATH || !process.env.ITALIANO_TEST_CLOCK) throw new Error('Utilisez test:browser:isolated.');
 const client = new Client({ name: 'v3-assessment-test', version: '1' });
 await client.connect(new StdioClientTransport({
  command: '/bin/sh', args: ['scripts/mcp.sh'], env: process.env as Record<string, string>, stderr: 'pipe',
 }));
 const call = async (name: string, args: Record<string, unknown> = {}) => {
  const result = await client.callTool({ name, arguments: args });
  const payload = (result.content as { text: string }[])[0].text;
  if (result.isError) throw new Error(payload);
  return JSON.parse(payload);
 };
 const get = (action: string) => request.get(base + '/api/' + action);
 const post = (action: string, data: object) => request.post(base + '/api/' + action, { headers: { origin: base }, data });
 await page.setViewportSize({ width: 390, height: 844 });
 const notion = 'Décrire un imprévu à la régie';
 const overview = async () => {
  const actions = ['today', 'notion-progress', 'learning-overview', 'lessons', 'sessions', 'feedback'];
  const responses = await Promise.all(actions.map(get));
  expect(responses.every(r => r.ok())).toBe(true);
  return await Promise.all(responses.map(r => r.json()));
 };
 try {
  const { id: notionId } = await call('resolve_learning_notion', { requestId: 'v3a-notion', name: notion });
  await get('sessions');
  const before = await overview();
  const definitions = {
   title, objective: 'Raconter un imprévu et proposer une solution.', reason: 'Réutiliser le passé dans une situation nouvelle.',
   estimatedMinutes: 10, notionIds: [notionId],
   criteria: [
    { label: 'Expliquer la conséquence de la panne', rubric: 'GRILLE_PRIVEE_V3' },
    { label: 'Choisir la forme du verbe', rubric: 'GRILLE_PRIVEE_V3' },
    { label: 'Préciser l’horaire à un inconnu', rubric: 'GRILLE_PRIVEE_V3' },
   ],
   tasks: [
    { type: 'questionnaire', instruction: 'Lisez le message et choisissez la cause.', support: 'La porta del teatro non si apre. Proviamo domani.',
     content: 'Pourquoi la répétition change-t-elle ?', choices: [{ value: 'CHOIX_PRIVE_V3', label: 'La porta è bloccata.' }, { value: 'alt', label: 'Manca il musicista.' }],
     answer: { value: 'CHOIX_PRIVE_V3' }, explanation: 'EXPLICATION_PRIVEE_V3' },
    { type: 'sentence', instruction: 'Remettez les mots dans l’ordre.', content: 'Expliquez où le décor est resté.',
     sentence: { format: 'word_order', tokens: ['magazzino.', 'rimasto', 'È', 'in'], orders: [[2, 1, 3, 0]] } },
    { type: 'cloze', instruction: 'Complétez le message.', content: 'Il tecnico ___ la prova a mercoledì.',
     answer: { accepted: ['RETARDATO_PRIVE_V3'] } },
    { type: 'free_text', instruction: 'Écrivez de trois à cinq phrases.', content: prompt,
     answer: { criteria: 'GRILLE_PRIVEE_V3', example: 'MODELE_PRIVE_V3' } },
   ],
  };
  const draft = await call('save_assessment_draft', { ...definitions, requestId: 'v3a-draft' });
  const assessmentId: string = draft.assessmentId;
  const route = 'assessment?id=' + assessmentId;
  expect((await get(route)).status()).toBe(404);
  expect(JSON.stringify(await (await get('assessments')).json())).not.toContain(title);
  const teacher = await call('get_assessment', { assessmentId });
  expect(teacher.status).toBe('draft');
  expect(teacher.tasks.map(({ definition }: { definition: unknown }) => definition)).toEqual(definitions.tasks);
  await call('propose_assessment', { assessmentId, revision: teacher.revision, requestId: 'v3a-propose' });

  await page.goto(base + '/mon-niveau');
  const nav = page.getByRole('link', { name: 'Bilans', exact: true });
  await nav.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Bilans', exact: true })).toBeVisible();
  await expect(page.getByText('Environ 10 min')).toBeVisible();
  await page.getByRole('link', { name: title }).click();
  const preview = await (await get(route)).text();
  expect(preview).not.toContain(prompt);
  expect(preview).not.toContain('tasks');
  expect(privateExamples.test(preview) || privateKeys.test(preview)).toBe(false);
  await expect(page.getByText(prompt)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Commencer', exact: true })).toBeVisible();

  const sequence = (await call('get_assessment', { assessmentId })).tasks as { id: string }[];
  const [, reorder, cloze] = sequence;
  const securityResponse = await request.post(base + '/api/assessment-action', {
   headers: { origin: 'http://example.test' }, data: { action: 'start', requestId: 'v3a-foreign', assessmentId },
  });
  expect(securityResponse.status()).toBe(403);
  await page.getByRole('button', { name: 'Commencer', exact: true }).click();
  await expect(page.getByText(prompt)).toBeVisible();
  const working = await (await get(route)).json();
  expect(privateExamples.test(JSON.stringify(working)) || privateKeys.test(JSON.stringify(working))).toBe(false);
  await expect(page.getByRole('button', { name: /indice|révéler/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rendre le bilan', exact: true })).toBeDisabled();
  expect((await post('assessment-action', {
   assessmentId, requestId: 'v3a-incomplete', action: 'submit', revision: working.revision,
  })).status()).toBe(400);
  const staleTab = await context.newPage();
  await staleTab.goto(page.url());
  await expect(staleTab.getByText(prompt)).toBeVisible();
  await page.getByRole('radio', { name: 'La porta è bloccata.' }).check();
  await expect(page.getByRole('status').getByText('Enregistré', { exact: true })).toBeVisible();
  await staleTab.getByRole('radio', { name: 'Manca il musicista.' }).check();
  await expect(staleTab.getByRole('alert').filter({ hasText: 'Actualisez le bilan' })).toBeVisible();
  await staleTab.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(staleTab.getByRole('radio', { name: 'La porta è bloccata.' })).toBeChecked();
  await staleTab.close();
  const answer = 'Il teatro è chiuso. Spostiamo la prova a domani. Puoi avvertire gli altri?';
  await page.getByRole('textbox', { name: 'Votre production' }).fill(answer);
  await expect(page.getByRole('status').getByText('Enregistré', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'È', exact: true }).click();
  await expect(page.getByRole('status').getByText('Enregistré', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Votre production' })).toHaveValue(answer);
  await expect(page.getByRole('button', { name: 'È', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'rimasto', exact: true }).click();
  await page.getByRole('button', { name: 'in', exact: true }).click();
  await page.getByRole('button', { name: 'magazzino.', exact: true }).click();
  const clozeCard = page.locator('[data-slot=card]').filter({ has: page.getByRole('heading', { name: 'Tâche 3', exact: true }) });
  await clozeCard.getByRole('checkbox', { name: 'Je ne sais pas' }).check();
  await expect(page.getByRole('button', { name: 'Rendre le bilan', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: 'Rendre le bilan', exact: true }).click();
  const submittedResponse = page.waitForResponse(r => r.url().endsWith('/api/assessment-action') && r.request().postDataJSON()?.action === 'submit');
  await page.getByRole('button', { name: 'Confirmer le rendu' }).click();
  const sent = await submittedResponse;
  expect(sent.ok()).toBe(true);
  const submittedCommand = sent.request().postDataJSON();
  const replay = await post('assessment-action', submittedCommand);
  expect(await replay.json()).toEqual(await sent.json());
  expect((await post('assessment-action', { ...submittedCommand, requestId: 'v3a-other-submit' })).status()).toBe(409);
  expect((await post('assessment-action', {
   action: 'save', assessmentId, requestId: 'v3a-too-late', revision: (await replay.json()).revision,
   taskId: cloze.id, response: { kind: 'unknown' },
  })).status()).toBe(409);
  await expect(page.getByText('En attente du retour du prof', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Retour du prof' })).toHaveCount(0);
  const waiting = await (await get(route)).text();
  expect(privateExamples.test(waiting) || privateKeys.test(waiting)).toBe(false);
  expect(waiting).not.toMatch(/"result"|"verdict"/);
  expect(privateExamples.test(await page.content())).toBe(false);

  const otherRoutes = ['practice-bank', 'feedback', 'errors', 'notion-progress', 'sessions',
   'attempt-detail?id=' + reorder.id, 'correction?id=' + cloze.id, 'session?id=' + assessmentId];
  for (const action of otherRoutes) {
   const response = await (await get(action)).text();
   expect(privateExamples.test(response), action).toBe(false);
   expect(response.includes(prompt) || sequence.some(task => response.includes(task.id)), action).toBe(false);
  }
  expect((await post('practice-start', { requestId: 'v3a-no-practice', count: 1, itemIds: [cloze.id], voluntary: true })).ok()).toBe(false);
  expect((await post('reveal', { exerciseId: cloze.id })).ok()).toBe(false);

  expect((await call('list_assessments', { status: 'submitted' })).assessments.some((entry: { id: string }) => entry.id === assessmentId)).toBe(true);
  const frozen = await call('get_assessment', { assessmentId });
  expect(frozen.tasks.map((t: { response: unknown }) => t.response)).toEqual([
   { kind: 'answer', value: '0' }, { kind: 'answer', value: [2, 1, 3, 0] }, { kind: 'unknown' }, { kind: 'answer', value: answer },
  ]);
  expect(frozen.tasks[0].suggestedGrade.correct).toBe(1);
  expect(frozen.tasks[1].suggestedGrade.correct).toBe(1);
  expect(frozen.tasks[3].suggestedGrade).toBeNull();

  const strengths = 'Vous annoncez le changement et proposez une solution dans un message clair.';
  const fragile = 'La forme du verbe à la troisième tâche reste à vérifier.';
  const next = 'Racontez le même imprévu à une personne qui ne connaît pas le théâtre.';
  await call('publish_assessment_result', { assessmentId, requestId: 'v3a-review', report: {
   strengths, fragile, nextAction: { description: next },
   tasks: [
    { taskId: sequence[0].id, verdict: 'correct', explanation: 'Vous avez repéré le problème de porte.' },
    { taskId: reorder.id, verdict: 'correct', explanation: 'L’ordre des mots est correct.' },
    { taskId: cloze.id, verdict: 'unanswered', correction: 'Il tecnico ha spostato la prova a mercoledì.', explanation: 'Vous avez indiqué ne pas savoir.' },
    { taskId: sequence[3].id, verdict: 'correct', explanation: 'Votre formulation respecte la consigne.' },
   ],
   criteria: [
    { position: 0, status: 'observed_without_help', explanation: 'La solution est adaptée.', taskIds: [sequence[3].id] },
    { position: 1, status: 'not_observed', reason: 'no_answer', explanation: 'La tâche ciblée reste sans réponse.', taskIds: [cloze.id] },
    { position: 2, status: 'not_observed', reason: 'not_tested', explanation: 'La situation ne demande pas un horaire précis.', taskIds: [] },
   ],
  } });
  await page.getByRole('button', { name: 'Vérifier si le retour est prêt' }).click();
  await expect(page.getByText(strengths)).toBeVisible();
  await expect(page.getByText(fragile)).toBeVisible();
  await expect(page.getByText(next)).toBeVisible();
  await expect(page.getByText('Critère non testé dans ce bilan')).toBeVisible();
  await page.reload();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  const reviewedBody = await (await get(route)).text();
  expect(privateExamples.test(reviewedBody) || privateKeys.test(reviewedBody)).toBe(false);
  await page.getByRole('link', { name: 'Tous les bilans' }).click();
  await expect(page.getByRole('region', { name: 'Historique' }).getByRole('link', { name: title })).toBeVisible();
  expect(await overview()).toEqual(before);
 } finally {
  await client.close();
 }
});
