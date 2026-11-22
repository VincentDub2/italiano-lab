import { z } from 'zod';
import { addDays, romeDay, romeDayStart } from '../lib/revision';
import { attemptResult, expose, type LearningAttempt } from './learning';
import { id } from './schemas';
import { write, type Database } from './store';

const versionExpression = "COALESCE('rectification:' || r.id,'feedback')";
const corrections = `FROM learning_attempts a
 JOIN item_versions v ON v.id=a.version_id
 LEFT JOIN exercises e ON e.id=a.occurrence_id
 LEFT JOIN sessions s ON s.id=e.session_id
 LEFT JOIN feedback_rectifications r ON r.rowid=(
  SELECT f.rowid FROM feedback_rectifications f WHERE f.attempt_id=a.id ORDER BY f.rowid DESC LIMIT 1
 )
 LEFT JOIN correction_reads seen ON seen.attempt_id=a.id AND seen.version=${versionExpression}
 WHERE a.status='corrected' AND a.feedback_json IS NOT NULL`;

export function newestUnreadCorrection(d: Database, at: Date) {
 const earliest = romeDayStart(addDays(romeDay(at),-6));
 return d.prepare(`SELECT a.id,s.title,${versionExpression} AS version,COALESCE(r.created_at,a.reviewed_at) AS availableAt,
  (COALESCE(json_extract(a.feedback_json,'$.retry'),0)=1 OR EXISTS (
   SELECT 1 FROM proactive_lessons l WHERE l.session_id=s.id AND l.status IN ('in_progress','j0_completed')
  ) OR EXISTS(SELECT 1 FROM proactive_revision_links link WHERE link.occurrence_id=e.id)) AS unblocks
  ${corrections} AND seen.read_at IS NULL AND COALESCE(r.created_at,a.reviewed_at) BETWEEN ? AND ?
  ORDER BY unblocks DESC,availableAt DESC,a.id LIMIT 1`).get(earliest,at.toISOString()) as
  {id:string;title:string|null;version:string;unblocks:number} | undefined;
}

function correction(d: Database, attemptId: string) {
 const row = d.prepare(`SELECT a.*,v.content,s.title,${versionExpression} AS correctionVersion,seen.read_at AS readAt
  ${corrections} AND a.id=?`).get(attemptId) as (LearningAttempt & {correctionVersion:string;readAt:string|null}) | undefined;
 if (!row) throw new Error('Correction inconnue.');
 return row;
}

export function getStudentCorrection(attemptId: string) {
 const validated = id.parse(attemptId);
 return write(d=>{
  const row = correction(d,validated);
  const attempt = attemptResult(d,row);
  expose(d,row.item_id);
  return {attempt,version:row.correctionVersion,read:row.readAt!==null};
 });
}

export function markCorrectionRead(input: unknown, at = new Date()) {
 const {attemptId,version} = z.object({attemptId:id,version:id}).strict().parse(input);
 return write(d=>{
  const row = correction(d,attemptId);
  if (row.correctionVersion!==version &&
      !d.prepare('SELECT 1 FROM correction_reads WHERE attempt_id=? AND version=?').get(attemptId,version)) {
   throw new Error('Le retour a changé. Relisez la correction.');
  }
  d.prepare('INSERT OR IGNORE INTO correction_reads VALUES (?,?,?)').run(attemptId,version,at.toISOString());
  return {attemptId,version,read:true};
 });
}

export type StudentCorrection = ReturnType<typeof getStudentCorrection>;
