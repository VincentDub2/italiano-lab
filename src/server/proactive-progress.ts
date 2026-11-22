import { randomUUID } from 'node:crypto';
import { addDays, romeDay, romeDayStart } from '../lib/revision';
import { affectedMilestones } from './proactive-revisions';
import type { Database } from './store';

export const lessonSteps = [1,3,7,14,30] as const;
type CompletionAttempt = {id:string; is_correct:number|null; assisted:number|null};

export function validOccurrenceAttempt(d: Database, occurrenceId: string, submittedAfter: string, reviewedAfter: string) {
 return d.prepare(`SELECT a.id,a.is_correct,a.assisted FROM learning_attempts a WHERE a.occurrence_id=?
  AND a.submitted_at>=? AND a.status IN ('corrected','auto_corrected') AND a.mode<>'memory'
  AND (a.status<>'corrected' OR a.reviewed_at>=?)
  AND NOT EXISTS (SELECT 1 FROM feedback_rectifications r WHERE r.attempt_id=a.id)
  ORDER BY a.submitted_at,a.rowid LIMIT 1`).get(occurrenceId,submittedAfter,reviewedAfter) as CompletionAttempt | undefined;
}

export function hasJ0Attempt(d: Database, occurrenceId: string, startedAt: string, final: boolean) {
 if (final) return Boolean(validOccurrenceAttempt(d,occurrenceId,startedAt,startedAt));
 return Boolean(d.prepare(`SELECT 1 FROM learning_attempts WHERE occurrence_id=? AND submitted_at>=? AND mode<>'memory'`)
  .get(occurrenceId,startedAt));
}

export function recordProactiveProgress(d: Database, occurrenceId: string, at = new Date()) {
 recordMilestoneProgress(d,occurrenceId,at);
 const lesson = d.prepare(`SELECT l.id,l.session_id,l.started_at FROM proactive_lessons l
  JOIN exercises e ON e.session_id=l.session_id WHERE e.id=? AND l.status='in_progress'`).get(occurrenceId);
 if (!lesson) return;
 const required = d.prepare('SELECT id FROM exercises WHERE session_id=? ORDER BY position').all(lesson.session_id) as {id:string}[];
 if (!required.length || !required.every((e,index)=>hasJ0Attempt(d,e.id,lesson.started_at,index===required.length-1))) return;
 const j0 = romeDay(at);
 d.prepare("UPDATE proactive_lessons SET status='j0_completed',j0_date=? WHERE id=?").run(j0,lesson.id);
 const insert = d.prepare('INSERT INTO proactive_milestones (id,lesson_id,step,due_date) VALUES (?,?,?,?)');
 for (const step of lessonSteps) insert.run(randomUUID(),lesson.id,step,addDays(j0,step));
}

export function lessonMilestones(d: Database, lessonId: string) {
 return d.prepare(`SELECT m.id,m.step,m.due_date AS date,m.completed_at AS completedAt,
   CASE WHEN EXISTS(SELECT 1 FROM proactive_milestone_attempts ma JOIN feedback_rectifications r ON r.attempt_id=ma.attempt_id
      WHERE ma.milestone_id=m.id) THEN 'invalidated' ELSE m.result END AS result
  FROM proactive_milestones m WHERE lesson_id=? ORDER BY step`).all(lessonId) as {
   id:string;step:number;date:string;completedAt:string|null;result:string|null;
  }[];
}

function recordMilestoneProgress(d: Database, occurrenceId: string, at: Date) {
 for (const m of affectedMilestones(d,occurrenceId)) {
  if (romeDay(at)<m.date) continue;
  const required = d.prepare(`SELECT e.id FROM proactive_revision_links r JOIN exercises e ON e.id=r.occurrence_id
   WHERE r.milestone_id=? AND e.session_id=?`).all(m.id,m.sessionId) as {id:string}[];
  const dateStart = romeDayStart(m.date);
  const cutoff = m.publishedAt>dateStart ? m.publishedAt : dateStart;
  const attempts = required.map(e=>validOccurrenceAttempt(d,e.id,cutoff,cutoff));
  if (!attempts.every(a=>a!==undefined)) continue;
  const result = attempts.some(a=>a.is_correct!==1) ? 'needs_work' : attempts.some(a=>a.assisted!==0) ? 'assisted' : 'correct';
  d.prepare('UPDATE proactive_milestones SET completed_at=?,completed_session_id=?,result=? WHERE id=?')
   .run(at.toISOString(),m.sessionId,result,m.id);
  const save = d.prepare('INSERT INTO proactive_milestone_attempts VALUES (?,?)');
  for (const attempt of attempts) save.run(m.id,attempt.id);
 }
}
