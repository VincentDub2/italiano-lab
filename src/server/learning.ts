import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { openDatabase } from './database.mjs';
import { normalizeAnswer } from '../lib/answers';
import type { Answer, ExerciseType, Sentence } from '../lib/exercises';
import { calculateReview, romeDay, type ReviewEvent, type RevisionState } from '../lib/revision';
import { write, type Database } from './store';
import { id, isTokenOrder, sentenceSchema } from './schemas';

export type ItemRow = { id: string; item_id: string; cycle_id: string; group_id: string; type: ExerciseType; instruction: string; content: string; objective: string | null; choices_json: string | null; answer_json: string; explanation: string | null; source?: string; origin_id?: string | null };
export type LearningAttempt = { id: string; context: string; request_id: string; item_id: string; version_id: string; occurrence_id: string | null; series_id: string | null; question_id: string | null; answer: string; submitted_at: string; status: string; is_correct: number | null; feedback_json: string | null; reviewed_at: string | null; assisted: number | null; mode: string; content?: string; instruction?: string; type?: ItemRow['type']; title?: string; neutralized?: number };
export const rawAnswer = z.string().max(4000).refine(value => value.trim().length > 0, 'Réponse vide.');
export const answerInput = z.union([
 rawAnswer,
 z.array(rawAnswer).min(2).max(4).refine(replies => replies.reduce((total, reply) => total + reply.length, 0) <= 4000),
 z.array(z.number().int().nonnegative()).min(2).max(24),
]);
export const hintInput = { requestId: id, retryOf: id.optional(), level: z.number().int().min(1).max(5) };
type Presentation = { context: 'session'; occurrenceId: string } | { context: 'practice'; seriesId: string; questionId: string };
type DraftInput = { requestId: string; retryOf?: string };
type AnswerInput = Presentation & DraftInput & { answer: Answer; mode: string };
type SentenceDefinition = z.infer<typeof sentenceSchema>;
type SentenceProgress = { version_id: string; scope_id: string; hint_count: number; retry_of: string | null };

function publicSentence(definition: SentenceDefinition): Sentence {
 const hintCount = definition.hints?.length ?? 0;
 if (definition.format === 'word_order') return { format: definition.format, tokens: definition.tokens, hintCount };
 if (definition.format === 'dialogue') return { format: definition.format, turns: definition.turns, hintCount };
 return { format: definition.format, hintCount };
}
function sentenceDefinition(item: ItemRow): SentenceDefinition {
 return JSON.parse(item.answer_json) as SentenceDefinition;
}
export function teacherItem(item: ItemRow) {
 return { ...(item.type === 'sentence' ? { sentence: sentenceDefinition(item) } : { answer: JSON.parse(item.answer_json) }), explanation: item.explanation };
}
export function legacyExerciseType(type: ExerciseType) {
 // The bank version owns the type. The legacy session table has a fixed CHECK constraint.
 return type === 'sentence' ? 'free_text' : type;
}
export function itemVersion(d: Database, versionId: string): ItemRow {
 const row = d.prepare('SELECT v.*,b.group_id,b.source,b.origin_id FROM item_versions v JOIN bank_items b ON b.id=v.item_id WHERE v.id=?').get(versionId) as ItemRow | undefined;
 if (!row) throw new Error('Version inconnue.');
 return row;
}
export function bankRows(d: Database): ItemRow[] {
 return d.prepare(`SELECT v.*,b.group_id,b.source,b.origin_id FROM bank_items b JOIN item_versions v ON v.id=b.current_version_id WHERE b.source='prof' AND b.available=1 ORDER BY b.rowid`).all() as ItemRow[];
}
export function expose(d: Database, itemId: string, at = new Date(), kind = 'correction') {
 d.prepare('INSERT OR IGNORE INTO answer_exposures VALUES (?,?,?,?)').run(itemId, romeDay(at), kind, at.toISOString());
}
export function history(d: Database, itemId: string): LearningAttempt[] {
 return d.prepare(`SELECT a.*,v.content,v.instruction,v.type,s.title,EXISTS(SELECT 1 FROM feedback_rectifications f WHERE f.attempt_id=a.id) AS neutralized FROM learning_attempts a JOIN item_versions v ON v.id=a.version_id LEFT JOIN exercises e ON e.id=a.occurrence_id LEFT JOIN sessions s ON s.id=e.session_id WHERE a.item_id=? ORDER BY a.submitted_at,a.rowid`).all(itemId) as LearningAttempt[];
}
export function reviewFor(d: Database, item: ItemRow) {
 const attempts = d.prepare(`SELECT a.*,EXISTS(SELECT 1 FROM feedback_rectifications f WHERE f.attempt_id=a.id) AS neutralized FROM learning_attempts a JOIN item_versions v ON v.id=a.version_id WHERE a.item_id=? AND v.cycle_id=? ORDER BY a.submitted_at,a.rowid`).all(item.item_id, item.cycle_id) as LearningAttempt[];
 const events: ReviewEvent[] = attempts.map(a => ({ submittedAt: a.submitted_at, reviewedAt: a.reviewed_at, assisted: a.assisted === null ? null : Boolean(a.assisted), result: a.neutralized ? 'neutralized' : a.status === 'pending_teacher' ? 'pending' : a.status === 'self_assessed' ? 'self' : a.is_correct === 1 ? 'correct' : a.is_correct === 0 ? 'incorrect' : 'partial' }));
 const review = calculateReview(events);
 if (review.due && attempts.length && attempts.every(a => a.assisted === null)) {
  const imported = d.prepare('SELECT imported_at FROM bank_import WHERE version=6').get();
  if (imported) review.due = [review.due,romeDay(imported.imported_at)].sort().at(-1)!;
 }
 return review;
}
export function saveReview(d: Database, item: ItemRow) {
 const r = reviewFor(d, item);
 d.prepare('INSERT OR REPLACE INTO revision_state VALUES (?,?,?,?,?,?,?,?)').run(item.item_id,item.cycle_id,r.state,r.successes,r.step,r.due,r.lastSuccess,Number(r.pending));
 return r;
}
export function attemptResult(d: Database, a: LearningAttempt) {
 const rectifications = d.prepare('SELECT correction,explanation,created_at FROM feedback_rectifications WHERE attempt_id=? ORDER BY rowid').all(a.id) as { correction: string; explanation: string; created_at: string }[];
 const version = itemVersion(d,a.version_id);
 const choices = version.choices_json ? JSON.parse(version.choices_json) as {value:string;label:string}[] : [];
 const sentence = version.type === 'sentence' ? publicSentence(sentenceDefinition(version)) : undefined;
 const replies: string[] | undefined = sentence?.format === 'dialogue' ? JSON.parse(a.answer) : undefined;
 const answerLabel = sentence?.format === 'word_order'
  ? (JSON.parse(a.answer) as number[]).map(index => sentence.tokens[index]).join(' ')
  : replies?.join('\n') ?? (version.type === 'questionnaire' ? (a.context === 'practice' ? choices[Number(a.answer)] : choices.find(c => c.value === a.answer))?.label : undefined);
 const question = {type:version.type,instruction:version.instruction,content:version.content,...(sentence ? {sentence} : {}),...(choices.length ? {choices:choices.map((c,i)=>({value:a.context === 'practice' ? String(i) : c.value,label:c.label}))} : {})};
 const progress = sentence && readDraft(d,a.context,a.request_id);
 return { question, instruction:version.instruction, answerLabel, id: a.id, exercise_id: a.occurrence_id || a.question_id, item_id: a.item_id, version_id: a.version_id, request_id: a.request_id, answer: a.answer, status: a.status, is_correct: a.is_correct, submitted_at: a.submitted_at, reviewed_at: a.reviewed_at, assisted: a.assisted === null ? null : Boolean(a.assisted), context: a.context, mode: a.mode, feedback: a.feedback_json ? JSON.parse(a.feedback_json) : null, neutralized: rectifications.length > 0, rectifications, ...(replies ? {replies} : {}), ...(progress ? {retryOf:progress.retry_of,hintCount:progress.hint_count} : {}), ...(a.content ? { content: a.content, title: a.title } : {}), ...(a.status === 'self_assessed' ? { interval: { again:600000, hard:86400000, good:259200000, easy:604800000 }[a.answer.trim()] } : {}) };
}
export function hasReviewedToday(d: Database, item: ItemRow, revision: RevisionState, today: string) {
 if (!revision.due || revision.due<=today) return false;
 const successes = d.prepare('SELECT a.submitted_at FROM learning_attempts a JOIN item_versions v ON v.id=a.version_id WHERE a.item_id=? AND v.cycle_id=? AND a.is_correct=1 AND a.assisted=0 AND NOT EXISTS(SELECT 1 FROM feedback_rectifications f WHERE f.attempt_id=a.id)').all(item.item_id,item.cycle_id) as {submitted_at:string}[];
 return successes.some(a => romeDay(a.submitted_at) === today);
}
export function publicItem(d: Database, item: ItemRow, occurrenceId = item.item_id, practice = false) {
 const revision = reviewFor(d, item);
 const choices = item.choices_json ? JSON.parse(item.choices_json) as {value: string; label: string}[] : null;
 const notions = d.prepare('SELECT n.id,n.name FROM notions n JOIN item_notions x ON x.notion_id=n.id WHERE x.item_id=? ORDER BY n.name').all(item.item_id) as {id: string; name: string}[];
 const alreadyReviewed = hasReviewedToday(d,item,revision,romeDay());
 return { id: occurrenceId, item_id: item.item_id, version_id: item.id, group_id: item.group_id, type: item.type, instruction: item.instruction, content: item.content, objective: item.objective, origin_id: item.origin_id, notions, revision, alreadyReviewed, ...(choices ? { choices: choices.map((choice, i) => ({ value: practice ? String(i) : choice.value, label: choice.label })) } : {}), ...(item.type === 'sentence' ? { sentence: publicSentence(sentenceDefinition(item)) } : {}) };
}
function presentationAttempts(d: Database, presentation: Presentation, all = false) {
 const filter = presentation.context === 'session' ? 'occurrence_id=?' : 'series_id=? AND question_id=?';
 const args = presentation.context === 'session' ? [presentation.occurrenceId] : [presentation.seriesId,presentation.questionId];
 return d.prepare(`SELECT * FROM learning_attempts WHERE ${filter} ORDER BY submitted_at DESC,rowid DESC ${all ? '' : 'LIMIT 1'}`).all(...args) as LearningAttempt[];
}
export function presentationResults(d: Database, item: ItemRow, presentation: Presentation, recordExposure = true) {
 const sentence = item.type === 'sentence';
 const rows = presentationAttempts(d,presentation,sentence);
 if (recordExposure && rows.some(attempt => attempt.feedback_json)) expose(d,item.item_id);
 const results = rows.map(attempt => attemptResult(d,attempt));
 return { latestAttempt:results[0] ?? null, ...(sentence ? {sentenceHistory:results} : {}) };
}
export function retryReady(d: Database, context: string, scope: string, itemId: string) {
 const clause = context === 'session' ? 'e.session_id=?' : 'a.series_id=?';
 const rows = d.prepare(`SELECT a.* FROM learning_attempts a LEFT JOIN exercises e ON e.id=a.occurrence_id WHERE a.context=? AND ${clause} ORDER BY a.submitted_at,a.rowid`).all(context, scope) as LearningAttempt[];
 const own = rows.filter(a => a.item_id === itemId);
 if (own.length !== 1 || !(own[0].is_correct === 0 || own[0].status === 'corrected' && own[0].is_correct === null) || d.prepare('SELECT 1 FROM feedback_rectifications WHERE attempt_id=?').get(own[0].id)) return false;
 const index = rows.findIndex(a => a.id === own[0].id);
 return new Set(rows.slice(index + 1).filter(a => a.item_id !== itemId && (!own[0].reviewed_at || a.submitted_at >= own[0].reviewed_at)).map(a => a.item_id)).size >= 3;
}
function gradeSentence(item: ItemRow, response: Answer) {
 const definition = sentenceDefinition(item);
 if (definition.format === 'word_order') {
  const order = z.array(z.number().int().nonnegative()).parse(response);
  if (!isTokenOrder(order,definition.tokens.length)) throw new Error('Utilisez chaque mot exactement une fois.');
  const words = (positions: number[]) => positions.map(index => definition.tokens[index]);
  const submitted = words(order);
  const accepted = definition.orders.map(positions => words(positions));
  const correct = accepted.some(sequence => sequence.every((word,i) => word === submitted[i]));
  return { correct:Number(correct), status:'auto_corrected', feedback:{accepted:accepted.map(sequence => sequence.join(' ')),explanation:item.explanation} };
 }
 if (definition.format === 'dialogue') z.array(rawAnswer).length(definition.turns.length).parse(response);
 else rawAnswer.parse(response);
 return { correct:null, status:'pending_teacher', feedback:null };
}
export function grade(item: ItemRow, response: Answer, mode: string, practice: boolean) {
 if (mode !== 'answer' && item.type !== 'flashcard') throw new Error('Mode incompatible.');
 if (item.type === 'sentence') return gradeSentence(item,response);
 const raw = rawAnswer.parse(response), answer = JSON.parse(item.answer_json);
 let correct: number | null = null;
 let status = 'pending_teacher';
 let feedback: Record<string, unknown> | null = null;
 if (item.type === 'flashcard' && mode === 'memory') { z.enum(['again','hard','good','easy']).parse(raw.trim()); status = 'self_assessed'; }
 else if (item.type === 'questionnaire') {
  const choices = JSON.parse(item.choices_json!) as {value: string; label: string}[];
  const value = raw.trim();
  const choice = practice ? /^(0|[1-9]\d*)$/.test(value) ? choices[Number(value)] : undefined : choices.find(c => c.value === value);
  if (!choice) throw new Error('Choix inconnu.');
  correct = Number(choice.value === answer.value); status = 'auto_corrected';
  feedback = { accepted: [choices.find(c => c.value === answer.value)!.label], explanation: item.explanation };
 } else if (item.type === 'cloze' || mode === 'translation') {
  const accepted: string[] = mode === 'translation' ? [answer.italian] : answer.accepted;
  let articleOmitted = false;
  if (mode === 'translation') {
   const normalize = (value: string) => normalizeAnswer(value).replace(/[.!?…]+$/u, '').trim();
   const expected = normalize(answer.italian), submitted = normalize(raw);
   // shortcut: article facultatif devant un seul mot, à élargir si les groupes nominaux doivent être reconnus.
   const noun = expected.match(/^(?:(?:il|lo|la|i|gli|le|un|uno|una) |(?:l|un)')(\p{L}[\p{L}\p{M}-]*)$/u)?.[1];
   articleOmitted = !!noun && submitted === noun;
   correct = Number(submitted === expected || articleOmitted);
  } else correct = Number(accepted.some(value => normalizeAnswer(value) === normalizeAnswer(raw)));
  status = 'auto_corrected';
  feedback = { accepted, explanation: item.explanation, ...(mode === 'translation' ? { example: answer.example } : {}), ...(articleOmitted ? { articleOmitted: true } : {}) };
 }
 return { correct, status, feedback };
}
function readDraft(d: Database, context: string, requestId: string) {
 return d.prepare('SELECT * FROM sentence_attempts WHERE context=? AND request_id=?').get(context,requestId) as SentenceProgress | undefined;
}
function sentenceProgress(d: Database, item: ItemRow, input: Presentation & DraftInput) {
 const scope = input.context === 'session' ? input.occurrenceId : input.seriesId;
 const latest = presentationAttempts(d,input)[0];
 const retryOf = input.retryOf ?? null;
 if (latest && (latest.id !== retryOf || !latest.feedback_json) || !latest && retryOf) {
  throw new Error('La reformulation doit suivre la dernière tentative corrigée.');
 }
 const draft = readDraft(d,input.context,input.requestId);
 if (draft) {
  if (draft.version_id !== item.id || draft.scope_id !== scope || draft.retry_of !== retryOf) throw new Error('Identifiant déjà utilisé.');
  return draft;
 }
 d.prepare('INSERT INTO sentence_attempts (context,request_id,version_id,scope_id,retry_of) VALUES (?,?,?,?,?)').run(input.context,input.requestId,item.id,scope,retryOf);
 return { hint_count:0, retry_of:retryOf };
}
export function revealSentenceHint(d: Database, item: ItemRow, input: Presentation & DraftInput & {level:number}) {
 if (item.type !== 'sentence' || reviewFor(d,item).pending) throw new Error('Indice indisponible.');
 const hints = sentenceDefinition(item).hints ?? [];
 if (input.level > hints.length) throw new Error('Indice inconnu.');
 const progress = sentenceProgress(d,item,input);
 if (input.level > progress.hint_count + 1) throw new Error('Les indices sont révélés dans l’ordre.');
 const count = Math.max(input.level,progress.hint_count);
 d.prepare('UPDATE sentence_attempts SET hint_count=? WHERE context=? AND request_id=?').run(count,input.context,input.requestId);
 return { hints:hints.slice(0,count) };
}
export function recordAnswer(d: Database, item: ItemRow, input: AnswerInput, at = new Date()) {
 const [occurrenceId,seriesId,questionId] = input.context === 'session' ? [input.occurrenceId,null,null] : [null,input.seriesId,input.questionId];
 const answer = typeof input.answer === 'string' ? input.answer : JSON.stringify(input.answer);
 if (item.type !== 'sentence' && input.retryOf) throw new Error('Reformulation incompatible.');
 const old = d.prepare('SELECT * FROM learning_attempts WHERE context=? AND request_id=?').get(input.context,input.requestId) as LearningAttempt | undefined;
 if (old) {
  const retryOf = item.type === 'sentence' ? readDraft(d,input.context,input.requestId)?.retry_of : null;
  if (old.occurrence_id !== occurrenceId || old.series_id !== seriesId || old.question_id !== questionId || old.answer !== (old.assisted === null ? answer.trim() : answer) || old.mode !== input.mode || (retryOf ?? null) !== (input.retryOf ?? null)) throw new Error('Identifiant déjà utilisé.');
  if (old.feedback_json) expose(d,item.item_id,at);
  return attemptResult(d,old);
 }
 const review = reviewFor(d,item);
 if (review.pending) throw new Error('Cet item attend une correction.');
 const progress = item.type === 'sentence' ? sentenceProgress(d,item,input) : null;
 const priorHint = progress && d.prepare(`SELECT 1 FROM sentence_attempts WHERE context=? AND scope_id=? AND version_id=?
  AND retry_of IS NULL AND hint_count>0`).get(input.context,occurrenceId ?? seriesId,item.id);
 const assisted = Boolean(priorHint || progress?.retry_of || d.prepare('SELECT 1 FROM answer_exposures WHERE item_id=? AND day=?').get(item.item_id,romeDay(at)));
 const result = grade(item,input.answer,input.mode,input.context === 'practice');
 const attemptId = randomUUID();
 d.prepare(`INSERT INTO learning_attempts (id,context,request_id,item_id,version_id,occurrence_id,series_id,question_id,answer,submitted_at,status,is_correct,feedback_json,assisted,mode) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(attemptId,input.context,input.requestId,item.item_id,item.id,occurrenceId,seriesId,questionId,answer,at.toISOString(),result.status,result.correct,result.feedback ? JSON.stringify(result.feedback) : null,Number(assisted),input.mode);
 saveReview(d,item);
 if (result.feedback) expose(d,item.item_id,at);
 return attemptResult(d,d.prepare('SELECT * FROM learning_attempts WHERE id=?').get(attemptId) as LearningAttempt);
}
function estimatedSeconds(type: ItemRow['type'] | undefined, answerJson?: string) {
 return type === 'free_text' || type === 'sentence' && (JSON.parse(answerJson!) as SentenceDefinition).format !== 'word_order' ? 180 : 30;
}
export function learningOverview(at = new Date(), existing?: Database) {
 const d = existing || openDatabase();
 try {
  const today = romeDay(at);
  const attempts = d.prepare('SELECT a.*,v.type,v.answer_json FROM learning_attempts a JOIN item_versions v ON v.id=a.version_id').all() as (LearningAttempt & {answer_json:string})[];
  const workedSeconds = attempts.filter(a => romeDay(a.submitted_at) === today).reduce((sum,a) => sum + (a.mode === 'memory' ? 15 : estimatedSeconds(a.type,a.answer_json)),0);
  const items = bankRows(d).map(item => ({ itemId: item.item_id, revision: reviewFor(d,item) }));
  const targetSeconds = 35 * 60;
  return { today, workedSeconds, targetSeconds, remainingSeconds: Math.max(0,targetSeconds-workedSeconds), dailyComplete: workedSeconds >= targetSeconds, due: items.filter(x => !x.revision.pending && x.revision.due && x.revision.due <= today).length, items };
 } finally { if (!existing) d.close(); }
}
export function selectItems(d: Database, options: { count: number; itemIds?: string[]; voluntary?: boolean }, at = new Date()) {
 const rows = bankRows(d).filter(item => !options.itemIds || options.itemIds.includes(item.item_id));
 if (options.itemIds?.some(id => !rows.some(row => row.item_id === id))) throw new Error('Item de banque inconnu.');
 const today = romeDay(at);
 const available = rows.map(item => ({ item, review:reviewFor(d,item), errors:Number(d.prepare("SELECT COUNT(*) AS n FROM learning_attempts a WHERE item_id=? AND (is_correct=0 OR (status='corrected' AND is_correct IS NULL)) AND NOT EXISTS(SELECT 1 FROM feedback_rectifications f WHERE f.attempt_id=a.id)").get(item.item_id)?.n || 0) })).filter(x => !x.review.pending && (options.voluntary || !x.review.due || x.review.due <= today));
 available.sort((a,b) => Number(!a.review.due) - Number(!b.review.due) || (a.review.due || '').localeCompare(b.review.due || '') || Number(b.review.state === 'rework') - Number(a.review.state === 'rework') || b.errors-a.errors || Number(!!b.item.origin_id)-Number(!!a.item.origin_id));
 let remaining = options.voluntary ? Infinity : learningOverview(at,d).remainingSeconds;
 let newItems = 0;
 const selected: ItemRow[] = [];
 for (const {item,review} of available) {
  if (selected.length >= options.count) break;
  const cost = estimatedSeconds(item.type,item.answer_json);
  if (cost > remaining || !options.voluntary && !review.due && newItems >= 5) continue;
  selected.push(item); remaining -= cost;
  if (!review.due) newItems++;
 }
 return selected;
}
const filtersSchema = z.object({ notion: z.string().max(200).optional(), date: z.iso.date().optional(), state: z.enum(['evaluate','rework','consolidating','consolidated']).optional(), view:z.enum(['active','history']).optional(), itemId: id.optional() }).strict();
export function journal(input: unknown = {}, student = true) {
 const filters = filtersSchema.parse(input);
 return write(d => {
  const items = bankRows(d).map(item => {
   const attempts = history(d,item.item_id);
   const errors = attempts.filter(a => a.is_correct === 0 || (a.status === 'corrected' && a.is_correct === null));
   if (!errors.length) return null;
   const pub = publicItem(d,item);
   if (filters.view === 'active' && pub.revision.state === 'consolidated') return null;
   if (filters.itemId && filters.itemId !== item.item_id || filters.state && pub.revision.state !== filters.state || filters.notion && !pub.notions.some(n => n.id === filters.notion || n.name === filters.notion) && item.objective !== filters.notion || filters.date && !errors.some(a => romeDay(a.submitted_at) === filters.date)) return null;
   if (student) expose(d,item.item_id);
   return { ...pub, lastError: errors.at(-1)!.submitted_at, history: attempts.map(a => attemptResult(d,a)) };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  return { items, today: romeDay(), importedAt:String(d.prepare('SELECT imported_at FROM bank_import WHERE version=6').get().imported_at) };
 });
}
