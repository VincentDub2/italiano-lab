import type { z } from 'zod';
import type { AssessmentResponse, studentAssessmentActionSchema } from '@/server/assessment-schemas';
import type { StudentAssessment } from '@/server/assessments';

type Running = Extract<StudentAssessment, { status: 'in_progress' }>;
type Save = Extract<z.infer<typeof studentAssessmentActionSchema>, { action: 'save' }>;
type Responses = Record<string, AssessmentResponse | null>;
type Send = (command: Save) => Promise<{ revision: number }>;
type Failure = { message: string; stale: boolean };

// Keep unsaved work and its save queue alive across client-side navigation in this tab.
const drafts = new Map<string, ReturnType<typeof createDraft>>();

export function forgetAssessmentDraft(id: string) {
 drafts.get(id)?.discard();
}

export function getAssessmentDraft(assessment: Running, send: Send) {
 const cached = drafts.get(assessment.id);
 const snapshot = cached?.getSnapshot();
 if (snapshot && (snapshot.dirty || snapshot.revision >= assessment.revision)) return cached!;
 return createDraft(assessment, send);
}

function createDraft(assessment: Running, send: Send) {
 const { id, tasks } = assessment;
 let saved: Responses = Object.fromEntries(tasks.map(task => [task.id, task.response]));
 let draft = saved;
 let revision = assessment.revision;
 let pending: Save | null = null;
 let failure: Failure | null = null;
 let sending = false;
 let timer: number | undefined;
 const listeners = new Set<() => void>();

 const changedTask = () => tasks.find(task => JSON.stringify(draft[task.id]) !== JSON.stringify(saved[task.id]));
 const read = () => ({
  draft, revision, failure, dirty: pending !== null || changedTask() !== undefined,
  hasSaved: revision !== assessment.revision || Object.values(saved).some(Boolean),
 });
 let snapshot = read();

 function beforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = true;
 }

 function notify() {
  const previous = snapshot;
  snapshot = read();
  if (snapshot.dirty) drafts.set(id, store);
  if (snapshot.dirty !== previous.dirty) {
   if (snapshot.dirty) window.addEventListener('beforeunload', beforeUnload);
   else window.removeEventListener('beforeunload', beforeUnload);
  }
  listeners.forEach(listener => listener());
 }

 function schedule() {
  window.clearTimeout(timer);
  if (pending) return;
  const task = changedTask();
  if (!task) return;
  timer = window.setTimeout(() => void persist({
   action: 'save', assessmentId: id, requestId: crypto.randomUUID(), revision, taskId: task.id, response: draft[task.id],
  }), 300);
 }

 async function persist(command: Save) {
  if (sending) return;
  sending = true;
  pending = command;
  failure = null;
  notify();
  try {
   const receipt = await send(command);
   saved = { ...saved, [command.taskId]: command.response };
   revision = receipt.revision;
   pending = null;
  } catch (cause) {
   failure = cause instanceof Error && 'status' in cause
    ? { message: cause.message, stale: cause.status === 409 }
    : { message: 'L’enregistrement a échoué. Réessayez.', stale: false };
  } finally {
   sending = false;
   notify();
   schedule();
  }
 }

 const store = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
   listeners.add(listener);
   return () => { listeners.delete(listener); };
  },
  edit(taskId: string, response: AssessmentResponse | null) {
   draft = { ...draft, [taskId]: response };
   notify();
   schedule();
  },
  retry() {
   if (pending) void persist(pending);
  },
  discard() {
   window.clearTimeout(timer);
   window.removeEventListener('beforeunload', beforeUnload);
   if (drafts.get(id) === store) drafts.delete(id);
  },
 };
 return store;
}
