import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { openDatabase } from './database.mjs';
import { exerciseSchema, id, sentenceSchema, text, takeawaysSchema, versionAnswer } from './schemas';
import { nextLessonMilestones, revisionLinksSchema, saveRevisionLinks, sessionRevisionLinks } from './proactive-revisions';
import { resolveNotion } from './learning-signals';
import { mutation, write, saveSessionTakeaways, type Database } from './store';
import { bankRows, itemVersion, publicItem, teacherItem, legacyExerciseType, saveReview, selectItems, learningOverview, type ItemRow } from './learning';

export function addBankItem(d: Database, row: Omit<ItemRow, 'id' | 'item_id' | 'cycle_id'>, itemId = randomUUID(), source = 'prof', originId: string | null = null, available = true) {
 const versionId = randomUUID();
 d.prepare('INSERT INTO bank_items VALUES (?,?,?,?,?,?)').run(itemId,row.group_id,originId,source,versionId,Number(available));
 d.prepare('INSERT INTO item_versions VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(versionId,itemId,versionId,row.type,row.instruction,row.content,row.objective,row.choices_json,row.answer_json,row.explanation,new Date().toISOString());
 return { itemId, versionId };
}
function setNotions(d: Database, itemId: string, names: string[]) {
 d.prepare('DELETE FROM item_notions WHERE item_id=?').run(itemId);
 for (const name of new Set(names)) {
  const notion = resolveNotion(d,name);
  d.prepare('INSERT INTO item_notions VALUES (?,?)').run(itemId,notion.id);
 }
}
function snapshotNotions(d: Database,itemId:string,versionId:string) {
 d.prepare('INSERT INTO item_version_notions SELECT ?,notion_id FROM item_notions WHERE item_id=?').run(versionId,itemId);
}
export const createBankSchema = z.object({ requestId: id, exercise: exerciseSchema, notions: z.array(text.max(200)).max(20).default([]), originItemId: id.optional() }).strict();
export function createBankExercise(input: unknown) {
 const v = createBankSchema.parse(input);
 return write(d => mutation(d,v.requestId,'create-bank',v,() => {
  if (v.originItemId && !d.prepare('SELECT 1 FROM bank_items WHERE id=?').get(v.originItemId)) throw new Error('Item d’origine inconnu.');
  const groupId = randomUUID(), e = v.exercise;
  d.prepare('INSERT INTO bank_exercises VALUES (?,?,?,?,?)').run(groupId,e.instruction,e.type,e.objective || null,new Date().toISOString());
  const itemIds = ('items' in e ? e.items : [e]).map(item => {
   const added = addBankItem(d,{ group_id: groupId, type: e.type, instruction: e.instruction, content: item.content, objective: e.objective || null, choices_json: 'choices' in item ? JSON.stringify(item.choices) : null, answer_json: versionAnswer(item), explanation: item.explanation || null },undefined,'prof',v.originItemId);
   setNotions(d,added.itemId,v.notions);
   snapshotNotions(d,added.itemId,added.versionId);
   return added.itemId;
  });
  return { groupId, itemIds };
 }));
}
export const searchBankSchema = z.object({ notion: z.string().max(200).optional(), query: z.string().max(200).optional() }).strict();
export function searchBank(input: unknown = {}) {
 const v = searchBankSchema.parse(input), d = openDatabase();
 try { return bankRows(d).map(row => ({ ...publicItem(d,row), ...teacherItem(row) })).filter(row => (!v.notion || row.notions.some(n => n.name === v.notion || n.id === v.notion) || row.objective === v.notion) && (!v.query || `${row.content} ${row.instruction}`.toLocaleLowerCase().includes(v.query.toLocaleLowerCase()))); }
 finally { d.close(); }
}
export function dailyPlan() {
 const d = openDatabase();
 try {
  const overview = learningOverview(new Date(),d);
  return { ...overview, outcome:overview.dailyComplete ? 'daily_complete' : 'session_needed', items:selectItems(d,{ count:100 }).map(item => publicItem(d,item)), revisionMilestones:nextLessonMilestones(d) };
 } finally { d.close(); }
}
export const compositionFields = { requestId: id, title: text, objective: text, itemIds: z.array(id).min(1).max(100), reminders: takeawaysSchema, takeaways: takeawaysSchema };
export const composeSchema = z.object({ ...compositionFields, scheduledDate: z.iso.date(), revisionLinks:revisionLinksSchema }).strict().refine(v => !(v.reminders && v.takeaways), 'Utiliser reminders ou takeaways, pas les deux.').refine(v => new Set(v.itemIds).size === v.itemIds.length, 'Un item ne doit apparaître qu’une fois.');
export function insertComposition(d: Database, sessionId: string, itemIds: string[]) {
 const insert = d.prepare('INSERT INTO exercises (id,session_id,position,type,instruction,content,explanation,answer_json,objective,group_id,choices_json,bank_item_id,version_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
 itemIds.forEach((itemId,position) => {
  const b = d.prepare('SELECT * FROM bank_items WHERE id=?').get(itemId);
  if (!b || b.source !== 'prof') throw new Error('Item de banque inconnu.');
  const row = itemVersion(d,b.current_version_id);
  insert.run(randomUUID(),sessionId,position,legacyExerciseType(row.type),row.instruction,row.content,row.explanation,row.answer_json,row.objective,row.group_id,row.choices_json,row.item_id,row.id);
 });
}
export function insertComposedDraft(d: Database, v: z.infer<typeof composeSchema>) {
 if (d.prepare('SELECT 1 FROM sessions WHERE request_id=?').get(v.requestId)) throw new Error('Identifiant déjà utilisé.');
 const sessionId = randomUUID(), at = new Date().toISOString();
 d.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?)').run(sessionId,v.requestId,v.title,v.objective,v.scheduledDate,'draft','prof',at,at);
 saveSessionTakeaways(d,sessionId,v.reminders ?? v.takeaways);
 insertComposition(d,sessionId,v.itemIds);
 saveRevisionLinks(d,sessionId,v.revisionLinks);
 return sessionId;
}
export function composeSession(input: unknown) {
 const v = composeSchema.parse(input);
 return write(d => mutation(d,v.requestId,'compose',v,() => ({id:insertComposedDraft(d,v)})));
}
export const updateDraftSchema = z.object({ ...compositionFields, sessionId:id, scheduledDate:z.iso.date(), revisionLinks:revisionLinksSchema }).strict().refine(v => !(v.reminders && v.takeaways), 'Utiliser reminders ou takeaways, pas les deux.').refine(v => new Set(v.itemIds).size === v.itemIds.length, 'Items dupliqués.');
export function updateDraft(input: unknown) {
 const v = updateDraftSchema.parse(input);
 return write(d => mutation(d,v.requestId,'update-draft',v,() => {
  const session = d.prepare('SELECT * FROM sessions WHERE id=?').get(v.sessionId);
  if (!session || session.status !== 'draft' || d.prepare('SELECT 1 FROM learning_attempts a JOIN exercises e ON e.id=a.occurrence_id WHERE e.session_id=?').get(v.sessionId)) throw new Error('Seul un brouillon non tenté peut être modifié.');
  const prior = sessionRevisionLinks(d,v.sessionId);
  if (v.revisionLinks?.length && d.prepare('SELECT 1 FROM proactive_lessons WHERE session_id=?').get(v.sessionId)) {
   throw new Error('Liez les jalons à une séance quotidienne.');
  }
  const links = v.revisionLinks ?? prior.map(({milestoneId,itemIds})=>({milestoneId,positions:itemIds.map(itemId=>v.itemIds.indexOf(itemId))}));
  if (links.some(l=>l.positions.includes(-1))) throw new Error('Précisez revisionLinks pour remplacer un item lié.');
  d.prepare('DELETE FROM exercises WHERE session_id=?').run(v.sessionId);
  insertComposition(d,v.sessionId,v.itemIds);
  saveRevisionLinks(d,v.sessionId,links);
  saveSessionTakeaways(d,v.sessionId,v.reminders ?? v.takeaways);
  d.prepare('UPDATE sessions SET title=?,objective=?,scheduled_date=?,updated_at=? WHERE id=?').run(v.title,v.objective,v.scheduledDate,new Date().toISOString(),v.sessionId);
  return { id: v.sessionId };
 }));
}
export const reviseSchema = z.object({ requestId: id, itemId: id, kind: z.enum(['typo','pedagogical']), content: text, instruction: text.optional(), explanation: text.optional(), answer: z.unknown().optional(), choices: z.array(z.object({ value: id, label: text }).strict()).min(2).max(8).optional(), sentence:sentenceSchema.optional(), notions: z.array(text.max(200)).max(20).optional() }).strict();
export function reviseItem(input: unknown) {
 const v = reviseSchema.parse(input);
 return write(d => mutation(d,v.requestId,'revise-item',v,() => {
  const b = d.prepare('SELECT * FROM bank_items WHERE id=?').get(v.itemId);
  if (!b) throw new Error('Item inconnu.');
  const old = itemVersion(d,b.current_version_id);
  const sentence = old.type === 'sentence';
  if (sentence ? v.answer !== undefined : v.sentence !== undefined) throw new Error('Contenu incompatible avec le type de l’item.');
  const oldAnswer = JSON.parse(old.answer_json);
  const choices = v.choices || (old.choices_json ? JSON.parse(old.choices_json) : undefined);
  const instruction = v.instruction || old.instruction;
  const item = { content: v.content, ...(sentence ? {sentence:v.sentence ?? oldAnswer} : {answer:v.answer === undefined ? oldAnswer : v.answer}), ...(choices ? { choices } : {}) };
  exerciseSchema.parse({ type: old.type, instruction, items: [item] });
  const answer = versionAnswer(item);
  if (v.kind === 'typo' && (answer !== old.answer_json || JSON.stringify(choices || null) !== (old.choices_json || 'null'))) throw new Error('Un changement de réponse, de choix ou d’aide est pédagogique.');
  const versionId = randomUUID();
  d.prepare('INSERT INTO item_versions VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(versionId,v.itemId,v.kind === 'typo' ? old.cycle_id : versionId,old.type,instruction,v.content,old.objective,choices ? JSON.stringify(choices) : null,answer,v.explanation ?? old.explanation,new Date().toISOString());
  d.prepare('UPDATE bank_items SET current_version_id=? WHERE id=?').run(versionId,v.itemId);
  if (v.notions) setNotions(d,v.itemId,v.notions);
  snapshotNotions(d,v.itemId,versionId);
  saveReview(d,itemVersion(d,versionId));
  return { itemId: v.itemId, versionId };
 }));
}
export const rectifySchema = z.object({ requestId: id, attemptId: id, correction: text, explanation: text }).strict();
export function rectifyFeedback(input: unknown) {
 const v = rectifySchema.parse(input);
 return write(d => mutation(d,v.requestId,'rectify',v,() => {
  const attempt = d.prepare('SELECT * FROM learning_attempts WHERE id=?').get(v.attemptId);
  if (!attempt || attempt.status === 'pending_teacher' || attempt.status === 'self_assessed') throw new Error('Verdict inconnu.');
  d.prepare('INSERT INTO feedback_rectifications VALUES (?,?,?,?,?,?)').run(randomUUID(),v.requestId,v.attemptId,v.correction,v.explanation,new Date().toISOString());
  saveReview(d,itemVersion(d,attempt.version_id));
  return { attemptId: v.attemptId, neutralized: true };
 }));
}
