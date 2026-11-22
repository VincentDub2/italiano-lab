import { addDays, romeDay } from '../lib/revision';
import { openDatabase } from './database.mjs';
import { hasReviewedToday, itemVersion, learningOverview, reviewFor, selectItems } from './learning';
import { activeStudentLesson } from './proactive-lessons';
import { hasJ0Attempt, validOccurrenceAttempt } from './proactive-progress';
import { linkedEligibleFrom, nextLessonMilestones } from './proactive-revisions';
import { combinedRevisionCalendar } from './revision-calendar';
import { newestUnreadCorrection } from './student-corrections';
import type { Database } from './store';

type ActionText = {title:string;reason:string;minutes?:number};
export type TodayAction = ActionText & (
 | {kind:'revision';targetId:string;occurrenceId:string;step:number;resuming:boolean}
 | {kind:'resume-session'|'start-session';targetId:string;occurrenceId:string}
 | {kind:'resume-lesson'|'start-lesson'|'correction';targetId:string}
 | {kind:'practice';targetId?:never}
);
type Notice = {kind:'lesson-pending'|'session-pending'|'external-unavailable';title?:string;targetId?:string};
type Revision = {id:string;source:'external'|'lesson';title:string;step:string;date:string;
 status:'external'|'ready'|'waiting'|'unscheduled'|'blocked'|'done';sessionId?:string;occurrenceId?:string;lessonId?:string};

function sessionWork(d: Database, sessionId: string, at: Date, startedAt?: string | null) {
 const today = romeDay(at);
 const rows = d.prepare(`SELECT e.id,e.version_id,a.status,a.submitted_at
  FROM exercises e LEFT JOIN learning_attempts a ON a.rowid=(
   SELECT last.rowid FROM learning_attempts last WHERE last.occurrence_id=e.id
   ORDER BY last.submitted_at DESC,last.rowid DESC LIMIT 1
  ) WHERE e.session_id=? ORDER BY e.position`).all(sessionId) as
  {id:string;version_id:string;status:string|null;submitted_at:string|null}[];
 const available:string[] = [];
 const pending:string[] = [];
 let lastActivity = startedAt ?? null;
 rows.forEach((row,index)=>{
  if (row.submitted_at && (!lastActivity || row.submitted_at>lastActivity)) lastActivity=row.submitted_at;
  if (row.status==='pending_teacher') {pending.push(row.id);return;}
  const from = startedAt ? undefined : linkedEligibleFrom(d,row.id);
  if (from && from>at.toISOString()) return;
  if (startedAt && hasJ0Attempt(d,row.id,startedAt,index===rows.length-1) ||
      from && validOccurrenceAttempt(d,row.id,from,from) ||
      !startedAt && !from && row.status) return;
  const item = itemVersion(d,row.version_id), review = reviewFor(d,item);
  if (review.pending) {pending.push(row.id);return;}
  if (!startedAt && !from && hasReviewedToday(d,item,review,today)) return;
  available.push(row.id);
 });
 return {available,pending,lastActivity};
}

export async function getToday(at = new Date()) {
 const date = romeDay(at), d = openDatabase();
 try {
  d.exec('BEGIN');
  const calendar = await combinedRevisionCalendar(at,d);
  const lesson = activeStudentLesson(d,at);
  const milestonePlan = nextLessonMilestones(d,at);
  const dueMilestones = milestonePlan.filter(m=>m.date<=date);
  const linkedSessionIds = new Set(dueMilestones.flatMap(m=>m.scheduledIn.filter(s=>s.date<=date).map(s=>s.sessionId)));
  const notices:Notice[] = [];
  const older = addDays(date,-6);
  const sessions = (d.prepare(`SELECT s.id,s.title,s.scheduled_date FROM sessions s
   WHERE s.status='published' AND s.source='prof' AND s.scheduled_date<=?
   AND NOT EXISTS(SELECT 1 FROM proactive_lessons l WHERE l.session_id=s.id)
   ORDER BY s.scheduled_date DESC,s.created_at DESC,s.id`).all(date) as
   {id:string;title:string;scheduled_date:string}[])
   .filter(s=>s.scheduled_date>=older || linkedSessionIds.has(s.id) || d.prepare(`SELECT 1 FROM exercises e
    JOIN learning_attempts a ON a.occurrence_id=e.id WHERE e.session_id=? LIMIT 1`).get(s.id))
   .map(s=>({...s,...sessionWork(d,s.id,at)}));
  const byId = new Map(sessions.map(s=>[s.id,s]));
  const revisions:Revision[] = calendar.reminders.filter(r=>r.date===date && r.source==='external')
   .map(r=>({id:r.id,source:'external',title:r.theme,step:r.step,date:r.date,status:'external'}));
  const revisionActions:TodayAction[] = [];
  for (const m of dueMilestones) {
   let target:{sessionId:string;occurrenceId:string}|undefined;
   let waiting = false;
   const links = d.prepare(`SELECT e.id FROM proactive_revision_links l JOIN exercises e ON e.id=l.occurrence_id
    WHERE l.milestone_id=? AND e.session_id=? ORDER BY e.position`);
   for (const scheduled of m.scheduledIn) {
    const session = byId.get(scheduled.sessionId);
    if (!session) continue;
    const ids = (links.all(m.id,session.id) as {id:string}[]).map(e=>e.id);
    const occurrenceId = ids.find(id=>session.available.includes(id));
    if (occurrenceId) {target={sessionId:session.id,occurrenceId};break;}
    waiting ||= ids.some(id=>session.pending.includes(id));
   }
   revisions.push({id:m.id,source:'lesson',title:m.title,step:'J'+m.step,date:m.date,lessonId:m.lessonId,
    status:target?'ready':waiting?'waiting':'unscheduled',...target});
   for (const later of m.laterDue) revisions.push({id:later.id,source:'lesson',title:m.title,
    step:'J'+later.step,date:later.date,lessonId:m.lessonId,status:'blocked'});
   if (target && m.timing==='today') {
    const session = byId.get(target.sessionId)!;
    revisionActions.push({kind:'revision',title:session.title,targetId:session.id,occurrenceId:target.occurrenceId,
     step:m.step,resuming:!!session.lastActivity,reason:`Cette séance contient la révision J${m.step} prévue aujourd’hui sur « ${m.notion} ».`});
   }
  }
  for (const r of calendar.reminders) {
   if (r.source==='lesson' && r.date===date && r.completedAt) {
    revisions.push({id:r.id,source:'lesson',title:r.theme,step:r.step,date:r.date,lessonId:r.lessonId,status:'done'});
   }
  }
  if (calendar.state!=='available') notices.push({kind:'external-unavailable'});
  const resume:{action:TodayAction;activity:string}[] = [];
  for (const s of sessions) {
   if (s.lastActivity && s.available.length) resume.push({activity:s.lastActivity,
    action:{kind:'resume-session',targetId:s.id,occurrenceId:s.available[0],title:s.title,reason:'Vous avez commencé cette séance et il reste des exercices à faire.'}});
   else if (s.scheduled_date>=older && s.pending.length) notices.push({kind:'session-pending',title:s.title,targetId:s.id});
  }
  if (lesson?.status==='in_progress') {
   const work = sessionWork(d,lesson.sessionId,at,lesson.startedAt);
   if (work.available.length) resume.push({activity:work.lastActivity!,
    action:{kind:'resume-lesson',targetId:lesson.id,title:lesson.title,reason:'Vous avez commencé cette leçon et il reste des exercices à faire.'}});
   else if (work.pending.length) notices.push({kind:'lesson-pending',title:lesson.title,targetId:lesson.id});
  }
  resume.sort((a,b)=>b.activity.localeCompare(a.activity) || (a.action.targetId ?? '').localeCompare(b.action.targetId ?? ''));
  const unread = newestUnreadCorrection(d,at);
  const ready = sessions.find(s=>!s.lastActivity && s.available.length && s.scheduled_date>=older);
  const overview = learningOverview(at,d);
  const candidates:TodayAction[] = [...revisionActions.slice(0,1),...resume.slice(0,1).map(r=>r.action)];
  if (unread) candidates.push({kind:'correction',targetId:unread.id,title:unread.title ?? 'Votre production en entraînement libre',
   reason:unread.version==='feedback' ?
    (unread.unblocks?'Votre texte a été corrigé. Ce retour vous aide à poursuivre le travail.':'Le professeur a corrigé votre réponse à cette activité.') :
    'Le professeur a rectifié le retour sur votre réponse.'});
  if (ready) candidates.push({kind:'start-session',targetId:ready.id,occurrenceId:ready.available[0],title:ready.title,
   reason:ready.scheduled_date===date?'Le professeur a préparé cette séance pour aujourd’hui.':'Cette séance récente du professeur est disponible.'});
  if (lesson?.canStart) candidates.push({kind:'start-lesson',targetId:lesson.id,title:lesson.title,reason:lesson.reason,minutes:lesson.minutes});
  if (!overview.dailyComplete && selectItems(d,{count:10},at).length) candidates.push({kind:'practice',title:'Entraînement ciblé',
   reason:overview.due?'Des exercices arrivent à échéance dans votre banque.':'La banque propose des exercices que vous pouvez travailler aujourd’hui.'});
  const [primaryAction,...others] = candidates;
  const seen = new Set([primaryAction?.targetId]);
  const secondaryActions = others.filter(action=>{
   if (seen.has(action.targetId)) return false;
   seen.add(action.targetId);
   return true;
  }).slice(0,4);
  d.exec('COMMIT');
  return {date,primaryAction:primaryAction ?? null,secondaryActions,revisions,notices,
   dailyComplete:overview.dailyComplete};
 } finally {d.close();}
}
export type Today = Awaited<ReturnType<typeof getToday>>;
