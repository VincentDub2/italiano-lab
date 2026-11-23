import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSession, listSessions, publishSession, submitAttempt, submitFeedback } from '../src/server/domain';
import { learningOverview } from '../src/server/learning';
import { listNotionProgress } from '../src/server/notion-progress';
import { answerPractice, startPractice } from '../src/server/practice';
import { composeSession, createBankExercise, dailyPlan } from '../src/server/bank';
import { resolveLearningNotion } from '../src/server/learning-signals';
import { actOnAssessment, getStudentAssessment, getTeacherAssessment, listStudentAssessments, listTeacherAssessments, proposeAssessment, reviewAssessment, saveAssessment } from '../src/server/assessments';

function fixture(t: TestContext) {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-bilans-'));
 const previous = process.env.ITALIANO_DB_PATH;
 process.env.ITALIANO_DB_PATH = join(dir, 'db.sqlite');
 t.after(() => {
  if (previous === undefined) delete process.env.ITALIANO_DB_PATH;
  else process.env.ITALIANO_DB_PATH = previous;
  rmSync(dir, { recursive: true, force: true });
 });
 return resolveLearningNotion({ requestId: 'notion-bilan', name: 'Cambio di programma' }).id;
}

function definition(notionId: string, series = 'traghetto') {
 return {
  title: 'Un changement de programme', objective: 'Prévenir d’un changement', reason: 'Réutiliser le passé dans une situation nouvelle.',
  estimatedMinutes: 10, notionIds: [notionId],
  criteria: [{ label: 'Expliquer le changement au passé', rubric: 'GRILLE_PRIVEE' }],
  tasks: [
   { type: 'cloze', instruction: 'Complétez le message.', content: `Ieri il ${series} ___ in ritardo.`, answer: { accepted: ['è arrivato'] }, explanation: 'RETOUR_PRIVE' },
   { type: 'free_text', instruction: 'Écrivez trois phrases.', content: `Expliquez à Giulia le changement concernant le ${series}.`, answer: { criteria: 'GRILLE_ECRIT', example: 'MODELE_PRIVE' } },
  ],
 };
}

test('brouillon privé et modifiable, publication immuable et une seule place active', t => {
 const def = definition(fixture(t));
 const draft = saveAssessment({ ...def, requestId: 'draft' });
 assert.deepEqual(saveAssessment({ ...def, requestId: 'draft' }), draft);
 assert.throws(() => saveAssessment({ ...def, title: 'Autre', requestId: 'draft' }), /Identifiant/);
 assert.deepEqual(listStudentAssessments(), []);
 assert.throws(() => getStudentAssessment(draft.assessmentId));
 saveAssessment({ ...def, assessmentId: draft.assessmentId, title: 'Départ décalé', requestId: 'edit' });
 assert.equal(getTeacherAssessment(draft.assessmentId).title, 'Départ décalé');
 const publish = { assessmentId: draft.assessmentId, revision: 1, requestId: 'publish' };
 assert.deepEqual(proposeAssessment(publish), proposeAssessment(publish));
 const view = getStudentAssessment(draft.assessmentId);
 assert.equal(view.status, 'offered');
 assert.equal(view.title, 'Départ décalé');
 assert.doesNotMatch(JSON.stringify([view, listStudentAssessments()]), /Giulia|PRIVE|GRILLE|è arrivato|tasks/);
 const second = saveAssessment({ ...definition(def.notionIds[0], 'treno'), requestId: 'second' });
 assert.throws(() => proposeAssessment({ ...second, requestId: 'publish-second' }), /déjà proposé/);
 assert.throws(() => saveAssessment({ ...def, assessmentId: draft.assessmentId, requestId: 'late-edit' }), /brouillon/);
});

test('un sujet identique à un énoncé de banque est refusé même avec accents ou ponctuation différents', t => {
 const def = definition(fixture(t));
 createBankExercise({
  requestId: 'known-practice',
  exercise: { type: 'cloze', instruction: 'Une autre consigne', content: ' IERI, il TRÁGHETTO ____ in ritardo ! ', answer: { accepted: ['arrivò'] } },
 });
 const draft = saveAssessment({ ...def, requestId: 'draft' });
 assert.throws(() => proposeAssessment({ ...draft, requestId: 'publish' }), /déjà été utilisé/);
 assert.equal(getTeacherAssessment(draft.assessmentId).status, 'draft');
});

test('les réponses de travail sont récupérables, le rendu est complet, atomique et idempotent', t => {
 const draft = saveAssessment({ ...definition(fixture(t)), requestId: 'draft' });
 proposeAssessment({ ...draft, requestId: 'propose' });
 const transition = (requestId: string, fields: object) => actOnAssessment({ assessmentId: draft.assessmentId, requestId, ...fields });
 transition('start', { action: 'start' });
 const view = getStudentAssessment(draft.assessmentId);
 assert.equal(view.status, 'in_progress');
 assert.ok('tasks' in view && view.tasks);
 const [a, b] = view.tasks;
 assert.doesNotMatch(JSON.stringify(view), /PRIVE|GRILLE|è arrivato|verdict|accepted/);
 const save = { action: 'save', revision: view.revision, taskId: a.id, response: { kind: 'answer', value: 'è arrivato' } };
 const first = transition('save-a', save);
 assert.deepEqual(transition('save-a', save), first);
 assert.throws(() => transition('save-a', { ...save, response: null }), /Identifiant/);
 assert.throws(() => transition('other-tab', { ...save, response: null }), /actualisez/i);
 assert.throws(() => transition('submit', { action: 'submit', revision: first.revision }), /chaque tâche/);
 const second = transition('save-b', { action: 'save', revision: first.revision, taskId: b.id, response: { kind: 'unknown' } });
 const resumed = getStudentAssessment(draft.assessmentId);
 assert.ok('tasks' in resumed && resumed.tasks);
 assert.deepEqual(resumed.tasks.map(task => task.response), [save.response, { kind: 'unknown' }]);
 assert.throws(() => transition('stale-submit', { action: 'submit', revision: first.revision }), /actualisez/i);
 const submission = { action: 'submit', revision: second.revision };
 const receipt = transition('submit', submission);
 assert.deepEqual(transition('submit', submission), receipt);
 assert.throws(() => transition('other-submit', submission));
 assert.throws(() => transition('late-edit', { ...save, revision: receipt.revision }));
 const waiting = getStudentAssessment(draft.assessmentId);
 assert.equal(waiting.status, 'submitted');
 assert.doesNotMatch(JSON.stringify(waiting), /PRIVE|GRILLE|verdict|accepted|result/);
 assert.equal(getTeacherAssessment(draft.assessmentId).tasks.length, 2);
});

test('un abandon conserve les réponses et empêche une nouvelle proposition des mêmes tâches', t => {
 const def = definition(fixture(t));
 const draft = saveAssessment({ ...def, requestId: 'draft' });
 const assessmentId = draft.assessmentId;
 proposeAssessment({ ...draft, requestId: 'propose' });
 const start = actOnAssessment({ assessmentId, action: 'start', requestId: 'start' });
 const [task] = getTeacherAssessment(assessmentId).tasks;
 const saved = actOnAssessment({ assessmentId, action: 'save', taskId: task.id, revision: start.revision, response: { kind: 'unknown' }, requestId: 'save' });
 actOnAssessment({ assessmentId, revision: saved.revision, action: 'close', requestId: 'close' });
 assert.equal(getStudentAssessment(assessmentId).status, 'abandoned');
 assert.deepEqual(getTeacherAssessment(assessmentId).tasks[0].response, { kind: 'unknown' });
 assert.throws(() => actOnAssessment({ assessmentId, action: 'start', requestId: 'restart' }));
 const repeat = saveAssessment({ ...def, requestId: 'repeat' });
 assert.throws(() => proposeAssessment({ ...repeat, requestId: 'republish' }), /déjà été utilisé/);
});

test('publication unique du retour, avec critères justifiés et sans effet sur les preuves V2', t => {
 const notionId = fixture(t);
 const [writtenItem] = createBankExercise({
  requestId: 'written-item', notions: ['Cambio di programma'],
  exercise: { type: 'free_text', instruction: 'Écrivez.', content: 'Relatez votre sortie de samedi.', answer: {} },
 }).itemIds;
 const session = composeSession({ requestId: 'compose', title: 'Sortie', objective: 'Raconter', scheduledDate: '2026-01-01', itemIds: [writtenItem] });
 publishSession(session.id);
 const attempt = submitAttempt({ exerciseId: getSession(session.id).exercises[0].id, requestId: 'practice-written', answer: 'Sono andato al cinema.' });
 submitFeedback({ attemptId: attempt.id, result: 'correct', correction: 'Sono andato al cinema.', explanation: 'Le passé convient.',
  observations: [{ notionId, kind: 'strength', explanation: 'Forme de passé bien choisie.' }] });
 const [practiceItem] = createBankExercise({
  requestId: 'practice-item', notions: ['Cambio di programma'],
  exercise: { type: 'cloze', instruction: 'Complétez.', content: 'Ieri ___ a Roma.', answer: { accepted: ['sono andato'] } },
 }).itemIds;
 const series = startPractice({ requestId: 'practice', count: 1, itemIds: [practiceItem], voluntary: true });
 answerPractice({ seriesId: series.id, questionId: practiceItem, requestId: 'practice-answer', answer: 'sono andato' });
 const snapshot = () => ({
  progress: listNotionProgress({ notionId }), overview: learningOverview(), history: listSessions(),
  plan: dailyPlan(),
 });
 const before = snapshot();
 assert.equal(before.progress.notions[0]?.status, 'recent_success');
 const draft = saveAssessment({ ...definition(notionId), requestId: 'draft' });
 const { assessmentId } = draft;
 proposeAssessment({ ...draft, requestId: 'propose' });
 const start = actOnAssessment({ assessmentId, action: 'start', requestId: 'start' });
 const [closed, written] = getTeacherAssessment(assessmentId).tasks;
 const first = actOnAssessment({ assessmentId, action: 'save', revision: start.revision, taskId: closed.id, requestId: 'unknown', response: { kind: 'unknown' } });
 const second = actOnAssessment({ assessmentId, action: 'save', revision: first.revision, taskId: written.id, requestId: 'write',
  response: { kind: 'answer', value: 'Il traghetto era in ritardo. Ho preso il treno. Ci vediamo alle otto.' } });
 const report = {
  strengths: 'Vous expliquez le changement dans un nouveau contexte.', fragile: 'La première forme demandée reste à vérifier.',
  nextAction: { description: 'Racontez un retard à un autre interlocuteur.' },
  tasks: [
   { taskId: closed.id, verdict: 'unanswered', correction: 'è arrivato', explanation: 'Vous avez choisi « Je ne sais pas ».' },
   { taskId: written.id, verdict: 'correct', explanation: 'La formulation répond à la consigne et le passé est adapté.' },
  ],
  criteria: [{ position: 0, status: 'observed_without_help', explanation: 'Le contexte et la conséquence sont clairs.', taskIds: [written.id] }],
 };
 const review = { assessmentId, requestId: 'review', report };
 assert.throws(() => reviewAssessment(review), /rendu/);
 actOnAssessment({ assessmentId, action: 'submit', revision: second.revision, requestId: 'submit' });
 assert.equal(listTeacherAssessments({ status: 'submitted' }).assessments[0].id, assessmentId);
 assert.equal(getTeacherAssessment(assessmentId).tasks[1].suggestedGrade, null);
 assert.throws(() => reviewAssessment({ ...review, report: { ...report, nextAction: { ...report.nextAction, lessonId: 'unknown' } } }), /Leçon/);
 assert.throws(() => reviewAssessment({ ...review, report: { ...report, criteria: [{ ...report.criteria[0], taskIds: [closed.id] }] } }), /preuves/);
 const receipt = reviewAssessment(review);
 assert.deepEqual(reviewAssessment(review), receipt);
 assert.throws(() => reviewAssessment({ ...review, requestId: 'another-review' }), /rendu/);
 const view = getStudentAssessment(assessmentId);
 assert.equal(view.status, 'reviewed');
 assert.ok('result' in view && view.result);
 assert.equal(view.result.tasks[1].verdict, 'correct');
 assert.equal(view.result.nextAction.lessonHref, null);
 assert.doesNotMatch(JSON.stringify(view), /GRILLE|MODELE_PRIVE|RETOUR_PRIVE|suggestedGrade/);
 assert.deepEqual(snapshot(), before);
});
