import { addDays, romeDay, romeDayStart } from '../lib/revision';
import { openDatabase } from './database.mjs';
import { distinctPrompts, firstPromptAttempts, promptKey, recurrentNotionIds, signalsSchema } from './learning-signals';
import type { Database } from './store';

type ProgressRow = {
 notionId:string; notion:string; attemptId:string; itemId:string; versionId:string; context:'session'|'practice';
 submittedAt:string; reviewedAt:string|null; status:string; mode:string; assisted:number|null; correct:number|null;
 neutralized:number; hinted:number; retryOf:string|null; targetCount:number; content:string; instruction:string;
 type:string; answerJson:string; observedError:string|null; observedStrength:string|null;
};
type Evidence = ProgressRow & {question:string; fact:'success'|'error'; source:'written'|'automatic'; explanation:string|null};
export type NotionStatus = 'not_evaluated'|'assessing'|'needs_work'|'recent_success';
const recentStart = (date:string) => romeDayStart(addDays(date,-29));

function progressRows(d: Database, at: Date, notionId?:string) {
 return d.prepare(`WITH attributed AS (
   SELECT a.id AS attempt_id,x.notion_id FROM learning_attempts a JOIN item_version_notions x ON x.version_id=a.version_id
   ${notionId ? 'WHERE x.notion_id=?' : ''}
   UNION
   SELECT o.attempt_id,o.notion_id FROM learning_observations o ${notionId ? 'WHERE o.notion_id=?' : ''}
  )
  SELECT n.id AS notionId,n.name AS notion,a.id AS attemptId,a.item_id AS itemId,a.version_id AS versionId,a.context,
   a.submitted_at AS submittedAt,a.reviewed_at AS reviewedAt,a.status,a.mode,a.assisted,a.is_correct AS correct,
   EXISTS(SELECT 1 FROM feedback_rectifications r WHERE r.attempt_id=a.id) AS neutralized,
   COALESCE(h.hint_count,0) AS hinted,h.retry_of AS retryOf,v.content,v.instruction,v.type,v.answer_json AS answerJson,
   (SELECT COUNT(*) FROM item_version_notions x WHERE x.version_id=v.id) AS targetCount,
   (SELECT MIN(o.explanation) FROM learning_observations o WHERE o.attempt_id=a.id AND o.notion_id=n.id AND o.kind='error') AS observedError,
   (SELECT MIN(o.explanation) FROM learning_observations o WHERE o.attempt_id=a.id AND o.notion_id=n.id AND o.kind='strength') AS observedStrength
  FROM attributed p JOIN notions n ON n.id=p.notion_id JOIN learning_attempts a ON a.id=p.attempt_id
  JOIN item_versions v ON v.id=a.version_id JOIN bank_items b ON b.id=a.item_id
  LEFT JOIN sentence_attempts h ON h.context=a.context AND h.request_id=a.request_id
  WHERE b.source='prof' AND a.submitted_at<=?
  ORDER BY a.submitted_at DESC,a.rowid DESC,n.id`).all(...(notionId?[notionId,notionId]:[]),at.toISOString()) as ProgressRow[];
}

function evidenceFrom(rows:ProgressRow[], d:Database, at:Date) {
 const candidates = rows.flatMap((row):Evidence[]=>{
  if (row.neutralized || row.assisted!==0 || row.hinted || row.retryOf || row.mode!=='answer') return [];
  const written = row.status==='corrected' && row.reviewedAt && row.reviewedAt<=at.toISOString();
  const targeted = row.status==='auto_corrected' && row.targetCount===1 &&
   (row.type==='cloze' || row.type==='sentence' && JSON.parse(row.answerJson).format==='word_order');
  const fact = written ? row.observedError ? 'error' : row.observedStrength ? 'success' : null :
   targeted && row.correct!==null ? row.correct===1 ? 'success' : 'error' : null;
  return fact ? [{...row,fact,source:written?'written':'automatic',explanation:written ? row.observedError ?? row.observedStrength : null,
   question:promptKey(row.content,row.instruction,row.type,row.answerJson)}] : [];
 });
 const first=firstPromptAttempts(d,candidates.map(e=>e.question),true);
 return candidates.filter(e=>first.has(e.attemptId));
}

function positivePair(rows:Evidence[]) {
 for (const [index,newest] of rows.entries()) {
  for (const previous of rows.slice(index+1)) {
   if (previous.submittedAt<recentStart(romeDay(newest.submittedAt))) break;
   if ((newest.source==='written' || previous.source==='written') && distinctPrompts(newest,previous)) return [newest,previous];
  }
 }
 return [];
}

function supportedSuccesses(evidence:Evidence[], at:Date) {
 const recent = evidence.filter(e=>e.submittedAt>=recentStart(romeDay(at)));
 const errorIndex = recent.findIndex(e=>e.fact==='error');
 return {
  clean:recent.slice(0,errorIndex<0 ? recent.length : errorIndex).filter(e=>e.fact==='success'),
  recentError:errorIndex>=0 ? recent[errorIndex] : undefined,
 };
}

export function nextStepEvidence(d:Database, prerequisiteNotionId:string, attemptIds:string[], at:Date) {
 const evidence = evidenceFrom(progressRows(d,at,prerequisiteNotionId),d,at);
 const {clean}=supportedSuccesses(evidence,at);
 const requested=new Set(attemptIds);
 const selected=clean.filter(e=>requested.has(e.attemptId));
 if (selected.length!==attemptIds.length || !positivePair(selected).length ||
     new Set(selected.map(e=>e.itemId)).size!==selected.length || new Set(selected.map(e=>e.question)).size!==selected.length) return [];
 return selected;
}

function activity(row:ProgressRow) {
 const target = row.status==='corrected' && row.reviewedAt ? 'correction' as const : 'attempt' as const;
 return {attemptId:row.attemptId,date:romeDay(row.submittedAt),context:row.context,content:row.content,target};
}

function activityGroup(rows:ProgressRow[]) {
 return {count:rows.length,latest:rows.length ? activity(rows[0]) : null};
}

function summarize(rows:ProgressRow[],evidence:Evidence[],recurring:boolean,at:Date) {
 const {clean,recentError}=supportedSuccesses(evidence,at);
 const pair=positivePair(clean);
 const earlierSuccess=recentError && positivePair(evidence.slice(evidence.indexOf(recentError)+1).filter(e=>e.fact==='success')).length>0;
 const status:NotionStatus=pair.length ? 'recent_success' : recurring || earlierSuccess ? 'needs_work' :
  evidence.length ? 'assessing' : 'not_evaluated';
 const reason=status==='recent_success' ? 'Deux réussites sans aide dans des contextes distincts, dont une production corrigée.' :
  status==='needs_work' ? earlierSuccess ? 'Une erreur ciblée est apparue depuis les réussites précédentes.' :
   'La même notion a posé difficulté dans des productions différentes.' :
  status==='assessing' ? recentError ? 'Un écart a été observé. D’autres essais indépendants aideront à préciser ce point.' :
   'Les essais indépendants sont isolés ou anciens. Le bilan sera précisé avec de nouveaux contextes.' :
  'Les activités enregistrées sur cette notion ne fournissent pas encore de preuve indépendante.';
 const assessments=rows.filter(r=>r.status==='self_assessed' && !r.neutralized);
 const assisted=rows.filter(r=>!r.neutralized && r.status!=='pending_teacher' && r.status!=='self_assessed' &&
  (r.assisted===1 || r.hinted || r.retryOf) && (!r.reviewedAt || r.reviewedAt<=at.toISOString()));
 const featured=status==='needs_work' ? evidence.filter(e=>e.fact==='error').slice(0,2) : pair;
 const shownItems = new Set<string>();
 const entries = [...featured,...evidence].filter(row=>{
  if (shownItems.has(row.itemId)) return false;
  shownItems.add(row.itemId);
  return true;
 }).slice(0,5).map(row=>({
  ...activity(row),fact:row.fact,source:row.source,itemId:row.itemId,versionId:row.versionId,
  explanation:row.explanation,
 }));
 const [latest]=rows;
 return {notionId:latest.notionId,notion:latest.notion,status,reason,lastActivity:activity(latest),
  lastEvidenceDate:evidence.length ? romeDay(evidence[0].submittedAt) : null,
  evidence:entries,assisted:activityGroup(assisted),selfAssessments:activityGroup(assessments),
  prerequisiteEvidenceIds:pair.map(e=>e.attemptId)};
}

export const notionProgressSchema=signalsSchema;
export function listNotionProgress(input:unknown={},at=new Date()) {
 const v=notionProgressSchema.parse(input), d=openDatabase();
 try {
  d.exec('BEGIN');
  if (v.notionId && !d.prepare('SELECT 1 FROM notions WHERE id=?').get(v.notionId)) throw new Error('Notion inconnue.');
  const rows=progressRows(d,at,v.notionId);
  const group=new Map<string,ProgressRow[]>();
  for (const row of rows) {
   if (!group.has(row.notionId)) group.set(row.notionId,[]);
   group.get(row.notionId)!.push(row);
  }
  const page=[...group.values()].slice(v.offset,v.offset+v.limit);
  const evidence=evidenceFrom(page.flat(),d,at);
  const recurring=recurrentNotionIds(d,at,v.notionId);
  const notions=page.map(entries=>{
   const notionId=entries[0].notionId;
   return summarize(entries,evidence.filter(e=>e.notionId===notionId),recurring.has(notionId),at);
  });
  d.exec('COMMIT');
  return {date:romeDay(at),notions,nextOffset:group.size>v.offset+v.limit ? v.offset+v.limit : null};
 } finally {d.close();}
}

export function listStudentNotionProgress(input:unknown={},at=new Date()) {
 const report=listNotionProgress(input,at);
 return {...report,notions:report.notions.map(({notionId,notion,status,reason,lastActivity,lastEvidenceDate,assisted,selfAssessments,evidence})=>({
  notionId,notion,status,reason,lastActivity,lastEvidenceDate,assisted,selfAssessments,
  evidence:evidence.map(({attemptId,date,context,content,target,fact,source})=>({attemptId,date,context,content,target,fact,source})),
 }))};
}

export type StudentNotionProgress=ReturnType<typeof listStudentNotionProgress>;
