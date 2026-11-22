import { createHash } from 'node:crypto';
import { romeDay } from '../lib/revision';
import { openDatabase } from './database.mjs';
import type { Database } from './store';
import { readReminders } from './reminders';

export async function combinedRevisionCalendar(at = new Date(), existing?:Database) {
 const external = await readReminders(undefined,at).catch(()=>({state:'unreadable' as const,reminders:[]}));
 const occurrences = new Map<string,number>();
 const externalEvents = external.reminders.map(event=>{
  const key = createHash('sha256').update(JSON.stringify([event.theme,event.step,event.date])).digest('hex');
  const ordinal = occurrences.get(key) ?? 0;
  occurrences.set(key,ordinal+1);
  return {...event,id:`${key}-${ordinal}`,source:'external' as const};
 });
 const d = existing ?? openDatabase();
 try {
  const today = romeDay(at);
  const rows = d.prepare(`SELECT m.id,m.lesson_id AS lessonId,s.title AS theme,m.step,m.due_date AS date,m.completed_at AS completedAt
   FROM proactive_milestones m JOIN proactive_lessons l ON l.id=m.lesson_id JOIN sessions s ON s.id=l.session_id`).all() as {
    id:string;lessonId:string;theme:string;step:number;date:string;completedAt:string|null;
   }[];
  const lessonEvents = rows.map(event=>({...event,source:'lesson' as const,step:'J'+event.step,due:event.date<=today}));
  return {state:external.state,reminders:[...externalEvents,...lessonEvents].sort((a,b)=>
   a.date.localeCompare(b.date) || a.theme.localeCompare(b.theme,'fr') || Number(a.step.slice(1))-Number(b.step.slice(1)))};
 } finally {if (!existing) d.close();}
}

export type CombinedCalendar = Awaited<ReturnType<typeof combinedRevisionCalendar>>;
