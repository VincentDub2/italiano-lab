import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { openDatabase } from './database.mjs';
import {
 assessmentIdSchema, listAssessmentsSchema, proposeAssessmentSchema, reviewAssessmentSchema, saveAssessmentSchema,
 studentAssessmentActionSchema, type AssessmentReport, type AssessmentResponse, type AssessmentStatus, type AssessmentTask,
} from './assessment-schemas';
import { mutation, write, type Database } from './store';
import { grade } from './learning';
import { isTokenOrder, sentenceSchema } from './schemas';

type Definition = z.infer<typeof saveAssessmentSchema>;
type AssessmentRow = {
 id: string; status: AssessmentStatus; revision: number; title: string; objective: string;
 reason: string; estimated_minutes: number; criteria_json: string; created_at: string;
 offered_at: string | null; started_at: string | null; submitted_at: string | null; closed_at: string | null;
};
export class StudentAssessmentError extends Error {
 constructor(message: string, readonly status: number) { super(message); }
}

function readAssessments<T>(read: (db: Database) => T) {
 const db = openDatabase();
 try {
  db.exec('BEGIN');
  return read(db);
 } finally {
  db.close();
 }
}

function assessmentRow(db: Database, assessmentId: string) {
 const row = db.prepare('SELECT * FROM assessments WHERE id=?').get(assessmentId) as AssessmentRow | undefined;
 if (!row) throw new StudentAssessmentError('Bilan introuvable.', 404);
 return row;
}

function assessmentSummary(row: AssessmentRow) {
 return {
  id: row.id, title: row.title, objective: row.objective, reason: row.reason,
  estimatedMinutes: row.estimated_minutes, status: row.status, revision: row.revision,
  offeredAt: row.offered_at, startedAt: row.started_at, submittedAt: row.submitted_at, closedAt: row.closed_at,
 };
}

function assessmentCriteria(row: AssessmentRow) {
 return (JSON.parse(row.criteria_json) as Definition['criteria']).map((criterion, position) => ({ position, ...criterion }));
}

function assessmentTasks(db: Database, assessmentId: string) {
 return (db.prepare('SELECT id,definition_json FROM assessment_tasks WHERE assessment_id=? ORDER BY position').all(assessmentId) as { id: string; definition_json: string }[]).map(row => ({
  id: row.id, definition: JSON.parse(row.definition_json) as AssessmentTask,
 }));
}

function assessmentNotions(db: Database, assessmentId: string) {
 return db.prepare(`SELECT n.id,n.name FROM assessment_notions a JOIN notions n ON n.id=a.notion_id
  WHERE a.assessment_id=? ORDER BY a.rowid`).all(assessmentId) as { id: string; name: string }[];
}

export function saveAssessment(input: unknown) {
 const v = saveAssessmentSchema.parse(input);
 return write(db => mutation(db, v.requestId, 'assessment-draft', v, () => {
  const assessmentId = v.assessmentId ?? randomUUID();
  const fields = [v.title, v.objective, v.reason, v.estimatedMinutes, JSON.stringify(v.criteria)] as const;
  const revision = v.assessmentId ? assessmentRow(db, assessmentId).revision + 1 : 0;
  if (v.assessmentId) {
   const updated = db.prepare(`UPDATE assessments SET title=?,objective=?,reason=?,estimated_minutes=?,criteria_json=?,revision=?
    WHERE id=? AND status='draft'`).run(...fields, revision, assessmentId);
   if (!updated.changes) throw new Error('Seul un brouillon peut être modifié.');
   db.prepare('DELETE FROM assessment_tasks WHERE assessment_id=?').run(assessmentId);
   db.prepare('DELETE FROM assessment_notions WHERE assessment_id=?').run(assessmentId);
  } else {
   db.prepare(`INSERT INTO assessments (id,status,title,objective,reason,estimated_minutes,criteria_json,created_at)
    VALUES (?,'draft',?,?,?,?,?,?)`).run(assessmentId, ...fields, new Date().toISOString());
  }
  const addNotion = db.prepare(`INSERT INTO assessment_notions SELECT ?,id FROM notions WHERE id=?`);
  for (const notionId of v.notionIds) {
   if (!addNotion.run(assessmentId, notionId).changes) throw new Error('Notion cible inconnue.');
  }
  const addTask = db.prepare('INSERT INTO assessment_tasks VALUES (?,?,?,?)');
  v.tasks.forEach((task, position) => addTask.run(randomUUID(), assessmentId, position, JSON.stringify(task)));
  return { assessmentId, revision };
 }));
}

function normalizedPrompt(value: string) {
 return value.normalize('NFKD').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]/gu, '');
}

function checkNovelty(db: Database, assessmentId: string) {
 const known = new Set<string>();
 const orderFingerprint = (tokens: string[]) => tokens.map(normalizedPrompt).sort().join('|');
 // Include older and currently accessible versions, even when there is no recorded attempt.
 for (const row of db.prepare('SELECT content FROM item_versions UNION SELECT content FROM exercises').iterate()) {
  known.add(normalizedPrompt(String(row.content)));
 }
 for (const row of db.prepare("SELECT answer_json FROM item_versions WHERE type='sentence'").iterate()) {
  const sentence = sentenceSchema.safeParse(JSON.parse(String(row.answer_json)));
  if (sentence.success && sentence.data.format === 'word_order') known.add(orderFingerprint(sentence.data.tokens));
 }
 const taskFingerprints = (task: AssessmentTask) => {
  const content = normalizedPrompt(task.content);
  const tokens = wordTokens(task);
  return tokens ? [content, orderFingerprint(tokens)] : [content];
 };
 for (const row of db.prepare(`SELECT t.definition_json FROM assessment_tasks t
  JOIN assessments a ON a.id=t.assessment_id WHERE a.id<>? AND a.started_at IS NOT NULL`).iterate(assessmentId)) {
  const task = JSON.parse(String(row.definition_json)) as AssessmentTask;
  for (const fingerprint of taskFingerprints(task)) known.add(fingerprint);
  if (task.support) known.add(normalizedPrompt(task.support));
 }
 for (const { definition } of assessmentTasks(db, assessmentId)) {
  const fingerprints = taskFingerprints(definition);
  const support = definition.support && normalizedPrompt(definition.support);
  if (fingerprints.some(fingerprint => !fingerprint || known.has(fingerprint)) || (support && known.has(support))) {
   throw new Error('Un énoncé a déjà été utilisé, ou ne permet pas de vérifier sa nouveauté.');
  }
  for (const fingerprint of fingerprints) known.add(fingerprint);
 }
}

export function proposeAssessment(input: unknown) {
 const v = proposeAssessmentSchema.parse(input);
 return write(db => mutation(db, v.requestId, 'assessment-propose', v, () => {
  const row = assessmentRow(db, v.assessmentId);
  if (row.status !== 'draft' || row.revision !== v.revision) throw new Error('Relire la version actuelle du brouillon avant de la proposer.');
  if (db.prepare("SELECT 1 FROM assessments WHERE status IN ('offered','in_progress')").get()) {
   throw new Error('Un bilan est déjà proposé ou en cours.');
  }
  checkNovelty(db, row.id);
  const offeredAt = new Date().toISOString();
  db.prepare("UPDATE assessments SET status='offered',offered_at=? WHERE id=?").run(offeredAt, row.id);
  return { assessmentId: row.id, status: 'offered' as const, offeredAt };
 }));
}

export function listTeacherAssessments(input: unknown) {
 const v = listAssessmentsSchema.parse(input);
 return readAssessments(db => {
  const rows = db.prepare(`SELECT * FROM assessments WHERE (? IS NULL OR status=?)
   ORDER BY COALESCE(submitted_at,offered_at,created_at) DESC,id LIMIT ? OFFSET ?`)
   .all(v.status ?? null, v.status ?? null, v.limit + 1, v.offset) as AssessmentRow[];
  return { assessments: rows.slice(0, v.limit).map(assessmentSummary), nextOffset: rows.length > v.limit ? v.offset + v.limit : null };
 });
}

export function getTeacherAssessment(assessmentId: string) {
 const { assessmentId: validatedId } = assessmentIdSchema.parse({ assessmentId });
 return readAssessments(db => {
  const row = assessmentRow(db, validatedId);
  const tasks = assessmentTasks(db, row.id);
  const hasFrozenAnswers = ['submitted', 'reviewed', 'abandoned'].includes(row.status);
  const responses = hasFrozenAnswers ? assessmentAnswers(db, row.id) : new Map<string, AssessmentResponse>();
  return {
   ...assessmentSummary(row), notions: assessmentNotions(db, row.id), criteria: assessmentCriteria(row),
   tasks: tasks.map(task => {
    const response = responses.get(task.id) ?? null;
    return {
     ...task, response,
     suggestedGrade: row.submitted_at ? suggestGrade(task.definition, response) : null,
    };
   }),
   result: row.status === 'reviewed' ? assessmentResult(db, row.id) : null,
  };
 });
}

export function listStudentAssessments() {
 return readAssessments(db => (db.prepare(`SELECT * FROM assessments WHERE status<>'draft'
  ORDER BY CASE WHEN status IN ('offered','in_progress') THEN 0 ELSE 1 END,offered_at DESC,id`).all() as AssessmentRow[]).map(assessmentSummary));
}

function assessmentAnswers(db: Database, assessmentId: string) {
 const rows = db.prepare(`SELECT a.task_id,a.response_json FROM assessment_answers a
  JOIN assessment_tasks t ON t.id=a.task_id WHERE t.assessment_id=?`).all(assessmentId) as { task_id: string; response_json: string }[];
 return new Map<string, AssessmentResponse>(rows.map(row => [String(row.task_id), JSON.parse(String(row.response_json)) as AssessmentResponse]));
}

function wordTokens(task: AssessmentTask) {
 return task.type === 'sentence' && task.sentence.format === 'word_order' ? task.sentence.tokens : null;
}

function publicTask(task: AssessmentTask) {
 return {
  type: task.type, instruction: task.instruction, content: task.content, support: task.support,
  choices: task.type === 'questionnaire' ? task.choices.map(choice => choice.label) : null,
  tokens: wordTokens(task),
 };
}

function assessmentResult(db: Database, assessmentId: string) {
 const row = db.prepare('SELECT reviewed_at,result_json FROM assessment_results WHERE assessment_id=?').get(assessmentId);
 if (!row) throw new Error('Résultat du bilan manquant.');
 const report = JSON.parse(String(row.result_json)) as AssessmentReport;
 const { lessonId, description } = report.nextAction;
 return {
  ...report, reviewedAt: String(row.reviewed_at),
  nextAction: { description, lessonHref: lessonId ? '/lecons/' + encodeURIComponent(lessonId) : null },
 };
}

export function getStudentAssessment(assessmentId: string) {
 const v = assessmentIdSchema.parse({ assessmentId });
 return readAssessments(db => {
  const row = assessmentRow(db, v.assessmentId);
  if (row.status === 'draft') throw new StudentAssessmentError('Bilan introuvable.', 404);
  const summary = {
   ...assessmentSummary(row), notions: assessmentNotions(db, row.id),
   criteria: assessmentCriteria(row).map(({ position, label }) => ({ position, label })),
  };
  if (row.status !== 'in_progress' && row.status !== 'reviewed') return { ...summary, status: row.status };
  const responses = assessmentAnswers(db, row.id);
  const tasks = assessmentTasks(db, row.id).map(task => ({
   id: task.id, ...publicTask(task.definition), response: responses.get(task.id) ?? null,
  }));
  if (row.status === 'in_progress') return { ...summary, status: row.status, tasks };
  return { ...summary, status: row.status, tasks, result: assessmentResult(db, row.id) };
 });
}

export type StudentAssessment = ReturnType<typeof getStudentAssessment>;
export type StudentAssessmentSummary = ReturnType<typeof assessmentSummary>;

function responseFits(task: AssessmentTask, response: AssessmentResponse, complete: boolean) {
 if (response.kind === 'unknown') return true;
 const { value } = response;
 const tokens = wordTokens(task);
 if (tokens) {
  return Array.isArray(value) && (complete ? isTokenOrder(value, tokens.length) :
   value.every(index => index < tokens.length) && new Set(value).size === value.length);
 }
 if (typeof value !== 'string') return false;
 if (task.type !== 'questionnaire') return true;
 return /^(0|[1-9]\d*)$/.test(value) && Number(value) < task.choices.length;
}

function suggestGrade(task: AssessmentTask, response: AssessmentResponse | null) {
 if (!response || response.kind !== 'answer' || task.type === 'free_text') return null;
 const answer = task.type === 'sentence' ? task.sentence : task.answer;
 const choices = task.type === 'questionnaire' ? task.choices : null;
 const value = choices ? choices[Number(response.value)].value : response.value;
 return grade({
  type: task.type, answer_json: JSON.stringify(answer), choices_json: choices && JSON.stringify(choices),
  explanation: task.explanation ?? null,
 }, value, 'answer', false);
}

function requireRevision(row: AssessmentRow, revision: number) {
 if (row.revision !== revision) {
  throw new StudentAssessmentError('Le bilan a changé dans un autre onglet. Actualisez le bilan.', 409);
 }
}

export function actOnAssessment(input: unknown) {
 const v = studentAssessmentActionSchema.parse(input);
 return write(db => mutation(db, v.requestId, 'assessment-student', v, () => {
  const row = assessmentRow(db, v.assessmentId);
  if (row.status === 'draft') throw new StudentAssessmentError('Bilan introuvable.', 404);
  const at = new Date().toISOString();
  let status = row.status;
  if ('revision' in v) requireRevision(row, v.revision);
  if (v.action === 'start' && row.status === 'offered') {
   status = 'in_progress';
   db.prepare('UPDATE assessments SET started_at=? WHERE id=?').run(at, row.id);
  } else if (v.action === 'close' && (row.status === 'offered' || row.status === 'in_progress')) {
   status = row.status === 'offered' ? 'dismissed' : 'abandoned';
   db.prepare('UPDATE assessments SET closed_at=? WHERE id=?').run(at, row.id);
  } else if (v.action === 'save' && row.status === 'in_progress') {
   const task = assessmentTasks(db, row.id).find(task => task.id === v.taskId);
   if (!task || (v.response && !responseFits(task.definition, v.response, false))) {
    throw new StudentAssessmentError('Réponse incompatible avec la tâche.', 400);
   }
   if (v.response) {
    db.prepare(`INSERT INTO assessment_answers VALUES (?,?)
     ON CONFLICT(task_id) DO UPDATE SET response_json=excluded.response_json`).run(task.id, JSON.stringify(v.response));
   } else {
    db.prepare('DELETE FROM assessment_answers WHERE task_id=?').run(task.id);
   }
  } else if (v.action === 'submit' && row.status === 'in_progress') {
   const responses = assessmentAnswers(db, row.id);
   for (const task of assessmentTasks(db, row.id)) {
    const response = responses.get(task.id);
    if (!response || !responseFits(task.definition, response, true)) {
     throw new StudentAssessmentError('Terminez chaque tâche ou indiquez « Je ne sais pas ».', 400);
    }
   }
   status = 'submitted';
   db.prepare('UPDATE assessments SET submitted_at=? WHERE id=?').run(at, row.id);
  } else {
   throw new StudentAssessmentError('Le bilan a changé d’état. Actualisez le bilan.', 409);
  }
  const revision = row.revision + 1;
  db.prepare('UPDATE assessments SET status=?,revision=? WHERE id=?').run(status, revision, row.id);
  return { assessmentId: row.id, status, revision };
 }));
}

export function reviewAssessment(input: unknown) {
 const { assessmentId, requestId, report } = reviewAssessmentSchema.parse(input);
 return write(db => mutation(db, requestId, 'assessment-review', { assessmentId, report }, () => {
  const row = assessmentRow(db, assessmentId);
  if (row.status !== 'submitted') throw new Error('Seul un bilan rendu et en attente peut être corrigé.');
  const tasks = assessmentTasks(db, row.id);
  const responses = assessmentAnswers(db, row.id);
  const taskResults = new Map(report.tasks.map(task => [task.taskId, task]));
  if (report.tasks.length !== tasks.length || !tasks.every(({ id }) => {
   const result = taskResults.get(id);
   return result && (result.verdict === 'unanswered') === (responses.get(id)?.kind === 'unknown');
  })) throw new Error('Fournir un résultat pour chaque tâche et identifier les réponses « Je ne sais pas ».');
  const criteria = assessmentCriteria(row);
  const criteriaResults = new Map(report.criteria.map(criterion => [criterion.position, criterion]));
  if (report.criteria.length !== criteria.length || !criteria.every(({ position }) => criteriaResults.has(position))) {
   throw new Error('Fournir un résultat pour chaque critère du bilan.');
  }
  for (const criterion of report.criteria) {
   const { status, reason, taskIds } = criterion;
   if (new Set(taskIds).size !== taskIds.length || taskIds.some(id => !responses.has(id))) {
    throw new Error('Les preuves doivent désigner des tâches distinctes de ce bilan.');
   }
   if (status !== 'not_observed') {
    if (reason || !taskIds.length || taskIds.some(id => responses.get(id)?.kind !== 'answer')) {
     throw new Error('Les preuves de ce critère doivent être des réponses au bilan.');
    }
   } else if (!reason || (reason === 'not_tested' ? taskIds.length !== 0 :
    !taskIds.length || taskIds.some(id => responses.get(id)?.kind !== 'unknown'))) {
    throw new Error('Préciser si le critère n’a pas été testé ou si une réponse manque.');
   }
  }
  const { lessonId } = report.nextAction;
  if (lessonId && !db.prepare("SELECT 1 FROM proactive_lessons WHERE id=? AND status IN ('advised','in_progress','j0_completed')").get(lessonId)) {
   throw new Error('Leçon publique inconnue ou indisponible.');
  }
  const reviewedAt = new Date().toISOString();
  db.prepare('INSERT INTO assessment_results VALUES (?,?,?)').run(row.id, reviewedAt, JSON.stringify(report));
  db.prepare("UPDATE assessments SET status='reviewed',revision=revision+1 WHERE id=?").run(row.id);
  return { assessmentId: row.id, status: 'reviewed' as const, reviewedAt };
 }));
}
