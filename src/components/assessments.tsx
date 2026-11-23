'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AssessmentResponse, AssessmentStatus, studentAssessmentActionSchema } from '@/server/assessment-schemas';
import type { StudentAssessment, StudentAssessmentSummary } from '@/server/assessments';
import type { z } from 'zod';
import { AssessmentComparisonsPanel } from './assessment-comparisons';
import { forgetAssessmentDraft, getAssessmentDraft } from './assessment-draft';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

const statusLabels: Record<Exclude<AssessmentStatus, 'draft'>, string> = {
 offered: 'Disponible', in_progress: 'En cours', submitted: 'En attente du retour du prof',
 reviewed: 'Corrigé', dismissed: 'Proposition refusée', abandoned: 'Abandonné',
};
const dateLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Rome', dateStyle: 'long' });
const linkStyle = 'inline-flex w-fit items-center gap-2 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline';
const path = '/mon-niveau/bilans';

type Command = z.infer<typeof studentAssessmentActionSchema>;
type Receipt = { revision: number; status: AssessmentStatus };
type Reviewed = Extract<StudentAssessment, { status: 'reviewed' }>;
type Running = Extract<StudentAssessment, { status: 'in_progress' }>;
type Task = Running['tasks'][number];

class AssessmentRequestError extends Error {
 constructor(message: string, readonly status: number) { super(message); }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
 const response = await fetch(url, { cache: 'no-store', ...init });
 if (!response.ok) {
  const body = await response.json().catch(() => null);
  throw new AssessmentRequestError(body?.error ?? 'Le bilan est momentanément indisponible.', response.status);
 }
 return response.json();
}

function send(command: Command) {
 return request<Receipt>('/api/assessment-action', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(10000),
 });
}
function detailUrl(id: string) {
 return '/api/assessment?id=' + encodeURIComponent(id);
}
function useAssessmentResource<T>(url: string) {
 const [value, setValue] = useState<T | null>(null);
 const [error, setError] = useState('');
 const [attempt, setAttempt] = useState(0);
 const reload = useCallback(() => {
  setError('');
  setAttempt(n => n + 1);
 }, []);
 useEffect(() => {
  const controller = new AbortController();
  void request<T>(url, { signal: controller.signal }).then(data => {
   if (!controller.signal.aborted) setValue(data);
  }).catch(cause => {
   if (!controller.signal.aborted) setError(cause instanceof AssessmentRequestError ? cause.message : 'Le bilan est momentanément indisponible.');
  });
  return () => controller.abort();
 }, [url, attempt]);
 return { value, error, reload, setValue };
}

function LoadState({ error, reload }: { error: string; reload: () => void }) {
 return error ? <div className="flex flex-wrap items-center gap-3">
  <p className="m-0 text-sm text-destructive" role="alert">{error}</p>
  <Button variant="outline" onClick={reload}>Réessayer</Button>
 </div> : <p role="status" className="text-sm text-muted-foreground">Chargement…</p>;
}

function AssessmentCard({ assessment }: { assessment: StudentAssessmentSummary }) {
 if (assessment.status === 'draft') return null;
 const label = statusLabels[assessment.status];
 return <li className="min-w-0">
  <Card className="gap-3 p-4 shadow-none sm:p-6">
   <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
    <Badge variant="outline" className="h-auto whitespace-normal">{label}</Badge>
    <span className="text-sm text-muted-foreground">{assessment.status === 'offered' ? `Environ ${assessment.estimatedMinutes} min` :
     assessment.offeredAt ? dateLabel.format(new Date(assessment.offeredAt)) : null}</span>
   </div>
   <h3 className="m-0 text-lg font-semibold wrap-anywhere">
    <Link className="rounded-sm underline-offset-4 hover:underline focus-visible:underline" href={path + '/' + encodeURIComponent(assessment.id)}>
     {assessment.title}
    </Link>
   </h3>
   <p className="m-0 text-sm leading-relaxed wrap-anywhere text-muted-foreground">{assessment.objective}</p>
  </Card>
 </li>;
}

export function Assessments() {
 const { value, error, reload } = useAssessmentResource<StudentAssessmentSummary[]>('/api/assessments');
 const current = value?.filter(a => ['offered', 'in_progress', 'submitted'].includes(a.status)) ?? [];
 const history = value?.filter(a => ['reviewed', 'dismissed', 'abandoned'].includes(a.status)) ?? [];
 return <div className="grid gap-5">
  <Link className={linkStyle} href="/mon-niveau"><ArrowLeft size={16} aria-hidden="true"/>Mon niveau</Link>
  <div><h1 className="mb-2">Bilans</h1>
   <p className="m-0 max-w-xl text-sm leading-relaxed text-muted-foreground">Des tâches écrites dans une situation nouvelle, à faire sans aide. Le prof vous envoie son retour après le rendu.</p>
  </div>
  {!value && <LoadState error={error} reload={reload}/>}
  {value && <section aria-labelledby="current-bilans">
   <h2 id="current-bilans" className="mb-3 text-xl">Vos bilans</h2>
   {current.length ? <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2" role="list">
    {current.map(assessment => <AssessmentCard key={assessment.id} assessment={assessment}/>)}
   </ul> : <Card className="border-dashed p-5 text-sm text-muted-foreground shadow-none">
    <p className="m-0">Aucun bilan disponible ou en attente.</p>
   </Card>}
  </section>}
  {history.length > 0 && <section aria-labelledby="history-bilans">
   <h2 id="history-bilans" className="mb-3 text-xl">Historique</h2>
   <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2" role="list">
    {history.map(assessment => <AssessmentCard key={assessment.id} assessment={assessment}/>)}
   </ul>
  </section>}
  <AssessmentComparisonsPanel showEmpty/>
 </div>;
}

function TaskPrompt({ task }: { task: Task }) {
 return <>
  <p className="m-0 text-sm font-medium leading-relaxed wrap-anywhere">{task.instruction}</p>
  {task.support && <blockquote lang="it" className="m-0 border-l-2 border-border pl-3 leading-relaxed whitespace-pre-wrap wrap-anywhere">{task.support}</blockquote>}
  <p className="m-0 leading-relaxed whitespace-pre-wrap wrap-anywhere">{task.content}</p>
 </>;
}

function TaskInput({ task, index, response, onChange }: {
 task: Task; index: number; response: AssessmentResponse | null; onChange: (response: AssessmentResponse | null) => void;
}) {
 const [raw, setRaw] = useState(response?.kind === 'answer' && typeof response.value === 'string' ? response.value : '');
 const unknown = response?.kind === 'unknown';
 const value = response?.kind === 'answer' ? response.value : null;
 const order = Array.isArray(value) ? value : [];
 const tokens = task.tokens;
 const titleId = `bilan-task-${task.id}`;
 const setOrder = (next: number[]) => onChange(next.length ? { kind: 'answer', value: next } : null);
 const setText = (text: string) => {
  setRaw(text);
  onChange(text.trim() ? { kind: 'answer', value: text } : null);
 };
 return <Card className="min-w-0 gap-3 p-4 shadow-none sm:p-6">
  <h2 id={titleId} className="m-0 text-lg font-semibold">{task.type === 'free_text' ? 'Production écrite' : `Tâche ${index + 1}`}</h2>
  <TaskPrompt task={task}/>
  {task.choices ? <fieldset aria-labelledby={titleId} disabled={unknown} className="grid gap-2">
   {task.choices.map((choice, i) => <label key={i} className="flex min-h-10 items-center gap-3 rounded-md border border-border px-3 py-2 text-sm wrap-anywhere">
    <input type="radio" name={task.id} checked={value === String(i)} onChange={() => onChange({ kind: 'answer', value: String(i) })}/>
    <span lang="it">{choice}</span>
   </label>)}
  </fieldset> : tokens ? <div className="grid gap-2">
   <p lang="it" className="m-0 min-h-10 rounded-md border border-border px-3 py-2 wrap-anywhere" aria-live="polite">
    {order.length ? order.map(i => tokens[i]).join(' ') : 'Votre ordre apparaîtra ici.'}
   </p>
   <div className="flex flex-wrap gap-2">
    {tokens.map((token, i) => <Button key={i} lang="it" variant="outline" disabled={unknown || order.includes(i)}
     onClick={() => setOrder([...order, i])}>{token}</Button>)}
    <Button variant="ghost" disabled={unknown || !order.length} onClick={() => setOrder(order.slice(0, -1))}>Retirer le dernier mot</Button>
   </div>
  </div> : <label className="grid gap-2 text-sm font-medium">
   {task.type === 'free_text' ? 'Votre production' : `Votre réponse à la tâche ${index + 1}`}
   <textarea lang="it" rows={task.type === 'free_text' ? 5 : 2} maxLength={4000} spellCheck={false} autoComplete="off"
    autoCorrect="off" autoCapitalize="off" disabled={unknown} value={raw} onChange={e => setText(e.target.value)}
    className="w-full rounded-md border border-input bg-background p-3 text-base font-normal focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"/>
  </label>}
  <label className="flex min-h-9 w-fit items-center gap-2 text-sm">
   <input type="checkbox" checked={unknown} onChange={e => {
    setRaw('');
    onChange(e.target.checked ? { kind: 'unknown' } : null);
   }}/> Je ne sais pas
  </label>
 </Card>;
}

function RunningAssessment({ assessment, mutate, busy, refresh }: {
 assessment: Running; mutate: (command: Command) => void; busy: boolean; refresh: (discard: () => void) => void;
}) {
 const [store] = useState(() => getAssessmentDraft(assessment, send));
 const { draft, revision, dirty, failure, hasSaved } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
 const ready = assessment.tasks.every(task => {
  const answer = draft[task.id];
  return answer?.kind === 'unknown' || (answer?.kind === 'answer' && (!task.tokens || answer.value.length === task.tokens.length));
 });
 const [confirm, setConfirm] = useState<'submit' | 'close' | null>(null);
 return <>
  <p className="m-0 text-sm text-muted-foreground">Faites les tâches sans aide. Vos réponses sont enregistrées au fur et à mesure pour vous permettre de reprendre plus tard.</p>
  <fieldset className="grid min-w-0 gap-4" aria-label="Tâches du bilan" disabled={busy || !!failure?.stale}>
   {assessment.tasks.map((task, index) => <TaskInput key={task.id} task={task} index={index} response={draft[task.id]} onChange={response => store.edit(task.id, response)}/>)}
  </fieldset>
  {failure ? <div className="flex flex-wrap items-center gap-3">
   <p role="alert" className="m-0 text-sm text-destructive">
    {failure.message}{failure.stale && ' L’actualisation remplacera les modifications non enregistrées par les réponses du serveur.'}
   </p>
   <Button variant="outline" disabled={busy} onClick={failure.stale ? () => refresh(store.discard) : store.retry}>{failure.stale ? 'Actualiser' : 'Réessayer l’enregistrement'}</Button>
  </div> : <p role="status" className="m-0 min-h-5 text-sm text-muted-foreground">
   {dirty ? 'Enregistrement…' : hasSaved ? 'Enregistré' : ''}
  </p>}
  {!ready && <p className="m-0 text-sm text-muted-foreground">Répondez à chaque tâche ou cochez « Je ne sais pas » pour rendre le bilan.</p>}
  <div className="flex flex-wrap items-center gap-3">
   <Button disabled={!ready || dirty || busy} onClick={() => setConfirm('submit')}>Rendre le bilan</Button>
   <Button variant="outline" disabled={dirty || busy} onClick={() => setConfirm('close')}>Abandonner le bilan</Button>
  </div>
  {confirm && <Card className="gap-3 border-ring/30 p-4 shadow-none" role="region" aria-label="Confirmer cette action">
   <p className="m-0 text-sm">{confirm === 'submit' ? 'Le rendu fige vos réponses et les transmet au prof.' : 'Vos réponses seront conservées. Le prof ne corrigera pas ce bilan.'}</p>
   <div className="flex flex-wrap gap-2">
    <Button disabled={busy || dirty || (confirm === 'submit' && !ready)} onClick={() => mutate({
     action: confirm, assessmentId: assessment.id, revision, requestId: crypto.randomUUID(),
    })}>{confirm === 'submit' ? 'Confirmer le rendu' : 'Confirmer l’abandon'}</Button>
    <Button variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>Annuler</Button>
   </div>
  </Card>}
 </>;
}

const verdictLabels = { correct: 'Réussi', partial: 'Partiellement réussi', incorrect: 'À retravailler', unanswered: 'Sans réponse' };
const criterionLabels = { observed_without_help: 'Observé sans aide', needs_work: 'À consolider', not_observed: 'Non observé' };

function AssessmentResult({ assessment }: { assessment: Reviewed }) {
 const { result } = assessment;
 return <>
  <section aria-labelledby="bilan-review-title">
   <h2 id="bilan-review-title" className="mb-3 text-xl">Retour du prof</h2>
   <Card className="gap-4 p-4 shadow-none sm:p-6">
    <p className="m-0 text-sm text-muted-foreground">Publié le {dateLabel.format(new Date(result.reviewedAt))}</p>
    <dl className="m-0 grid gap-4">
     {[
      ['Ce que vous réussissez sans aide', result.strengths],
      ['Ce qui reste fragile', result.fragile],
      ['La prochaine action conseillée', result.nextAction.description],
     ].map(([label, value]) => <div key={label}>
      <dt className="font-semibold">{label}</dt><dd className="m-0 whitespace-pre-wrap wrap-anywhere">{value}</dd>
     </div>)}
    </dl>
    {result.nextAction.lessonHref && <Button asChild variant="outline" className="w-fit">
     <Link href={result.nextAction.lessonHref}>Ouvrir la leçon conseillée<ArrowRight aria-hidden="true"/></Link>
    </Button>}
   </Card>
  </section>
  <section aria-labelledby="bilan-criteria-title">
   <h2 id="bilan-criteria-title" className="mb-3 text-xl">Résultats par critère</h2>
   <ul role="list" className="m-0 grid list-none gap-3 p-0">
    {assessment.criteria.map(({ position, label }) => {
     const verdict = result.criteria.find(criterion => criterion.position === position)!;
     return <li key={position}>
      <Card className="gap-2 p-4 shadow-none">
       <h3 className="m-0 text-base font-semibold wrap-anywhere">{label}</h3>
       <Badge variant="outline" className="h-auto whitespace-normal">{criterionLabels[verdict.status]}</Badge>
       {verdict.reason && <p className="m-0 text-sm text-muted-foreground">{verdict.reason === 'no_answer' ? 'Réponse manquante' : 'Critère non testé dans ce bilan'}</p>}
       <p className="m-0 text-sm whitespace-pre-wrap wrap-anywhere">{verdict.explanation}</p>
      </Card>
     </li>;
    })}
   </ul>
  </section>
  <section aria-labelledby="bilan-tasks-title">
   <h2 id="bilan-tasks-title" className="mb-3 text-xl">Retour par tâche</h2>
   <div className="grid gap-3">
    {assessment.tasks.map((task, index) => {
     const feedback = result.tasks.find(item => item.taskId === task.id)!;
     const response = task.response?.kind === 'answer' ? task.response.value : null;
     const answer = Array.isArray(response) ? response.map(i => task.tokens?.[i]).join(' ') :
      response !== null && task.choices ? task.choices[Number(response)] : response;
     return <Card key={task.id} className="gap-3 p-4 shadow-none sm:p-6">
      <h3 className="m-0 text-lg font-semibold">{task.type === 'free_text' ? 'Production écrite' : `Tâche ${index + 1}`}</h3>
      <TaskPrompt task={task}/>
      <Badge variant="outline">{verdictLabels[feedback.verdict]}</Badge>
      <dl className="m-0 grid gap-3 text-sm">
       <div><dt className="font-medium">Votre réponse</dt><dd lang="it" className="m-0 whitespace-pre-wrap wrap-anywhere">{answer ?? 'Je ne sais pas'}</dd></div>
       {feedback.correction && <div><dt className="font-medium">Correction proposée</dt>
        <dd lang="it" className="m-0 whitespace-pre-wrap wrap-anywhere">{feedback.correction}</dd></div>}
       <div><dt className="font-medium">Explication</dt><dd className="m-0 whitespace-pre-wrap wrap-anywhere">{feedback.explanation}</dd></div>
      </dl>
     </Card>;
    })}
   </div>
  </section>
 </>;
}

export function AssessmentDetail({ id }: { id: string }) {
 const { value: assessment, error, reload, setValue } = useAssessmentResource<StudentAssessment>(detailUrl(id));
 const [busy, setBusy] = useState(false);
 const [failure, setFailure] = useState<{ command: Command; message: string; stale: boolean } | null>(null);
 const [refreshError, setRefreshError] = useState(false);
 const [confirmDismiss, setConfirmDismiss] = useState(false);
 const lock = useRef(false);
 const mutate = async (command: Command) => {
  if (lock.current) return;
  lock.current = true;
  setBusy(true);
  setFailure(null);
  try {
   const receipt = await send(command);
   if (receipt.status === 'submitted' || receipt.status === 'abandoned') forgetAssessmentDraft(id);
   setValue(await request<StudentAssessment>(detailUrl(id)));
  } catch (cause) {
   setFailure({ command,
    message: cause instanceof AssessmentRequestError ? cause.message : 'L’action n’a pas pu être confirmée. Réessayez.',
    stale: cause instanceof AssessmentRequestError && cause.status === 409,
   });
  } finally {
   lock.current = false;
   setBusy(false);
  }
 };
 const refresh = async (discard?: () => void) => {
  setBusy(true);
  setRefreshError(false);
  try {
   const latest = await request<StudentAssessment>(detailUrl(id));
   setFailure(null);
   discard?.();
   setValue(latest);
  } catch {
   setRefreshError(true);
  } finally { setBusy(false); }
 };
 const action = (action: 'start' | 'close') => {
  if (!assessment) return;
  const command = { assessmentId: id, requestId: crypto.randomUUID() };
  void mutate(action === 'start' ? { ...command, action } : { ...command, action, revision: assessment.revision });
 };
 return <div className="grid gap-5">
  <Link href={path} className={linkStyle}><ArrowLeft size={16} aria-hidden="true"/>Tous les bilans</Link>
  {!assessment ? <LoadState error={error} reload={reload}/> : <>
   <header className="grid min-w-0 gap-2">
    <div className="flex flex-wrap items-center gap-3">
     <Badge variant="outline" className="h-auto whitespace-normal">{statusLabels[assessment.status]}</Badge>
     {assessment.status === 'offered' && <span className="text-sm text-muted-foreground">Environ {assessment.estimatedMinutes} min</span>}
    </div>
    <h1 className="m-0 wrap-anywhere">{assessment.title}</h1>
    <p className="m-0 leading-relaxed wrap-anywhere">{assessment.objective}</p>
   </header>
   {(assessment.status === 'offered' || assessment.status === 'in_progress') && <details className="w-full rounded-md border border-border px-4 py-3">
    <summary className="cursor-pointer font-medium">Critères du bilan</summary>
    <ul className="mb-0 mt-2 grid gap-1 pl-5 text-sm">
     {assessment.criteria.map(c => <li key={c.position} className="wrap-anywhere">{c.label}</li>)}
    </ul>
   </details>}
   {refreshError && <p className="m-0 text-sm text-destructive" role="alert">Le bilan est momentanément indisponible. Réessayez.</p>}
   {failure && <div className="flex flex-wrap items-center gap-3">
    <p role="alert" className="m-0 text-sm text-destructive">{failure.message}</p>
    <Button variant="outline" disabled={busy} onClick={() => void (failure.stale ? refresh() : mutate(failure.command))}>
     {failure.stale ? 'Actualiser' : 'Réessayer'}
    </Button>
   </div>}
   {assessment.status === 'offered' && <>
    <p className="m-0 text-sm leading-relaxed wrap-anywhere text-muted-foreground">{assessment.reason}</p>
    <div className="flex flex-wrap gap-2">
     <Button disabled={busy || !!failure} onClick={() => action('start')}>Commencer</Button>
     <Button variant="outline" disabled={busy || !!failure} onClick={() => setConfirmDismiss(true)}>Refuser la proposition</Button>
    </div>
    {confirmDismiss && <Card className="gap-3 p-4 shadow-none" role="region" aria-label="Confirmer le refus">
     <p className="m-0 text-sm">Cette proposition sera rangée dans votre historique.</p>
     <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !!failure} onClick={() => action('close')}>Confirmer le refus</Button>
      <Button variant="ghost" disabled={busy} onClick={() => setConfirmDismiss(false)}>Annuler</Button>
     </div>
    </Card>}
   </>}
   {assessment.status === 'in_progress' && <RunningAssessment key={assessment.revision} assessment={assessment}
    busy={busy || !!failure} mutate={command => void mutate(command)} refresh={discard => void refresh(discard)}/>}
   {assessment.status === 'submitted' && <Card className="gap-3 p-4 shadow-none sm:p-6">
    <p className="m-0">Bilan rendu le {dateLabel.format(new Date(assessment.submittedAt!))}. Le retour complet apparaîtra ici après la correction du prof.</p>
    <Button className="w-fit" variant="outline" disabled={busy} onClick={() => void refresh()}>Vérifier si le retour est prêt</Button>
   </Card>}
   {assessment.status === 'reviewed' && <AssessmentResult assessment={assessment}/>}
   {assessment.status === 'abandoned' && <p className="m-0 text-sm text-muted-foreground">Vos réponses ont été conservées. Ce bilan ne sera pas corrigé.</p>}
  </>}
 </div>;
}
