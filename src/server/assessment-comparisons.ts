import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { normalizedAssessmentPrompt, reviewedAssessmentForComparison } from './assessments';
import { openDatabase } from './database.mjs';
import { id, text } from './schemas';
import { mutation, write } from './store';

const position = z.number().int().min(0).max(5);
export const assessmentComparisonSchema = z.strictObject({
 requestId: id, notionId: id, firstAssessmentId: id, secondAssessmentId: id,
 firstContext: text.max(240), secondContext: text.max(240),
 rationale: text.max(1200),
 criteria: z.array(z.strictObject({
  firstPosition: position, secondPosition: position, firstTaskId: id.optional(), secondTaskId: id.optional(),
 })).min(1).max(6),
});
export const listAssessmentComparisonsSchema = z.strictObject({
 notionId: id.optional(), comparisonId: id.optional(),
 limit: z.number().int().min(1).max(50).default(10),
 offset: z.number().int().nonnegative().default(0),
});
type Reviewed = ReturnType<typeof reviewedAssessmentForComparison>;

function notionIds(bilan: Reviewed) {
 return bilan.notions.map(notion => notion.id).sort();
}

function taskFormats(bilan: Reviewed) {
 return bilan.tasks.map(({ definition }) => [definition.type, Boolean(definition.support)]);
}

function checkContext(first: string, second: string) {
 const firstKey = normalizedAssessmentPrompt(first);
 const secondKey = normalizedAssessmentPrompt(second);
 if (!firstKey || !secondKey || firstKey === secondKey) throw new Error('Décrire deux contextes distincts.');
}

function attributedCriterion(bilan: Reviewed, criterionPosition: number, taskId?: string) {
 const criterion = bilan.criteria[criterionPosition];
 const observation = bilan.result.criteria.find(v => v.position === criterionPosition);
 if (!criterion || !observation) throw new Error('Critère inconnu pour ce bilan.');
 const { status, explanation, reason } = observation;
 const detail = { label: criterion.label, status, explanation, reason: reason ?? null };
 if (status === 'not_observed') {
  if (taskId) throw new Error('Un critère non observé ne peut pas recevoir de preuve.');
  return { ...detail, evidence: null };
 }
 const taskPosition = bilan.tasks.findIndex(task => task.id === taskId);
 if (!taskId || taskPosition < 0 || !observation.taskIds.includes(taskId)) throw new Error('Choisir une tâche citée dans le retour de ce critère.');
 const { type } = bilan.tasks[taskPosition].definition;
 if (type !== 'free_text' && !(bilan.notions.length === 1 && (type === 'cloze' || type === 'sentence'))) {
  throw new Error('Attribuer le constat à une production écrite ou une tâche ciblée sur une seule notion.');
 }
 return { ...detail, evidence: { taskId, type, position: taskPosition } };
}

function compareCriteria(input: z.infer<typeof assessmentComparisonSchema>['criteria'], first: Reviewed, second: Reviewed) {
 if (new Set(input.map(c => c.firstPosition)).size !== input.length || new Set(input.map(c => c.secondPosition)).size !== input.length) {
  throw new Error('Chaque critère ne peut être comparé qu’une fois.');
 }
 return input.map(({ firstPosition, secondPosition, firstTaskId, secondTaskId }) => {
  const initial = attributedCriterion(first, firstPosition, firstTaskId);
  const followUp = attributedCriterion(second, secondPosition, secondTaskId);
  if (initial.evidence && followUp.evidence && initial.evidence.position !== followUp.evidence.position) {
   throw new Error('Choisir les tâches correspondantes dans les deux bilans.');
  }
  const outcome = !initial.evidence || !followUp.evidence ? 'insufficient' as const :
   initial.status === 'needs_work' || followUp.status === 'needs_work' ? 'fragile' as const : 'observed_in_both' as const;
  return { firstPosition, secondPosition, first: initial, second: followUp, outcome };
 });
}

export function publishAssessmentComparison(input: unknown) {
 const v = assessmentComparisonSchema.parse(input);
 return write(db => mutation(db, v.requestId, 'assessment-comparison', v, () => {
  if (v.firstAssessmentId === v.secondAssessmentId) throw new Error('Choisir deux bilans distincts.');
  checkContext(v.firstContext, v.secondContext);
  const first = reviewedAssessmentForComparison(db, v.firstAssessmentId);
  const second = reviewedAssessmentForComparison(db, v.secondAssessmentId);
  if (first.submittedAt > second.startedAt) throw new Error('Le second bilan doit avoir été commencé après le premier rendu.');
  const targets = notionIds(first);
  if (!targets.includes(v.notionId) || JSON.stringify(targets) !== JSON.stringify(notionIds(second))) {
   throw new Error('Les deux bilans doivent cibler les mêmes notions, dont celle à comparer.');
  }
  if (JSON.stringify(taskFormats(first)) !== JSON.stringify(taskFormats(second))) {
   throw new Error('Les formats et l’ordre des tâches doivent être comparables.');
  }
  if (db.prepare(`SELECT 1 FROM assessment_comparisons WHERE notion_id=? AND
   min(first_assessment_id, second_assessment_id)=min(?, ?) AND max(first_assessment_id, second_assessment_id)=max(?, ?)`)
   .get(v.notionId, v.firstAssessmentId, v.secondAssessmentId, v.firstAssessmentId, v.secondAssessmentId)) {
   throw new Error('Ces bilans ont déjà été comparés pour cette notion.');
  }
  const criteria = compareCriteria(v.criteria, first, second);
  const id = randomUUID(), publishedAt = new Date().toISOString();
  db.prepare(`INSERT INTO assessment_comparisons
   (id,notion_id,first_assessment_id,second_assessment_id,first_context,second_context,rationale,criteria_json,published_at)
   VALUES (?,?,?,?,?,?,?,?,?)`)
   .run(id, v.notionId, v.firstAssessmentId, v.secondAssessmentId, v.firstContext, v.secondContext, v.rationale, JSON.stringify(criteria), publishedAt);
  return { id, publishedAt };
 }));
}

type ComparisonRow = {
 id: string; notion_id: string; notion: string; first_assessment_id: string; second_assessment_id: string;
 first_title: string; second_title: string; first_context: string; second_context: string; first_date: string; second_date: string;
 rationale: string; criteria_json: string; published_at: string;
};

export function listAssessmentComparisons(input: unknown = {}) {
 const v = listAssessmentComparisonsSchema.parse(input), db = openDatabase();
 try {
  const rows = db.prepare(`SELECT c.*,n.name AS notion,a.title AS first_title,b.title AS second_title,
   a.submitted_at AS first_date,b.submitted_at AS second_date
   FROM assessment_comparisons c JOIN notions n ON n.id=c.notion_id
   JOIN assessments a ON a.id=c.first_assessment_id JOIN assessments b ON b.id=c.second_assessment_id
   WHERE (c.notion_id=? OR ? IS NULL) AND (c.id=? OR ? IS NULL)
   ORDER BY c.published_at DESC,c.id LIMIT ? OFFSET ?`)
   .all(v.notionId ?? null, v.notionId ?? null, v.comparisonId ?? null, v.comparisonId ?? null, v.limit+1, v.offset) as ComparisonRow[];
  return {
   comparisons: rows.slice(0, v.limit).map(row => ({
    id: row.id, notion: { id: row.notion_id, label: row.notion }, publishedAt: row.published_at, rationale: row.rationale,
    first: { assessmentId: row.first_assessment_id, title: row.first_title, context: row.first_context, submittedAt: row.first_date },
    second: { assessmentId: row.second_assessment_id, title: row.second_title, context: row.second_context, submittedAt: row.second_date },
    criteria: JSON.parse(row.criteria_json) as ReturnType<typeof compareCriteria>,
   })),
   nextOffset: rows.length > v.limit ? v.offset+v.limit : null,
  };
 } finally {
  db.close();
 }
}
export type AssessmentComparisons = ReturnType<typeof listAssessmentComparisons>;
