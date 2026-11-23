import { z } from 'zod';
import { rawAnswer } from './learning';
import { cloze, id, questionnaire, rubric, sentenceSchema, text } from './schemas';

export const assessmentStatuses = ['draft', 'offered', 'in_progress', 'submitted', 'reviewed', 'dismissed', 'abandoned'] as const;
export type AssessmentStatus = typeof assessmentStatuses[number];

const prompt = { instruction: text, content: text, support: text.optional(), explanation: text.optional() };
const taskSchema = z.discriminatedUnion('type', [
 cloze.extend({ ...prompt, type: z.literal('cloze') }),
 questionnaire.safeExtend({ ...prompt, type: z.literal('questionnaire') }),
 z.strictObject({ ...prompt, type: z.literal('sentence'), sentence: sentenceSchema.refine(value => value.format === 'word_order' && !value.hints, 'Fournir des mots mélangés sans indice.') }),
 z.strictObject({ ...prompt, type: z.literal('free_text'), answer: rubric }),
]);
export type AssessmentTask = z.infer<typeof taskSchema>;

const revision = z.number().int().nonnegative();
export const saveAssessmentSchema = z.strictObject({
 requestId: id,
 assessmentId: id.optional(),
 title: text.max(160),
 objective: text,
 reason: text,
 estimatedMinutes: z.number().int().positive(),
 notionIds: z.array(id).min(1).max(2).refine(ids => new Set(ids).size === ids.length, 'Notions en double.'),
 criteria: z.array(z.strictObject({ label: text, rubric: text })).min(1).max(6),
 tasks: z.array(taskSchema).min(2).max(8).refine(tasks => tasks.at(-1)?.type === 'free_text' && tasks.filter(task => task.type === 'free_text').length === 1,
  'Terminer par une seule production écrite.'),
});
export const assessmentIdSchema = z.strictObject({ assessmentId: id });
export const assessmentMutationSchema = assessmentIdSchema.extend({ requestId: id });
export const proposeAssessmentSchema = assessmentMutationSchema.extend({ revision });
export const listAssessmentsSchema = z.strictObject({
 status: z.enum(assessmentStatuses).optional(),
 limit: z.number().int().min(1).max(100).default(30),
 offset: z.number().int().nonnegative().default(0),
});
export const assessmentResponseSchema = z.discriminatedUnion('kind', [
 z.strictObject({ kind: z.literal('unknown') }),
 z.strictObject({ kind: z.literal('answer'), value: z.union([rawAnswer, z.array(z.number().int().nonnegative()).min(1).max(24)]) }),
]);
export type AssessmentResponse = z.infer<typeof assessmentResponseSchema>;
export const studentAssessmentActionSchema = z.discriminatedUnion('action', [
 assessmentMutationSchema.extend({ action: z.literal('start') }),
 assessmentMutationSchema.extend({ action: z.literal('close'), revision }),
 assessmentMutationSchema.extend({ action: z.literal('submit'), revision }),
 assessmentMutationSchema.extend({ action: z.literal('save'), revision, taskId: id, response: assessmentResponseSchema.nullable() }),
]);
export const assessmentReportSchema = z.strictObject({
 strengths: text,
 fragile: text,
 nextAction: z.strictObject({
  description: text,
  lessonId: id.optional(),
 }),
 tasks: z.array(z.strictObject({
  taskId: id,
  verdict: z.enum(['correct', 'partial', 'incorrect', 'unanswered']),
  correction: text.optional(),
  explanation: text,
 })).min(2).max(8),
 criteria: z.array(z.strictObject({
  position: z.number().int().nonnegative(),
  status: z.enum(['observed_without_help', 'needs_work', 'not_observed']),
  reason: z.enum(['no_answer', 'not_tested']).optional(),
  explanation: text,
  taskIds: z.array(id).max(8),
 })).min(1).max(6),
});
export type AssessmentReport = z.infer<typeof assessmentReportSchema>;
export const reviewAssessmentSchema = assessmentMutationSchema.extend({ report: assessmentReportSchema });
