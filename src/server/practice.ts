import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { openDatabase } from './database.mjs';
import { id } from './schemas';
import { transaction } from './store';
import { bankRows, publicItem, itemVersion, selectItems, recordAnswer, presentationResults, answerInput, expose, retryReady, hintInput, revealSentenceHint } from './learning';

const startSchema = z.object({ requestId:id, count:z.number().int().min(1).max(100), itemIds:z.array(id).min(1).max(100).optional(), voluntary:z.boolean().default(false) }).strict();
const questionIds = { seriesId:id, questionId:id };
const answerSchema = z.object({ ...questionIds, requestId:id, answer:answerInput, retryOf:id.optional(), mode:z.enum(['translation','memory']).optional() }).strict();
export function bank() {
 const d = openDatabase();
 try { return bankRows(d).map(item => publicItem(d,item,item.item_id,true)); } finally { d.close(); }
}
export function readSeries(d: ReturnType<typeof openDatabase>, seriesId: string) {
 const s = d.prepare('SELECT * FROM practice_series WHERE id=?').get(seriesId);
 if (!s) throw new Error('Série inconnue.');
 const rows = d.prepare('SELECT * FROM practice_questions WHERE series_id=? ORDER BY position').all(seriesId) as {version_id:string;question_id:string;group_id:string | null}[];
 const questions = rows.map(q => {
  const item = itemVersion(d,String(q.version_id));
  const pub = publicItem(d,item,String(q.question_id),true);
  return { ...pub, group_id:q.group_id, ...presentationResults(d,item,{context:'practice',seriesId,questionId:q.question_id}), retryReady:item.type !== 'sentence' && retryReady(d,'practice',seriesId,item.item_id) };
 });
 return { id:String(s.id), startedAt:String(s.started_at), questions };
}
export function getPracticeSeries(seriesId: string) {
 id.parse(seriesId);
 const d = openDatabase();
 try { return readSeries(d,seriesId); } finally { d.close(); }
}
function practiceQuestion(d: ReturnType<typeof openDatabase>, v: { seriesId:string; questionId:string }) {
 const question = d.prepare('SELECT * FROM practice_questions WHERE series_id=? AND question_id=?').get(v.seriesId,v.questionId);
 if (!question) throw new Error('Question inconnue.');
 return question;
}
export function startPractice(input: unknown) {
 const v = startSchema.parse(input), d = openDatabase();
 try { return transaction(d,() => {
  const old = d.prepare('SELECT * FROM practice_series WHERE request_id=?').get(v.requestId);
  const selection = JSON.stringify({ itemIds:v.itemIds || null, voluntary:v.voluntary });
  if (old) {
   if (old.requested_count !== v.count || old.selection_json && old.selection_json !== selection || !old.selection_json && (v.itemIds || v.voluntary)) throw new Error('Identifiant déjà utilisé.');
   return readSeries(d,String(old.id));
  }
  const selected = selectItems(d,v);
  const seriesId = randomUUID();
  d.prepare('INSERT INTO practice_series (id,request_id,requested_count,started_at,selection_json) VALUES (?,?,?,?,?)').run(seriesId,v.requestId,v.count,new Date().toISOString(),selection);
  const insert = d.prepare('INSERT INTO practice_questions (series_id,question_id,position,type,instruction,content,objective,choices_json,answer_json,explanation,group_id,bank_item_id,version_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  selected.forEach((item,position) => insert.run(seriesId,item.item_id,position,item.type,item.instruction,item.content,item.objective,item.choices_json,item.answer_json,item.explanation,item.group_id,item.item_id,item.id));
  return readSeries(d,seriesId);
 }); } finally { d.close(); }
}
export function answerPractice(input: unknown) {
 const v = answerSchema.parse(input), d = openDatabase();
 try { return transaction(d,() => {
  const q = practiceQuestion(d,v);
  const item = itemVersion(d,q.version_id);
  const attempt = recordAnswer(d,item,{ ...v, context:'practice', mode:v.mode || (item.type === 'flashcard' ? 'translation' : 'answer') });
  const correct = attempt.status === 'pending_teacher' ? null : attempt.is_correct === 1;
  return { correct, accepted:(attempt.feedback?.accepted || []) as string[], explanation:attempt.status === 'pending_teacher' ? null : attempt.feedback?.explanation ?? item.explanation, attempt, series:readSeries(d,v.seriesId) };
 }); } finally { d.close(); }
}
export function revealPracticeHint(input: unknown) {
 const v = z.object({ ...questionIds, ...hintInput }).strict().parse(input);
 const d = openDatabase();
 try {
  return transaction(d,() => {
   const question = practiceQuestion(d,v);
   return revealSentenceHint(d,itemVersion(d,question.version_id),{...v,context:'practice'});
  });
 } finally { d.close(); }
}
export function revealPractice(input: unknown) {
 const v = z.object({ seriesId:id, questionId:id }).strict().parse(input), d = openDatabase();
 try {
  const q = d.prepare('SELECT * FROM practice_questions WHERE series_id=? AND question_id=?').get(v.seriesId,v.questionId);
  if (!q || q.type !== 'flashcard') throw new Error('Carte inconnue.');
  expose(d,q.bank_item_id);
  return JSON.parse(q.answer_json);
 } finally { d.close(); }
}
export function practiceSummary() {
 const d = openDatabase();
 try { return {
  passages:Number(d.prepare("SELECT COUNT(DISTINCT series_id) AS n FROM learning_attempts WHERE context='practice'").get()?.n),
  notions:d.prepare('SELECT v.objective AS notion,COUNT(*) AS attempts,SUM(COALESCE(a.is_correct,0)) AS correct,MAX(a.submitted_at) AS last FROM learning_attempts a JOIN item_versions v ON v.id=a.version_id GROUP BY v.objective ORDER BY v.objective').all() as {notion:string | null;attempts:number;correct:number;last:string}[],
  questionStats:d.prepare('SELECT item_id AS id,COUNT(*) AS attempts,SUM(COALESCE(is_correct,0)) AS correct,MAX(submitted_at) AS last FROM learning_attempts GROUP BY item_id').all() as {id:string;attempts:number;correct:number;last:string}[],
 }; } finally { d.close(); }
}
