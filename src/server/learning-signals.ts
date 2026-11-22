import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { addDays, romeDay, romeDayStart } from '../lib/revision';
import { openDatabase } from './database.mjs';
import { id, text, observationSchema } from './schemas';
import { mutation, write, type Database } from './store';

type Observation = z.infer<typeof observationSchema>;
type Notion = { id: string; name: string };
type EvidenceRow = {
 attemptId: string; itemId: string; versionId: string; notionId: string; notion: string;
 context: 'session' | 'practice'; content: string; instruction: string;
 submittedAt: string; reviewedAt: string; explanation: string; answerJson: string; type: string;
};

type Evidence = EvidenceRow & {question:string};

export const notionSchema = z.object({requestId:id,name:text.max(200)}).strict();
export const signalsSchema = z.object({
 notionId:id.optional(), limit:z.number().int().min(1).max(50).default(20),
 offset:z.number().int().min(0).max(10000).default(0),
}).strict();

export function resolveNotion(d: Database, name: string) {
 d.prepare('INSERT OR IGNORE INTO notions VALUES (?,?)').run(randomUUID(),name);
 return d.prepare('SELECT id,name FROM notions WHERE name=?').get(name) as Notion;
}

export function resolveLearningNotion(input: unknown) {
 const v = notionSchema.parse(input);
 return write(d => mutation(d,v.requestId,'resolve-notion',v,() => resolveNotion(d,v.name)));
}

export function readObservations(d: Database, attemptId: string) {
 return d.prepare(`SELECT notion_id AS notionId,kind,explanation FROM learning_observations
  WHERE attempt_id=? ORDER BY notion_id,kind,explanation`).all(attemptId) as Observation[];
}

export function normalizedObservations(observations: Observation[]) {
 const unique = new Map(observations.map(o => [JSON.stringify(o),o]));
 return [...unique.keys()].sort().map(key => unique.get(key)!);
}

export function saveObservations(d: Database, attemptId: string, observations: Observation[]) {
 const known = d.prepare('SELECT 1 FROM notions WHERE id=?');
 const insert = d.prepare('INSERT INTO learning_observations VALUES (?,?,?,?)');
 for (const o of observations) {
  if (!known.get(o.notionId)) throw new Error('Notion inconnue.');
  insert.run(attemptId,o.notionId,o.kind,o.explanation);
 }
}

export function promptKey(content: string, instruction: string, type: string, answerJson: string) {
 const definition = type === 'sentence' ? JSON.parse(answerJson) as {format:string;turns?:string[];tokens?:string[]} : undefined;
 const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
 const parts = definition?.format==='word_order' ? (definition.tokens ?? []).map(normalize).sort() :
  (definition?.turns ?? []).map(normalize);
 return [normalize(content) || normalize(instruction),...parts].join('|');
}

function evidenceRows(d: Database, at: Date, notionId?: string) {
 const rows = d.prepare(`SELECT a.id AS attemptId,a.item_id AS itemId,a.version_id AS versionId,
  o.notion_id AS notionId,n.name AS notion,a.context,v.content,v.instruction,v.type,v.answer_json AS answerJson,
  a.submitted_at AS submittedAt,a.reviewed_at AS reviewedAt, MIN(o.explanation) AS explanation
  FROM learning_observations o JOIN notions n ON n.id=o.notion_id
  JOIN learning_attempts a ON a.id=o.attempt_id JOIN item_versions v ON v.id=a.version_id
  LEFT JOIN sentence_attempts h ON h.context=a.context AND h.request_id=a.request_id
  WHERE o.kind='error' AND a.status='corrected' AND a.assisted=0
    AND a.mode='answer' AND v.type IN ('free_text','sentence') AND COALESCE(h.hint_count,0)=0 AND h.retry_of IS NULL
    AND a.submitted_at>=? AND a.reviewed_at<=?
    AND NOT EXISTS(SELECT 1 FROM feedback_rectifications r WHERE r.attempt_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM learning_attempts old WHERE old.context=a.context AND old.rowid<a.rowid
      AND (old.occurrence_id=a.occurrence_id OR (old.series_id=a.series_id AND old.question_id=a.question_id)))
    ${notionId ? 'AND o.notion_id=?' : ''}
  GROUP BY a.id,o.notion_id ORDER BY a.submitted_at DESC,a.rowid DESC,o.notion_id`)
  .all(romeDayStart(addDays(romeDay(at),-29)),at.toISOString(),...(notionId ? [notionId] : [])) as EvidenceRow[];
 if (!rows.length) return [];
 const evidence = rows.map(row=>({...row,question:promptKey(row.content,row.instruction,row.type,row.answerJson)}));
 const firstAttempts = firstPromptAttempts(d,evidence.map(row=>row.question));
 return evidence.filter(row=>firstAttempts.has(row.attemptId));
}

export function firstPromptAttempts(d: Database, questions:string[], includeAutomatic = false) {
 const unresolved = new Set(questions);
 if (!unresolved.size) return new Set<string>();
 const firstAttempts = new Set<string>();
 const history = d.prepare(`SELECT a.id,v.content,v.instruction,v.type,v.answer_json AS answerJson
  FROM item_versions v JOIN learning_attempts a ON a.rowid=(
   SELECT h.rowid FROM learning_attempts h WHERE h.version_id=v.id AND h.mode='answer'
    AND h.status IN ('pending_teacher','corrected'${includeAutomatic ? ",'auto_corrected'" : ''}) ORDER BY h.submitted_at,h.rowid LIMIT 1
  ) ORDER BY a.submitted_at,a.rowid`).iterate() as Iterable<Pick<EvidenceRow,'content'|'instruction'|'type'|'answerJson'> & {id:string}>;
 for (const previous of history) {
  if (unresolved.delete(promptKey(previous.content,previous.instruction,previous.type,previous.answerJson))) firstAttempts.add(previous.id);
  if (!unresolved.size) break;
 }
 return firstAttempts;
}

export function distinctPrompts(a:{itemId:string;question:string},b:{itemId:string;question:string}) {
 return a.itemId!==b.itemId && a.question!==b.question;
}

function distinctEvidence(rows: Evidence[]) {
 const first = rows.find(row => rows.some(other => distinctPrompts(row,other)));
 if (!first) return [];
 const items = new Set([first.itemId]), prompts = new Set([first.question]);
 return [first,...rows.filter(row => {
  if (items.has(row.itemId) || prompts.has(row.question)) return false;
  items.add(row.itemId);
  prompts.add(row.question);
  return true;
 })];
}

export function lessonEvidence(d: Database, notionId: string, attemptIds: string[], at: Date) {
 const selected = new Set(attemptIds);
 return distinctEvidence(evidenceRows(d,at,notionId).filter(row => selected.has(row.attemptId)));
}

function recurrentEvidence(d:Database,at:Date,notionId?:string) {
 const grouped = new Map<string,Evidence[]>();
 for (const row of evidenceRows(d,at,notionId)) {
  const rows = grouped.get(row.notionId);
  if (rows) rows.push(row);
  else grouped.set(row.notionId,[row]);
 }
 return [...grouped.values()].map(distinctEvidence).filter(rows=>rows.length>0);
}

export function recurrentNotionIds(d:Database,at:Date,notionId?:string) {
 return new Set(recurrentEvidence(d,at,notionId).map(rows=>rows[0].notionId));
}

export function listLearningSignals(input: unknown = {}) {
 const v = signalsSchema.parse(input), d = openDatabase();
 try {
  if (v.notionId && !d.prepare('SELECT 1 FROM notions WHERE id=?').get(v.notionId)) throw new Error('Notion inconnue.');
  const at = new Date();
  const candidates = recurrentEvidence(d,at,v.notionId).map(rows => {
   const evidence = rows.slice(0,10).map(row => ({
    attemptId:row.attemptId, itemId:row.itemId, versionId:row.versionId, context:row.context,
    content:row.content, instruction:row.instruction, submittedAt:row.submittedAt, reviewedAt:row.reviewedAt,
    explanation:row.explanation, ...(row.type === 'sentence' && JSON.parse(row.answerJson).turns ? {turns:JSON.parse(row.answerJson).turns} : {}),
   }));
   return {notionId:rows[0].notionId,notion:rows[0].notion,evidence};
  });
  const hasObservations = d.prepare(`SELECT 1 FROM learning_observations o JOIN learning_attempts a ON a.id=o.attempt_id
   WHERE a.submitted_at>=? AND a.reviewed_at<=? AND ${v.notionId ? 'o.notion_id=?' : '1=1'} LIMIT 1`)
   .get(romeDayStart(addDays(romeDay(at),-29)),at.toISOString(),...(v.notionId ? [v.notionId] : []));
  return {
   state:candidates.length ? 'candidates' : hasObservations ? 'no_candidate' : 'no_data',
   candidates:candidates.slice(v.offset,v.offset+v.limit),
   nextOffset:candidates.length > v.offset+v.limit ? v.offset+v.limit : null,
  };
 } finally {d.close();}
}
