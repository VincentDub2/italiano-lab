import { z } from 'zod';
import { romeDay, romeDayStart } from '../lib/revision';
import { promptKey } from './learning-signals';
import { id } from './schemas';
import type { Database } from './store';

const link = z.object({milestoneId:id,positions:z.array(z.number().int().min(0).max(99)).min(1).max(100)}).strict();
export const revisionLinksSchema = z.array(link).max(50).optional().refine(links=>!links ||
 new Set(links.map(l=>l.milestoneId)).size===links.length && links.every(l=>new Set(l.positions).size===l.positions.length),
 'Un jalon et ses positions ne peuvent être dupliqués.');
type Link = z.infer<typeof link>;

export function sessionRevisionLinks(d: Database, sessionId: string) {
 const rows = d.prepare(`SELECT r.milestone_id AS milestoneId,e.position,e.id,e.bank_item_id AS itemId
  FROM proactive_revision_links r JOIN exercises e ON e.id=r.occurrence_id
  WHERE e.session_id=? ORDER BY r.milestone_id,e.position`).all(sessionId) as {milestoneId:string;position:number;id:string;itemId:string}[];
 const groups = new Map<string,{milestoneId:string;positions:number[];occurrenceIds:string[];itemIds:string[]}>();
 for (const row of rows) {
  if (!groups.has(row.milestoneId)) groups.set(row.milestoneId,{milestoneId:row.milestoneId,positions:[],occurrenceIds:[],itemIds:[]});
  const group = groups.get(row.milestoneId)!;
  group.positions.push(row.position);
  group.occurrenceIds.push(row.id);
  group.itemIds.push(row.itemId);
 }
 return [...groups.values()];
}

export function saveRevisionLinks(d: Database, sessionId: string, links: Link[] = []) {
 if (!links.length) return;
 const items = d.prepare('SELECT id FROM exercises WHERE session_id=? ORDER BY position').all(sessionId) as {id:string}[];
 const exists = d.prepare('SELECT 1 FROM proactive_milestones WHERE id=?');
 const save = d.prepare('INSERT INTO proactive_revision_links VALUES (?,?)');
 for (const {milestoneId,positions} of links) {
  if (!exists.get(milestoneId)) throw new Error('Jalon inconnu.');
  for (const position of positions) {
   if (!items[position]) throw new Error('Position hors de la séance.');
   save.run(milestoneId,items[position].id);
  }
 }
}

const firstMilestone = `NOT EXISTS(SELECT 1 FROM proactive_milestones previous
 WHERE previous.lesson_id=m.lesson_id AND previous.step<m.step AND previous.completed_at IS NULL)`;

export function nextLessonMilestones(d: Database, at = new Date()) {
 const today = romeDay(at);
 const rows = d.prepare(`SELECT m.id,m.lesson_id AS lessonId,m.step,m.due_date AS date,l.notion_id AS notionId,n.name AS notion,s.title
  FROM proactive_milestones m JOIN proactive_lessons l ON l.id=m.lesson_id
  JOIN notions n ON n.id=l.notion_id JOIN sessions s ON s.id=l.session_id
  WHERE m.completed_at IS NULL AND ${firstMilestone}
  ORDER BY CASE WHEN m.due_date=? THEN 0 WHEN m.due_date<? THEN 1 ELSE 2 END,m.due_date,m.id`).all(today,today) as {
   id:string;lessonId:string;step:number;date:string;notionId:string;notion:string;title:string;
  }[];
 const coverage = d.prepare(`SELECT DISTINCT s.id AS sessionId,s.scheduled_date AS date
  FROM proactive_revision_links r JOIN exercises e ON e.id=r.occurrence_id JOIN sessions s ON s.id=e.session_id
  WHERE r.milestone_id=? AND s.status='published' ORDER BY s.scheduled_date,s.id`);
 const laterDue = d.prepare(`SELECT id,step,due_date AS date FROM proactive_milestones
  WHERE lesson_id=? AND step>? AND due_date<=? AND completed_at IS NULL ORDER BY step`);
 return rows.map(m=>({...m,timing:m.date===today?'today':m.date<today?'overdue':'upcoming',
  scheduledIn:coverage.all(m.id),laterDue:laterDue.all(m.lessonId,m.step,today)}));
}

export function validateRevisionPublication(d: Database, session: {id:string;scheduled_date:string}) {
 const links = sessionRevisionLinks(d,session.id);
 if (!links.length) return;
 const eligible = d.prepare(`SELECT m.*,l.notion_id,l.session_id FROM proactive_milestones m JOIN proactive_lessons l ON l.id=m.lesson_id
  WHERE m.id=? AND m.completed_at IS NULL AND m.due_date<=? AND ${firstMilestone}`);
 const tagged = d.prepare('SELECT 1 FROM item_notions WHERE notion_id=? AND item_id=?');
 const items = d.prepare(`SELECT e.id,v.item_id,v.content,v.instruction,v.type,v.answer_json
  FROM exercises e JOIN item_versions v ON v.id=e.version_id WHERE e.session_id=? ORDER BY e.position`).all(session.id) as FrozenItem[];
 const last = items.at(-1);
 const open = items.filter(i=>i.type==='free_text' || i.type==='sentence' && JSON.parse(i.answer_json).format!=='word_order');
 if (open.length!==1 || open[0]!==last || last.type==='sentence' && JSON.parse(last.answer_json).format==='dialogue') {
  throw new Error('Une séance avec jalons doit se terminer par un seul champ écrit.');
 }
 const prior = d.prepare(`SELECT v.item_id,v.content,v.instruction,v.type,v.answer_json FROM item_versions v WHERE v.id IN (
  SELECT e.version_id FROM exercises e WHERE e.session_id=?
  UNION SELECT a.version_id FROM proactive_lesson_evidence p JOIN learning_attempts a ON a.id=p.attempt_id WHERE p.lesson_id=?
  UNION SELECT a.version_id FROM proactive_milestone_attempts ma JOIN proactive_milestones m ON m.id=ma.milestone_id
    JOIN learning_attempts a ON a.id=ma.attempt_id WHERE m.lesson_id=? AND m.step<?
 )`);
 for (const {milestoneId,occurrenceIds} of links) {
  const milestone = eligible.get(milestoneId,session.scheduled_date);
  if (!milestone) throw new Error('Le jalon lié doit être le premier jalon à faire et être dû à la date de la séance.');
  const linked = items.filter(item=>occurrenceIds.includes(item.id));
  if (linked.every(item=>item.type==='flashcard') || linked.some(item=>!tagged.get(milestone.notion_id,item.item_id))) {
   throw new Error('Chaque lien doit travailler la notion du jalon, avec au moins un exercice autre qu’une carte.');
  }
  const priorPrompts = (prior.all(milestone.session_id,milestone.lesson_id,milestone.lesson_id,milestone.step) as FrozenItem[]).map(frozenPrompt);
  if (linked.some(item=>priorPrompts.includes(frozenPrompt(item)))) throw new Error('Le jalon exige un nouveau contexte.');
 }
}

type FrozenItem = {id:string;item_id:string;content:string;instruction:string;type:string;answer_json:string};
function frozenPrompt(i: FrozenItem) { return promptKey(i.content,i.instruction,i.type,i.answer_json); }

export function linkedEligibleFrom(d: Database, occurrenceId: string) {
 const first = d.prepare(`SELECT MAX(m.due_date) AS date FROM proactive_milestones m
  JOIN proactive_revision_links r ON r.milestone_id=m.id WHERE r.occurrence_id=? AND m.completed_at IS NULL`).get(occurrenceId);
 return first?.date ? romeDayStart(first.date) : undefined;
}

export function affectedMilestones(d: Database, occurrenceId: string) {
 return d.prepare(`SELECT m.id,m.due_date AS date,e.session_id AS sessionId,s.updated_at AS publishedAt
  FROM proactive_revision_links r JOIN proactive_milestones m ON m.id=r.milestone_id
  JOIN exercises e ON e.id=r.occurrence_id JOIN sessions s ON s.id=e.session_id
  WHERE r.occurrence_id=? AND m.completed_at IS NULL AND s.status='published' AND ${firstMilestone}`).all(occurrenceId) as
  {id:string;date:string;sessionId:string;publishedAt:string}[];
}
