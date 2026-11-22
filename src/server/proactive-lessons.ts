import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { romeDay } from '../lib/revision';
import { openDatabase } from './database.mjs';
import { composeSchema, compositionFields, insertComposedDraft } from './bank';
import { lessonEvidence, promptKey } from './learning-signals';
import { lessonMilestones } from './proactive-progress';
import { id, text, type SessionTakeaway } from './schemas';
import { mutation, write, type Database } from './store';

type LessonStatus = 'draft' | 'advised' | 'in_progress' | 'j0_completed' | 'dismissed';
type Lesson = {
 id:string; notion_id:string; notion:string; session_id:string; reason:string; status:LessonStatus;
 title:string; objective:string; request_id:string; created_at:string; advised_at:string|null;
 started_at:string|null; j0_date:string|null; dismissed_at:string|null; dismissed_reason:string|null;
};
type Prompt = {itemId:string;content:string;instruction:string;type:string;answerJson:string};
const lessonSelect = `SELECT l.*,s.title,s.objective,s.request_id,n.name AS notion FROM proactive_lessons l
 JOIN sessions s ON s.id=l.session_id JOIN notions n ON n.id=l.notion_id`;

export const createLessonSchema = z.object({
 ...compositionFields, notionId:id, reason:text.max(500), evidenceAttemptIds:z.array(id).min(2).max(20),
}).strict()
 .refine(v=>!/^italiano-daily-\d{4}-\d{2}-\d{2}$/.test(v.requestId),'Cette clé est réservée aux séances quotidiennes.')
 .refine(v=>new Set(v.evidenceAttemptIds).size===v.evidenceAttemptIds.length,'Preuves dupliquées.');
export const publishLessonSchema = z.object({lessonId:id,requestId:id}).strict();
export const lessonActionSchema = z.object({lessonId:id,requestId:id,action:z.enum(['start','dismiss'])}).strict();
export const listLessonsSchema = z.object({
 requestId:id.optional(), limit:z.number().int().min(1).max(50).default(20), offset:z.number().int().min(0).max(10000).default(0),
}).strict();

function findLesson(d: Database, lessonId: string) {
 const row = d.prepare(lessonSelect+' WHERE l.id=?').get(lessonId) as Lesson | undefined;
 if (!row) throw new Error('Leçon inconnue.');
 return row;
}

function evidenceIds(d: Database, lessonId: string) {
 return (d.prepare('SELECT attempt_id FROM proactive_lesson_evidence WHERE lesson_id=? ORDER BY attempt_id').all(lessonId) as {attempt_id:string}[]).map(e=>e.attempt_id);
}

function validEvidence(d: Database, l: Lesson, at: Date) {
 return lessonEvidence(d,l.notion_id,evidenceIds(d,l.id),at);
}

export function createLesson(input: unknown) {
 const v = createLessonSchema.parse(input);
 const {notionId,reason,evidenceAttemptIds,...composition} = v;
 return write(d=>mutation(d,v.requestId,'create-lesson',v,()=>{
  const at = new Date();
  if (lessonEvidence(d,notionId,evidenceAttemptIds,at).length !== evidenceAttemptIds.length) {
   throw new Error('Choisissez au moins deux preuves valides et distinctes de cette notion.');
  }
  const sessionId = insertComposedDraft(d,composeSchema.parse({...composition,scheduledDate:romeDay(at)}));
  const lessonId = randomUUID();
  d.prepare("INSERT INTO proactive_lessons (id,notion_id,session_id,reason,status,created_at) VALUES (?,?,?,?,'draft',?)")
   .run(lessonId,notionId,sessionId,reason,at.toISOString());
  const insert = d.prepare('INSERT INTO proactive_lesson_evidence VALUES (?,?)');
  for (const attemptId of evidenceAttemptIds) insert.run(lessonId,attemptId);
  return {id:lessonId,sessionId};
 }));
}

function samePrompt(a: Prompt, b: Prompt) {
 return a.itemId===b.itemId || promptKey(a.content,a.instruction,a.type,a.answerJson)===promptKey(b.content,b.instruction,b.type,b.answerJson);
}

function validateJ0(d: Database, l: Lesson, evidence: Prompt[]) {
 const items = d.prepare(`SELECT v.item_id AS itemId,v.content,v.instruction,v.type,v.answer_json AS answerJson
  FROM exercises e JOIN item_versions v ON v.id=e.version_id WHERE e.session_id=? ORDER BY e.position`).all(l.session_id) as Prompt[];
 const open = items.filter(i=>i.type==='free_text' || i.type==='sentence' && JSON.parse(i.answerJson).format!=='word_order');
 const final = items.at(-1);
 if (items.length<2 || open.length!==1 || open[0]!==final || final.type==='sentence' && JSON.parse(final.answerJson).format==='dialogue') {
  throw new Error('Le J0 exige au moins un exercice fermé, puis un seul champ écrit final.');
 }
 const cards = JSON.parse(d.prepare('SELECT cards_json FROM session_takeaways WHERE session_id=?').get(l.session_id)?.cards_json ?? '[]') as SessionTakeaway[];
 if (cards.length!==1 || cards[0].examples.length>2) throw new Error('Ajoutez une carte « À retenir » avec un ou deux exemples traduits.');
 const tagged = d.prepare('SELECT 1 FROM item_notions WHERE item_id=? AND notion_id=?');
 if (!tagged.get(final.itemId,l.notion_id) || !items.slice(0,-1).some(item=>tagged.get(item.itemId,l.notion_id))) {
  throw new Error('Identifiez la notion principale sur le champ final et au moins un exercice fermé.');
 }
 if (items.some(i=>evidence.some(e=>samePrompt(i,e)))) throw new Error('Le J0 doit proposer des énoncés différents des preuves.');
}

export function publishLesson(input: unknown) {
 const v = publishLessonSchema.parse(input);
 return write(d=>mutation(d,v.requestId,'publish-lesson',v,()=>{
  const l = findLesson(d,v.lessonId), at = new Date(), stamp = at.toISOString();
  if (l.status!=='draft') throw new Error('Seul un brouillon de leçon peut être conseillé.');
  const evidence = validEvidence(d,l,at);
  if (evidence.length!==evidenceIds(d,l.id).length) throw new Error('Les preuves de la proposition doivent encore être admissibles.');
  const slot = d.prepare("SELECT id,status FROM proactive_lessons WHERE status IN ('advised','in_progress')").get();
  if (slot) {
   if (slot.status==='in_progress' || validEvidence(d,findLesson(d,slot.id),at).length>=2) throw new Error('Une leçon occupe déjà la place.');
   d.prepare("UPDATE proactive_lessons SET status='dismissed',dismissed_reason='evidence',dismissed_at=? WHERE id=?").run(stamp,slot.id);
  }
  if (d.prepare(`SELECT 1 FROM proactive_milestones m JOIN proactive_lessons l ON l.id=m.lesson_id
    WHERE l.notion_id=? AND m.completed_at IS NULL`).get(l.notion_id)) throw new Error('Un cycle est déjà actif pour cette notion.');
  const dismissed = d.prepare(`SELECT v.item_id AS itemId,v.content,v.instruction,v.type,v.answer_json AS answerJson
   FROM proactive_lesson_evidence p JOIN proactive_lessons l ON l.id=p.lesson_id
   JOIN learning_attempts a ON a.id=p.attempt_id JOIN item_versions v ON v.id=a.version_id
   WHERE l.notion_id=? AND l.dismissed_reason='student'`).all(l.notion_id) as Prompt[];
  if (dismissed.length && evidence.every(e=>dismissed.some(previous=>samePrompt(e,previous)))) {
   throw new Error('Cette notion écartée demande au moins une nouvelle preuve.');
  }
  validateJ0(d,l,evidence);
  d.prepare("UPDATE sessions SET status='published',updated_at=? WHERE id=?").run(stamp,l.session_id);
  d.prepare("UPDATE proactive_lessons SET status='advised',advised_at=? WHERE id=?").run(stamp,l.id);
  return {id:l.id,sessionId:l.session_id,status:'advised'};
 }));
}

function studentLesson(d: Database, l: Lesson, at = new Date()) {
 const inProgress = l.status==='in_progress';
 return {
  id:l.id,sessionId:l.session_id,notion:l.notion,title:l.title,objective:l.objective,reason:l.reason,
  status:l.status,canStart:l.status==='advised' && validEvidence(d,l,at).length>=2,j0Date:l.j0_date,
  minutes:Math.ceil(Number(d.prepare(`SELECT SUM(CASE WHEN v.type IN ('free_text','sentence')
    AND (v.type='free_text' OR json_extract(v.answer_json,'$.format')<>'word_order') THEN 180 ELSE 30 END) AS seconds
    FROM exercises e JOIN item_versions v ON v.id=e.version_id WHERE e.session_id=?`).get(l.session_id)?.seconds ?? 0)/60),
  waitingForCorrection:inProgress && Boolean(d.prepare(`SELECT 1 FROM exercises e JOIN learning_attempts a ON a.occurrence_id=e.id
   WHERE e.session_id=? AND a.status='pending_teacher'`).get(l.session_id)),
  milestones:lessonMilestones(d,l.id),
 };
}

export function activeStudentLesson(d: Database, at: Date) {
 const row = d.prepare(lessonSelect+" WHERE l.status IN ('advised','in_progress')").get() as Lesson | undefined;
 return row && {...studentLesson(d,row,at),startedAt:row.started_at};
}

export type StudentLesson = ReturnType<typeof studentLesson>;
export function getStudentLesson(lessonId: string) {
 id.parse(lessonId);
 const d = openDatabase();
 try {
  const lesson = findLesson(d,lessonId);
  if (lesson.status==='draft') throw new Error('Leçon inconnue.');
  return studentLesson(d,lesson);
 } finally {d.close();}
}

export function listStudentLessons() {
 const d = openDatabase();
 try {
  return (d.prepare(lessonSelect+" WHERE l.status<>'draft' ORDER BY l.advised_at DESC,l.id").all() as Lesson[])
   .map(l=>studentLesson(d,l));
 } finally {d.close();}
}

export function getTeacherLesson(lessonId: string) {
 id.parse(lessonId);
 const d = openDatabase();
 try {
  const l = findLesson(d,lessonId);
  return {...studentLesson(d,l),notionId:l.notion_id,requestId:l.request_id,createdAt:l.created_at,advisedAt:l.advised_at,
   startedAt:l.started_at,dismissedAt:l.dismissed_at,dismissedReason:l.dismissed_reason,evidenceAttemptIds:evidenceIds(d,l.id)};
 } finally {d.close();}
}

export function listTeacherLessons(input: unknown = {}) {
 const v = listLessonsSchema.parse(input), d = openDatabase();
 try {
  const rows = d.prepare(lessonSelect+` ${v.requestId ? 'WHERE s.request_id=?' : ''}
    ORDER BY l.created_at DESC,l.id LIMIT ? OFFSET ?`).all(...(v.requestId?[v.requestId]:[]),v.limit+1,v.offset) as Lesson[];
  const active = d.prepare(lessonSelect+" WHERE l.status IN ('advised','in_progress')").get() as Lesson | undefined;
  const summary = active && studentLesson(d,active);
  return {activeLesson:summary && (summary.status==='in_progress' || summary.canStart) ? summary : null,
   lessons:rows.slice(0,v.limit).map(l=>({...studentLesson(d,l),notionId:l.notion_id,requestId:l.request_id})),
   nextOffset:rows.length>v.limit ? v.offset+v.limit : null};
 } finally {d.close();}
}

export function actOnLesson(input: unknown) {
 const v = lessonActionSchema.parse(input);
 return write(d=>mutation(d,v.requestId,'student-lesson',v,()=>{
  const lesson = findLesson(d,v.lessonId), at = new Date(), stamp = at.toISOString();
  if (v.action==='start' && (lesson.status==='in_progress' || lesson.status==='j0_completed') ||
      v.action==='dismiss' && lesson.status==='dismissed') return {id:lesson.id,status:lesson.status};
  if (lesson.status!=='advised') throw new Error('Cette proposition est indisponible.');
  if (v.action==='start') {
   if (validEvidence(d,lesson,at).length<2) throw new Error('Cette proposition ne repose plus sur deux preuves valides.');
   d.prepare("UPDATE proactive_lessons SET status='in_progress',started_at=? WHERE id=?").run(stamp,lesson.id);
   return {id:lesson.id,status:'in_progress'};
  }
  d.prepare("UPDATE proactive_lessons SET status='dismissed',dismissed_reason='student',dismissed_at=? WHERE id=?").run(stamp,lesson.id);
  return {id:lesson.id,status:'dismissed'};
 }));
}
