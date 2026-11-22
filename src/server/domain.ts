import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { openDatabase } from './database.mjs';
import { demo } from '../lib/demo';
import { rate, type Rating, type Review } from '../lib/study';
import { practiceSummary } from './practice';
import { id, text, sessionSchema, feedbackSchema, versionAnswer, type SessionTakeaway } from './schemas';
import { transaction, mutation, saveSessionTakeaways, write, type Database } from './store';
import { addBankItem } from './bank';
import { linkedEligibleFrom, sessionRevisionLinks, validateRevisionPublication } from './proactive-revisions';
import { hasJ0Attempt, recordProactiveProgress, validOccurrenceAttempt } from './proactive-progress';
import { normalizedObservations, readObservations, saveObservations } from './learning-signals';
import { itemVersion, publicItem, teacherItem, legacyExerciseType, attemptResult, presentationResults, recordAnswer, answerInput, expose, retryReady, saveReview, learningOverview, journal, hintInput, revealSentenceHint, type LearningAttempt } from './learning';
export { exerciseSchema, sessionSchema, feedbackSchema } from './schemas';

const db = () => { const d = openDatabase(); for (const c of demo) d.prepare('INSERT OR IGNORE INTO vocabulary VALUES (?,?,?,?,?,?,?)').run(c.id,c.italian,c.french,c.example,c.translation,c.theme,c.source); return d; };
const now = () => new Date().toISOString();
function sessionTakeawaysJson(d: Database, sessionId: string) {
 return String(d.prepare('SELECT cards_json FROM session_takeaways WHERE session_id=?').get(sessionId)?.cards_json ?? '[]');
}
export function createSession(input: unknown, source: 'prof' | 'demo' = 'prof') {
 const v = sessionSchema.parse(input), d = db();
 try { return transaction(d, () => mutation(d,v.requestId,'create-session',{ ...v, source },() => {
  const old = d.prepare('SELECT * FROM sessions WHERE request_id=?').get(v.requestId);
  if (old) {
   const expected = v.exercises.flatMap(e => ('items' in e ? e.items : [e]).map(item => ({ type:legacyExerciseType(e.type), instruction:e.instruction, content:item.content, explanation:item.explanation || null, answer_json:versionAnswer(item), objective:e.objective || null, weight:e.weight || null, choices_json:'choices' in item ? JSON.stringify(item.choices) : null })));
   const actual = d.prepare('SELECT * FROM exercises WHERE session_id=? ORDER BY position').all(old.id);
   if (old.title !== v.title || old.objective !== v.objective || old.scheduled_date !== v.scheduledDate || old.source !== source || actual.length !== expected.length || expected.some((e,i) => Object.entries(e).some(([key,value]) => actual[i][key] !== value))) throw new Error('Identifiant déjà utilisé.');
   if (sessionTakeawaysJson(d,String(old.id)) !== JSON.stringify(v.reminders ?? v.takeaways ?? [])) throw new Error('Identifiant déjà utilisé.');
   return { id:String(old.id) };
  }
  const sessionId = randomUUID(), time = now();
  d.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?)').run(sessionId,v.requestId,v.title,v.objective,v.scheduledDate,'draft',source,time,time);
  saveSessionTakeaways(d,sessionId,v.reminders ?? v.takeaways);
  const insert = d.prepare('INSERT INTO exercises (id,session_id,position,type,instruction,content,explanation,answer_json,weight,objective,group_id,choices_json,bank_item_id,version_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  let position = 0;
  for (const e of v.exercises) {
   const groupId = randomUUID();
   d.prepare('INSERT INTO bank_exercises VALUES (?,?,?,?,?)').run(groupId,e.instruction,e.type,e.objective || null,time);
   for (const item of 'items' in e ? e.items : [e]) {
    const occurrenceId = randomUUID();
    const row = { group_id:groupId, type:e.type, instruction:e.instruction, content:item.content, explanation:item.explanation || null, answer_json:versionAnswer(item), objective:e.objective || null, choices_json:'choices' in item ? JSON.stringify(item.choices) : null };
    const added = addBankItem(d,row,occurrenceId,source,null,false);
    insert.run(occurrenceId,sessionId,position++,legacyExerciseType(e.type),e.instruction,item.content,row.explanation,row.answer_json,e.weight || null,row.objective,'items' in e ? groupId : null,row.choices_json,added.itemId,added.versionId);
   }
  }
  return { id:sessionId };
 })); } finally { d.close(); }
}
export const publishSessionSchema = z.object({sessionId:id,requestId:id.optional()}).strict();
export function publishSession(sessionId: string, requestId?: string) {
 const v = publishSessionSchema.parse({sessionId,requestId});
 return write(d=>{
  const apply = () => {
   if (d.prepare('SELECT 1 FROM proactive_lessons WHERE session_id=?').get(sessionId)) throw new Error('Utilisez la publication de leçon.');
   const s = d.prepare('SELECT id,status,scheduled_date FROM sessions WHERE id=?').get(sessionId);
   if (!s || !d.prepare('SELECT 1 FROM exercises WHERE session_id=?').get(sessionId)) throw new Error('Séance inconnue ou vide.');
   if (s.status==='draft') validateRevisionPublication(d,s);
   d.prepare("UPDATE sessions SET status='published',updated_at=? WHERE id=? AND status='draft'").run(now(),sessionId);
   d.prepare('UPDATE bank_items SET available=1 WHERE id IN (SELECT bank_item_id FROM exercises WHERE session_id=?)').run(sessionId);
   return { id:String(s.id) };
  };
  return v.requestId ? mutation(d,v.requestId,'publish-session',v,apply) : apply();
 });
}

function remainingSessionWork(d: Database, sessionId: string) {
 const items = d.prepare(`SELECT e.id,e.version_id,(
  SELECT a.status FROM learning_attempts a WHERE a.occurrence_id=e.id ORDER BY a.submitted_at DESC,a.rowid DESC LIMIT 1
 ) AS last_status FROM exercises e WHERE e.session_id=?`).all(sessionId) as {id:string;version_id:string;last_status:string|null}[];
 let covered = 0, remaining = 0;
 for (const e of items) {
  const requiredFrom = linkedEligibleFrom(d,e.id);
  if (requiredFrom) {
   if (e.last_status!=='pending_teacher' && !validOccurrenceAttempt(d,e.id,requiredFrom,requiredFrom)) remaining++;
  } else if (!e.last_status) {
   if (publicItem(d,itemVersion(d,e.version_id)).alreadyReviewed) covered++;
   else remaining++;
  }
 }
 return {covered_today:covered,remaining};
}

const sessionDifficultySchema = z.object({ sessionId:id, difficulty:z.enum(['too_easy','just_right','too_hard']) }).strict();
export type SessionDifficulty = z.infer<typeof sessionDifficultySchema>['difficulty'];
export function submitSessionDifficulty(input: unknown) {
 const {sessionId,difficulty} = sessionDifficultySchema.parse(input);
 return write(d => {
  const published = d.prepare("SELECT 1 FROM sessions WHERE id=? AND status='published'").get(sessionId);
  if (!published || remainingSessionWork(d,sessionId).remaining > 0) throw new Error('La séance doit être terminée.');
  d.prepare('INSERT INTO session_difficulty (session_id,difficulty) VALUES (?,?) ON CONFLICT(session_id) DO UPDATE SET difficulty=excluded.difficulty').run(sessionId,difficulty);
  return {difficulty_feedback:difficulty};
 });
}

export function listSessions(student = false) {
 const d = db();
 try {
  const sessions = d.prepare(`SELECT s.*, f.difficulty AS difficulty_feedback,
   (SELECT COUNT(*) FROM exercises e WHERE e.session_id=s.id) AS total,
   (SELECT COUNT(*) FROM exercises e WHERE e.session_id=s.id AND EXISTS(SELECT 1 FROM learning_attempts a WHERE a.occurrence_id=e.id)) AS completed,
   (SELECT COUNT(*) FROM exercises e JOIN learning_attempts a ON a.occurrence_id=e.id WHERE e.session_id=s.id AND a.status='pending_teacher') AS pending
   FROM sessions s LEFT JOIN session_difficulty f ON f.session_id=s.id
   WHERE NOT EXISTS(SELECT 1 FROM proactive_lessons l WHERE l.session_id=s.id)
   ${student ? "AND s.status='published'" : ''} ORDER BY s.scheduled_date DESC,s.created_at DESC`).all() as (Record<string,unknown> & {id:string;total:number;completed:number;pending:number})[];
  return sessions.map(s => ({...s,...remainingSessionWork(d,s.id)}));
 } finally { d.close(); }
}
export function getSession(sessionId: string, student = false) {
 id.parse(sessionId); const d = db();
 try {
  const s = d.prepare(`SELECT s.*, f.difficulty AS difficulty_feedback FROM sessions s
   LEFT JOIN session_difficulty f ON f.session_id=s.id LEFT JOIN proactive_lessons l ON l.session_id=s.id
   WHERE s.id=? ${student ? "AND s.status='published' AND (l.id IS NULL OR l.status IN ('advised','in_progress','j0_completed'))" : ''}`).get(sessionId);
  if (!s) throw new Error('Séance inconnue.');
  const lesson = d.prepare('SELECT status,started_at FROM proactive_lessons WHERE session_id=?').get(sessionId);
  const rows = d.prepare('SELECT * FROM exercises WHERE session_id=? ORDER BY position').all(sessionId) as Record<string,unknown>[];
  const exercises = rows.map((e,index) => {
   const version = itemVersion(d,String(e.version_id));
   const fields = { ...publicItem(d,version,String(e.id)), session_id:sessionId, position:e.position, group_id:e.group_id, weight:e.weight };
   if (!student) return { ...fields, ...teacherItem(version) };
   if (lesson?.status==='advised') return { ...fields, alreadyReviewed:false, latestAttempt:null };
   const occurrenceId = String(e.id);
   const milestoneStart = linkedEligibleFrom(d,occurrenceId);
   const result = presentationResults(d,version,{context:'session',occurrenceId},!lesson);
   const needsAttempt = lesson?.status==='in_progress' ? !hasJ0Attempt(d,occurrenceId,lesson.started_at,index===rows.length-1)
    : Boolean(milestoneStart && !validOccurrenceAttempt(d,occurrenceId,milestoneStart,milestoneStart));
   return { ...fields, ...result, ...(lesson || milestoneStart ? {alreadyReviewed:false,needsAttempt} : {}),
    retryReady:version.type !== 'sentence' && retryReady(d,'session',sessionId,version.item_id) };
  });
  const takeaways = JSON.parse(sessionTakeawaysJson(d,sessionId)) as SessionTakeaway[];
  const revisionLinks = student ? [] : sessionRevisionLinks(d,sessionId);
  return { ...s, ...(lesson ? {session_kind:'lesson_j0'} : {}), reminders: takeaways, takeaways, exercises,
   ...(revisionLinks.length ? {revision_links:revisionLinks} : {}) };
 } finally { d.close(); }
}
function publishedExercise(d: ReturnType<typeof db>, exerciseId: string) {
 const e = d.prepare("SELECT e.* FROM exercises e JOIN sessions s ON s.id=e.session_id WHERE e.id=? AND s.status='published'").get(exerciseId);
 if (!e) throw new Error('Exercice inconnu.');
 const lesson = d.prepare('SELECT status FROM proactive_lessons WHERE session_id=?').get(e.session_id);
 if (lesson && !['in_progress','j0_completed'].includes(lesson.status)) throw new Error('Vous devez commencer la leçon.');
 return e;
}
export function reveal(exerciseId: string) {
 id.parse(exerciseId); const d = db();
 try { const e = publishedExercise(d,exerciseId); if (e.type !== 'flashcard') throw new Error('Exercice incompatible.'); expose(d,e.bank_item_id); return JSON.parse(e.answer_json); }
 finally { d.close(); }
}
const attemptSchema = z.object({ exerciseId:id, requestId:id, answer:answerInput, retryOf:id.optional(), mode:z.literal('translation').optional() }).strict();
export function submitAttempt(input: unknown) {
 const v = attemptSchema.parse(input), d = db();
 try { return transaction(d,() => {
  const e = publishedExercise(d,v.exerciseId), version = itemVersion(d,e.version_id);
  const mode = v.mode || (e.type === 'flashcard' ? 'memory' : 'answer');
  const replay = d.prepare("SELECT 1 FROM learning_attempts WHERE context='session' AND request_id=?").get(v.requestId);
  const at = new Date();
  const result = recordAnswer(d,version,{ requestId:v.requestId, answer:v.answer, retryOf:v.retryOf, context:'session', occurrenceId:v.exerciseId, mode },at);
  if (e.type === 'flashcard') {
   const answer = JSON.parse(e.answer_json), cardId = 'session:' + v.exerciseId;
   d.prepare('INSERT OR IGNORE INTO vocabulary VALUES (?,?,?,?,?,?,?)').run(cardId,answer.italian,e.content,answer.example,'',e.instruction,'Séance');
   if (mode === 'memory' && !replay) {
    const old = d.prepare('SELECT * FROM reviews WHERE card_id=?').get(cardId);
    const previous = old ? { reviewCount:old.review_count,lapses:old.lapses,lastReviewed:old.last_reviewed,dueAt:old.due_at,rating:old.rating } as Review : undefined;
    const r = rate(previous,result.answer.trim() as Rating,Date.parse(result.submitted_at));
    d.prepare('INSERT OR REPLACE INTO reviews VALUES (?,?,?,?,?,?)').run(cardId,r.reviewCount,r.lapses,r.lastReviewed,r.dueAt,r.rating);
   }
  }
  if (!replay) recordProactiveProgress(d,v.exerciseId,at);
  return result;
 }); } finally { d.close(); }
}
export function revealSessionHint(input: unknown) {
 const v = z.object({ exerciseId:id, ...hintInput }).strict().parse(input);
 const d = db();
 try {
  return transaction(d,() => {
   const exercise = publishedExercise(d,v.exerciseId);
   return revealSentenceHint(d,itemVersion(d,exercise.version_id),{...v,context:'session',occurrenceId:v.exerciseId});
  });
 } finally { d.close(); }
}
export function getAttempt(attemptId: string) {
 id.parse(attemptId); const d = db();
 try { const a = d.prepare('SELECT * FROM learning_attempts WHERE id=?').get(attemptId) as LearningAttempt | undefined; if (!a) throw new Error('Tentative inconnue.'); return { ...attemptResult(d,a), observations:readObservations(d,a.id) }; }
 finally { d.close(); }
}
export function pending(limit = 50, offset = 0) {
 z.number().int().min(1).max(100).parse(limit); z.number().int().min(0).parse(offset); const d = db();
 try {
  const rows = d.prepare("SELECT a.*,COALESCE(a.occurrence_id,a.question_id) AS exercise_id,v.instruction,v.content FROM learning_attempts a JOIN item_versions v ON v.id=a.version_id WHERE a.status='pending_teacher' ORDER BY a.submitted_at,a.id LIMIT ? OFFSET ?").all(limit,offset) as (LearningAttempt & {exercise_id:string})[];
  return rows.map(row => {
   const item = itemVersion(d,row.version_id);
   if (item.type !== 'sentence') return row;
   const {question,replies,hintCount,retryOf} = attemptResult(d,row);
   return {...row, question, replies, hintCount, retryOf, rubric:JSON.parse(item.answer_json).rubric};
  });
 }
 finally { d.close(); }
}
export function submitFeedback(input: unknown) {
 const v = feedbackSchema.parse(input), d = db();
 const observations = v.observations && normalizedObservations(v.observations);
 const apply = () => {
  const a = d.prepare("SELECT a.* FROM learning_attempts a JOIN item_versions v ON v.id=a.version_id WHERE a.id=? AND v.type IN ('free_text','sentence') AND a.status IN ('pending_teacher','corrected')").get(v.attemptId) as LearningAttempt | undefined;
  if (!a) throw new Error('Tentative inconnue.');
  const version = itemVersion(d,a.version_id);
  const definition = version.type === 'sentence' ? JSON.parse(version.answer_json) : null;
  const turns = definition?.format === 'dialogue' ? definition.turns.length : undefined;
  if (v.turns?.length !== turns) throw new Error('Fournissez un retour par réplique du dialogue, dans le même ordre.');
  const feedback = JSON.stringify({ result:v.result, correction:v.correction, explanation:v.explanation, retry:v.retry ?? false, ...(v.turns ? {turns:v.turns} : {}) });
  if (a.status === 'corrected') {
   if (a.feedback_json !== feedback || observations && JSON.stringify(normalizedObservations(readObservations(d,a.id))) !== JSON.stringify(observations)) {
    throw new Error('Retour déjà enregistré. Utiliser une rectification.');
   }
   return a.id;
  }
  const reviewedAt = new Date();
  d.prepare("UPDATE learning_attempts SET status='corrected',is_correct=?,feedback_json=?,reviewed_at=? WHERE id=?").run(v.result === 'partial' ? null : Number(v.result === 'correct'),feedback,reviewedAt.toISOString(),v.attemptId);
  if (observations) saveObservations(d,a.id,observations);
  saveReview(d,version);
  if (a.occurrence_id) recordProactiveProgress(d,a.occurrence_id,reviewedAt);
  return a.id;
 };
 try {
  return transaction(d,() => {
   const attemptId = v.requestId ? mutation(d,v.requestId,'submit-feedback',{...v,observations},apply) : apply();
   const attempt = d.prepare('SELECT * FROM learning_attempts WHERE id=?').get(attemptId) as LearningAttempt;
   return attemptResult(d,attempt);
  });
 } finally { d.close(); }
}

export function feedbackList() {
 const d = db();
 try { return (d.prepare("SELECT a.*,v.content,s.title FROM learning_attempts a JOIN item_versions v ON v.id=a.version_id LEFT JOIN exercises e ON e.id=a.occurrence_id LEFT JOIN sessions s ON s.id=e.session_id WHERE a.status IN ('pending_teacher','corrected') ORDER BY a.submitted_at DESC,a.rowid DESC").all() as LearningAttempt[]).map(a => { if (a.feedback_json) expose(d,a.item_id); return attemptResult(d,a); }); }
 finally { d.close(); }
}
export function learningSummary() {
 const d = db();
 try { return { practice:practiceSummary(), revisions:learningOverview(), errors:journal({},false).items, dueVocabulary:d.prepare('SELECT v.* FROM vocabulary v LEFT JOIN reviews r ON r.card_id=v.id WHERE r.card_id IS NULL OR r.due_at<=?').all(now()), difficulties:d.prepare("SELECT v.*,r.rating FROM vocabulary v JOIN reviews r ON r.card_id=v.id WHERE r.rating IN ('again','hard') ORDER BY r.last_reviewed DESC").all(), sessions:listSessions(), pending:pending() }; }
 finally { d.close(); }
}
export function revealVocabulary(cardId:string) {
 id.parse(cardId); const d=db();
 try {
  const card=d.prepare('SELECT * FROM vocabulary WHERE id=?').get(cardId);
  if (!card) throw new Error('Carte inconnue.');
  if (cardId.startsWith('session:')) {
   const occurrence=d.prepare('SELECT bank_item_id FROM exercises WHERE id=?').get(cardId.slice(8));
   if (occurrence) expose(d,occurrence.bank_item_id);
  }
  return {italian:card.italian,example:card.example};
 } finally {d.close();}
}
export function vocabulary() {const d=db(); try {return {cards:d.prepare('SELECT * FROM vocabulary ORDER BY rowid').all(), reviews:Object.fromEntries(d.prepare('SELECT * FROM reviews').all().map((r: Record<string,unknown>)=>[r.card_id,{reviewCount:r.review_count,lapses:r.lapses,lastReviewed:r.last_reviewed,dueAt:r.due_at,rating:r.rating}]))};} finally {d.close();} }
const cardSchema=z.object({id,italian:text,french:text,example:text,translation:text,theme:text,source:text}).strict();
const reviewSchema=z.object({reviewCount:z.number().int().positive(),lapses:z.number().int().nonnegative(),lastReviewed:z.iso.datetime(),dueAt:z.iso.datetime(),rating:z.enum(['again','hard','good','easy'])}).strict().refine(r=>r.lapses<=r.reviewCount);
export function importProgress(input: unknown) {const v=z.object({imported:z.array(cardSchema).max(10000),reviews:z.record(id,reviewSchema)}).strict().parse(input); const d=db(); try {return transaction(d,()=>{for(const c of v.imported) d.prepare('INSERT OR IGNORE INTO vocabulary VALUES (?,?,?,?,?,?,?)').run(c.id,c.italian,c.french,c.example,c.translation,c.theme,c.source); for(const [key,r] of Object.entries(v.reviews)) { if(d.prepare('SELECT id FROM vocabulary WHERE id=?').get(key)) d.prepare('INSERT OR IGNORE INTO reviews VALUES (?,?,?,?,?,?)').run(key,r.reviewCount,r.lapses,r.lastReviewed,r.dueAt,r.rating); } return {ok:true};});} finally {d.close();} }
export function reviewCard(cardId:string, rating:Rating) {id.parse(cardId); z.enum(['again','hard','good','easy']).parse(rating); const d=db(); try {return transaction(d,()=>{if(!d.prepare('SELECT id FROM vocabulary WHERE id=?').get(cardId)) throw new Error('Carte inconnue'); const old=d.prepare('SELECT * FROM reviews WHERE card_id=?').get(cardId); const previous=old ? {reviewCount:old.review_count,lapses:old.lapses,lastReviewed:old.last_reviewed,dueAt:old.due_at,rating:old.rating} as Review : undefined; const r=rate(previous,rating); d.prepare('INSERT OR REPLACE INTO reviews VALUES (?,?,?,?,?,?)').run(cardId,r.reviewCount,r.lapses,r.lastReviewed,r.dueAt,r.rating); return r;});} finally {d.close();} }
function seedDemoSession(requestId:string, create:() => {id:string}) {
 const d=db();
 try { if (d.prepare('SELECT 1 FROM sessions WHERE request_id=?').get(requestId)) return; }
 finally { d.close(); }
 const session=create();
 publishSession(String(session.id));
}
export function seedDemo() {seedDemoSession('demo-v2',()=>createSession({requestId:'demo-v2',title:'Premiers échanges',objective:'Pratiquer les salutations',scheduledDate:'2020-01-01',exercises:[
 {type:'flashcard',instruction:'Comment dit-on ?',items:[{content:'Bonjour',answer:{italian:'Buongiorno',example:'Buongiorno, come va?'}},{content:'Au revoir',answer:{italian:'Arrivederci',example:'Arrivederci, a presto!'}}]},
 {type:'cloze',instruction:'Complétez',items:[{content:'Io ___ italiano.',answer:{accepted:['parlo']},explanation:'Parlo est la première personne de parlare.'},{content:'Tu ___ italiano.',answer:{accepted:['parli']},explanation:'Parli est la deuxième personne de parlare.'}]},
 {type:'free_text',instruction:'Présentez-vous en italien.',items:[{content:'Écrivez une phrase.',answer:{}},{content:'Parlez de votre ville.',answer:{}}]},
]},'demo'));
 seedDemoSession('demo-questionnaire-v1',()=>createSession({requestId:'demo-questionnaire-v1',title:'Les goûts · Questionnaire',objective:'Choisir entre piace et piacciono',scheduledDate:'2020-01-01',exercises:[{type:'questionnaire',instruction:'Choisissez la forme correcte de piacere.',items:[
  {content:'Mi ___ il cane.',choices:[{value:'a',label:'piace'},{value:'b',label:'piacciono'}],answer:{value:'a'},explanation:'Il cane est singulier.'},
  {content:'Mi ___ i gatti.',choices:[{value:'a',label:'piace'},{value:'b',label:'piacciono'}],answer:{value:'b'},explanation:'I gatti est pluriel.'},
  {content:'Ti ___ la musica?',choices:[{value:'a',label:'piace'},{value:'b',label:'piacciono'}],answer:{value:'a'},explanation:'La musica est singulier.'},
 ]}]},'demo')); }
