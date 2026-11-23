import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishAssessmentComparison, listAssessmentComparisons } from '../src/server/assessment-comparisons';
import { actOnAssessment, getTeacherAssessment, proposeAssessment, reviewAssessment, saveAssessment } from '../src/server/assessments';
import { resolveLearningNotion } from '../src/server/learning-signals';
import { listNotionProgress } from '../src/server/notion-progress';
import { dailyPlan } from '../src/server/bank';

function fixture(t: TestContext) {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-compare-'));
 const previous = process.env.ITALIANO_DB_PATH;
 process.env.ITALIANO_DB_PATH = join(dir, 'test.sqlite');
 t.after(() => {
  if (previous === undefined) delete process.env.ITALIANO_DB_PATH;
  else process.env.ITALIANO_DB_PATH = previous;
  rmSync(dir, { recursive: true, force: true });
 });
 return resolveLearningNotion({ requestId: 'notion', name: 'Expliquer les conséquences d’un imprévu' }).id;
}

function report(notionIds: string[], context: string, status: 'observed_without_help' | 'needs_work' | 'not_observed', options?: {
 format?: 'quiz'; waiting?: boolean;
}) {
 const cloze = { type: 'cloze', instruction: 'Complétez le message.', content: 'Ieri ___ '+context, answer: { accepted: ['sono arrivato'] } };
 const quiz = { type: 'questionnaire', instruction: 'Choisissez.', content: 'Dove sei andato '+context, choices: [{ value: 'a', label: 'Lì' }, { value: 'b', label: 'Là' }], answer: { value: 'a' } };
 const draft = saveAssessment({
  requestId: context+'-draft', title: context, notionIds, objective: 'Expliquer les conséquences d’un imprévu.', reason: 'Évaluer le transfert.', estimatedMinutes: 10,
  criteria: [{ label: 'Relier cause et conséquence', rubric: 'GRILLE_PRIVEE' }, { label: 'Employer le passé', rubric: 'GRILLE_PRIVEE' }],
  tasks: [options?.format === 'quiz' ? quiz : cloze, { type: 'free_text', instruction: 'Écrivez trois phrases.',
   content: 'Expliquez l’imprévu à '+context+'.', answer: { criteria: 'GRILLE_PRIVEE', example: 'MODELE_PRIVE' } }],
 });
 const { assessmentId } = draft;
 proposeAssessment({ ...draft, requestId: context+'-offer' });
 let { revision } = actOnAssessment({ assessmentId, requestId: context+'-start', action: 'start' });
 const [closed, written] = getTeacherAssessment(assessmentId).tasks;
 const responses = [
  { taskId: closed.id, response: { kind: 'answer', value: options?.format === 'quiz' ? '0' : 'sono arrivato' } },
  { taskId: written.id, response: status === 'not_observed' ? { kind: 'unknown' } : { kind: 'answer', value: 'Ho fatto tardi. Ho perso il treno.' } },
 ];
 for (const response of responses) {
  revision = actOnAssessment({ assessmentId, requestId: context+response.taskId, action: 'save', revision, ...response }).revision;
 }
 actOnAssessment({ assessmentId, requestId: context+'-submit', action: 'submit', revision });
 if (!options?.waiting) reviewAssessment({ assessmentId, requestId: context+'-review', report: {
  strengths: 'La chronologie est claire.', fragile: 'La cause doit être explicite.', nextAction: { description: 'Racontez un autre retard.' },
  tasks: [
   { taskId: closed.id, verdict: 'correct', explanation: 'Verbe adapté.' },
   { taskId: written.id, verdict: status === 'not_observed' ? 'unanswered' : 'partial', explanation: 'Retour sur la production.' },
  ],
  criteria: [
   { position: 0, status, ...(status === 'not_observed' ? { reason: 'no_answer' } : {}), explanation: 'Constat sur la production.', taskIds: [written.id] },
   { position: 1, status: 'observed_without_help', explanation: 'Constat sur la tâche fermée.', taskIds: [closed.id] },
  ],
 } });
 return { assessmentId, closed: closed.id, written: written.id };
}

test('la comparaison publie les constats correctement attribués sans modifier les preuves V2', t => {
 const notionId = fixture(t);
 const first = report([notionId], 'la gare', 'observed_without_help');
 const second = report([notionId], 'un chantier', 'needs_work');
 const before = { progress: listNotionProgress({ notionId }), plan: dailyPlan() };
 const input = { requestId: 'comparison', notionId, firstAssessmentId: first.assessmentId, secondAssessmentId: second.assessmentId,
  firstContext: 'Voyageur qui prévient la gare', secondContext: 'Salarié qui prévient son équipe', rationale: 'Même demande de justification au passé.',
  criteria: [{ firstPosition: 0, secondPosition: 0, firstTaskId: first.written, secondTaskId: second.written },
   { firstPosition: 1, secondPosition: 1, firstTaskId: first.closed, secondTaskId: second.closed }],
 };
 assert.deepEqual(listAssessmentComparisons({ notionId }), { comparisons: [], nextOffset: null });
 assert.throws(() => publishAssessmentComparison({ ...input, secondAssessmentId: first.assessmentId }), /distincts/);
 assert.throws(() => publishAssessmentComparison({ ...input, secondContext: 'VOYAGEUR QUI PRÉVIENT LA GARE !' }), /contextes distincts/);
 assert.throws(() => publishAssessmentComparison({ ...input, criteria: [{ ...input.criteria[0], firstTaskId: first.closed }] }), /citée/);
 assert.throws(() => publishAssessmentComparison({ ...input, criteria: [input.criteria[0], input.criteria[0]] }), /une fois/);
 const saved = publishAssessmentComparison(input);
 assert.deepEqual(publishAssessmentComparison(input), saved);
 assert.throws(() => publishAssessmentComparison({ ...input, rationale: 'Une autre justification.' }), /Identifiant/);
 assert.throws(() => publishAssessmentComparison({ ...input, requestId: 'duplicate' }), /déjà été comparés/);
 const { comparisons } = listAssessmentComparisons({ comparisonId: saved.id });
 assert.equal(comparisons.length, 1);
 const [view] = comparisons;
 assert.equal(view.notion.id, notionId);
 assert.deepEqual(view.criteria.map(criterion => criterion.outcome), ['fragile', 'observed_in_both']);
 assert.equal(view.criteria[0].first.evidence?.type, 'free_text');
 assert.equal(view.criteria[0].second.status, 'needs_work');
 assert.equal(view.criteria[1].first.evidence?.position, 0);
 assert.doesNotMatch(JSON.stringify(view), /MODELE_PRIVE|GRILLE_PRIVEE|Ho fatto tardi|rubric/);
 assert.deepEqual({ progress: listNotionProgress({ notionId }), plan: dailyPlan() }, before);
});

test('un manque de preuve reste visible et un bilan en attente ou de format différent est exclu', t => {
 const notionId = fixture(t);
 const first = report([notionId], 'una farmacia', 'observed_without_help');
 const second = report([notionId], 'un mercatino', 'not_observed');
 const waiting = report([notionId], 'una scuola', 'observed_without_help', { waiting: true });
 const format = report([notionId], 'un aeroporto', 'observed_without_help', { format: 'quiz' });
 const input = { requestId: 'comparison', notionId, firstAssessmentId: first.assessmentId, secondAssessmentId: second.assessmentId,
  firstContext: 'Farmacia', secondContext: 'Mercatino', rationale: 'La stessa competenza in due situazioni.',
  criteria: [{ firstPosition: 0, secondPosition: 0, firstTaskId: first.written }],
 };
 assert.throws(() => publishAssessmentComparison({ ...input, secondAssessmentId: waiting.assessmentId }), /corrigés/);
 assert.throws(() => publishAssessmentComparison({ ...input, secondAssessmentId: format.assessmentId }), /formats/);
 assert.throws(() => publishAssessmentComparison({ ...input, criteria: [{ ...input.criteria[0], secondTaskId: second.written }] }), /non observé/);
 publishAssessmentComparison(input);
 const [view] = listAssessmentComparisons({ notionId }).comparisons;
 assert.equal(view.criteria[0].outcome, 'insufficient');
 assert.equal(view.criteria[0].second.reason, 'no_answer');
 assert.equal(view.criteria[0].second.evidence, null);
});

test('un QCM ou une tâche fermée portant sur plusieurs notions ne suffit pas à attribuer l’observation', t => {
 const notionId = fixture(t);
 const other = resolveLearningNotion({ requestId: 'another', name: 'Autre notion' }).id;
 for (const [key, notions, quiz] of [['quiz', [notionId], true], ['multi', [notionId, other], false]] as const) {
  const first = report([...notions], key+'-gare', 'observed_without_help', quiz ? { format: 'quiz' } : undefined);
  const second = report([...notions], key+'-obstacle', 'observed_without_help', quiz ? { format: 'quiz' } : undefined);
  assert.throws(() => publishAssessmentComparison({ requestId: key, notionId, firstAssessmentId: first.assessmentId, secondAssessmentId: second.assessmentId,
   firstContext: 'En déplacement', secondContext: 'Au travail', rationale: 'Vérifier le réemploi.',
   criteria: [{ firstPosition: 1, secondPosition: 1, firstTaskId: first.closed, secondTaskId: second.closed }],
  }), /production écrite ou une tâche ciblée/);
 }
});
