import { z } from 'zod';

export const text = z.string().trim().min(1).max(4000);
export const id = z.string().min(1).max(200);
const common = { instruction: text, weight: z.number().positive().optional(), objective: text.optional() };
const item = { content: text, explanation: text.optional() };
const flashcard = z.object({ ...item, answer: z.object({ italian: text, example: text }).strict() }).strict();
const cloze = z.object({ ...item, answer: z.object({ accepted: z.array(text).min(1).max(20) }).strict() }).strict();
const freeText = z.object({ ...item, answer: z.object({}).strict() }).strict();
const hintList = z.array(text.max(500)).min(1).max(5);
const hints = { hints: hintList.optional() };
const rubric = z.object({ criteria: text, example: text.optional() }).strict();
const tokenOrder = z.array(z.number().int().nonnegative()).min(2).max(24);
export const sentenceSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('guided'), hints: hintList, rubric }).strict(),
  z.object({ format: z.literal('transformation'), ...hints, rubric }).strict(),
  z.object({ format: z.literal('question'), ...hints, rubric }).strict(),
  z.object({ format: z.literal('dialogue'), ...hints, turns: z.array(text.max(500)).min(2).max(4), rubric }).strict(),
  z.object({ format: z.literal('word_order'), ...hints, tokens: z.array(text.max(100)).min(2).max(24), orders: z.array(tokenOrder).min(1).max(20) }).strict(),
]).refine(value => value.format !== 'word_order' || value.orders.every(order => isTokenOrder(order, value.tokens.length)), {
  message: 'Chaque ordre doit utiliser exactement une fois chaque position de la liste de mots.',
}).refine(value => value.format !== 'word_order' || !value.orders.some(order => order.every((position,index) => value.tokens[position] === value.tokens[index])), {
  message: 'Les mots présentés doivent être mélangés.',
});
export function isTokenOrder(order: number[], count: number) {
  return order.length === count && order.every(index => index < count) && new Set(order).size === count;
}
const sentenceItem = z.object({ ...item, sentence: sentenceSchema }).strict();
const questionnaire = z.object({
 ...item,
 choices: z.array(z.object({value:id,label:text}).strict()).min(2).max(8),
 answer: z.object({value:id}).strict(),
}).strict().refine(v=>new Set(v.choices.map(c=>c.value)).size===v.choices.length && v.choices.some(c=>c.value===v.answer.value),{message:'Les choix doivent être distincts et contenir la réponse attendue.'});
const groupedExerciseSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('flashcard'), items: z.array(flashcard).min(1).max(50) }).strict(),
  z.object({ ...common, type: z.literal('cloze'), items: z.array(cloze).min(1).max(50) }).strict(),
  z.object({ ...common, type: z.literal('free_text'), items: z.array(freeText).min(1).max(50) }).strict(),
  z.object({ ...common, type: z.literal('questionnaire'), items: z.array(questionnaire).min(1).max(50) }).strict(),
  z.object({ ...common, type: z.literal('sentence'), items: z.array(sentenceItem).min(1).max(50) }).strict(),
]);
const legacyExerciseSchema = z.discriminatedUnion('type', [
  z.object({ ...common, ...flashcard.shape, type: z.literal('flashcard') }).strict(),
  z.object({ ...common, ...cloze.shape, type: z.literal('cloze') }).strict(),
  z.object({ ...common, ...freeText.shape, type: z.literal('free_text') }).strict(),
]).describe('Ancien format à une question, conservé pour compatibilité. Utiliser items pour les nouveaux exercices.');
export const exerciseSchema = z.union([groupedExerciseSchema, legacyExerciseSchema]);
export function versionAnswer(value: { answer: unknown } | { sentence: unknown }) {
  return JSON.stringify('sentence' in value ? value.sentence : value.answer);
}
const takeawaySchema = z.object({
 title: text.max(120),
 explanation: text.max(600).describe('Explication concise en français.'),
 examples: z.array(z.object({ italian: text.max(400), french: text.max(400) }).strict()).min(1).max(20),
}).strict();
export type SessionTakeaway = z.infer<typeof takeawaySchema>;
export const takeawaysSchema = z.array(takeawaySchema).max(3).describe('Cartes « À retenir » lues avant les exercices, en lecture libre.').optional();
export const sessionSchema = z.object({ requestId: id, title: text, objective: text, scheduledDate: z.iso.date(), exercises: z.array(exerciseSchema).min(1).max(100), reminders: takeawaysSchema, takeaways: takeawaysSchema }).strict().refine(v=>!(v.reminders && v.takeaways),{message:'Utiliser reminders ou takeaways, pas les deux.'}).refine(v=>v.exercises.reduce((total,e)=>total+('items' in e ? e.items.length : 1),0)<=100,{message:'Une séance contient au maximum 100 items.'});
export const observationSchema = z.object({
  notionId: id, kind: z.enum(['error','strength','style','typo']), explanation: text.max(1000),
}).strict();
export const feedbackSchema = z.object({
  attemptId: id, result: z.enum(['correct','partial','incorrect']), correction: text, explanation: text,
  retry: z.boolean().optional(),
  requestId: id.optional(),
  observations: z.array(observationSchema).max(20).optional(),
  turns: z.array(z.object({ correction: text, explanation: text }).strict()).min(2).max(4).optional(),
}).strict();
