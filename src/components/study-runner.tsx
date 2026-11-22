'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ExerciseList } from './exercise-list';
import { SentenceExercise } from './sentence-exercise';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { stateLabels } from '@/lib/revision';
import type { Answer, Exercise, SentenceDraft } from '@/lib/exercises';

type Props = {
 headingLevel?:3|4; initialItemId?:string; items:Exercise[]; scopeId:string; busy:boolean;
 completion?:ReactNode;
 onSubmit:(item:Exercise,answer:string,mode?:'translation')=>Promise<boolean>;
 onReveal:(item:Exercise)=>Promise<{italian:string;example:string}>;
 onSentenceSubmit:(item:Exercise,answer:Answer,draft:SentenceDraft)=>Promise<boolean>;
 onHint:(item:Exercise,draft:SentenceDraft,level:number)=>Promise<string[]>;
};
function needsWork(item: Exercise) {
 return !item.latestAttempt || Boolean(item.needsAttempt && item.latestAttempt.status !== 'pending_teacher');
}
function canWork(item: Exercise) {
 return needsWork(item) && !item.alreadyReviewed && !item.revision?.pending;
}
export function StudyRunner({items,initialItemId,scopeId,busy,onSubmit,onReveal,onSentenceSubmit,onHint,headingLevel=3,completion}:Props) {
 const [presentation,setPresentation] = useState(() => ({ id:(items.find(item=>item.id===initialItemId && canWork(item)) || items.find(canWork) || items.find(x=>x.latestAttempt?.status==='pending_teacher') || items[0])?.id, before:'', retry:false }));
 const [finished,setFinished] = useState(false);
 const [reviewId,setReviewId] = useState<string | null>(null);
 const title = useRef<HTMLDivElement>(null);
 const Heading = headingLevel === 4 ? 'h4' : 'h3';
 const current = items.find(item => item.id === (reviewId ?? presentation.id));
 const completed = items.filter(item => item.latestAttempt);
 const reviewing = reviewId !== null;
 const freshRetry = !reviewing && presentation.retry && current?.latestAttempt?.id === presentation.before;
 useEffect(() => { title.current?.focus(); },[presentation.id,presentation.before,finished,reviewing]);
 const next = () => {
  if (reviewing) {
   const index = completed.findIndex(item => item.id === reviewId);
   setReviewId(completed[index + 1]?.id ?? null);
   return;
  }
  const retry = items.find(item => item.retryReady && !(item.id === current?.id && freshRetry));
  const pending = retry || items.find(item => item.id!==current?.id && canWork(item));
  if (!pending) { setFinished(true); return; }
  setPresentation({ id:pending.id, before:pending.latestAttempt?.id || '', retry:!!retry });
 };
 if (!current || finished && !reviewing) return <>
  <div ref={title} tabIndex={-1} className="rounded-xl border border-border bg-card p-6" role="status"><Heading className="mb-2">Travail enregistré</Heading><p className="text-sm text-muted-foreground">{items.length ? 'Les prochaines révisions suivent les échéances de chaque item. Les réponses en attente seront corrigées par le professeur.' : 'Aucun item à proposer dans votre budget pour le moment. Vous pouvez choisir une pratique volontaire.'}</p>{completed.length > 0 && <Button className="mt-4" variant="outline" onClick={() => setReviewId(completed[0].id)}>Consulter mes réponses</Button>}</div>
  {finished && completion}
 </>;
 const shown = freshRetry ? {...current,latestAttempt:null} : current;
 const previousSentence = completed.find(item => item.sentence && item.id !== current.id);
 return <div className="grid gap-4">
  <div ref={title} tabIndex={-1} className="flex flex-wrap items-center gap-2 text-sm">
   <span>Item {items.indexOf(current)+1} / {items.length}</span>
   {current.revision && <><Badge variant="secondary">{stateLabels[current.revision.state]}</Badge>{current.revision.due && <span className="text-muted-foreground">Prochaine révision : <time dateTime={current.revision.due}>{current.revision.due}</time></span>}</>}
   {reviewing ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setReviewId(null)}>
    {finished ? 'Retour au bilan' : 'Reprendre le travail'}
   </Button> : previousSentence && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setReviewId(previousSentence.id)}>Consulter mes réponses</Button>}
  </div>
  {reviewing && completed.length > 1 && <label className="flex flex-wrap items-center gap-2 text-sm">
   <span>Réponse à consulter</span>
   <select className="max-w-full rounded-md border border-border bg-background p-2" value={current.id} disabled={busy} onChange={event => setReviewId(event.target.value)}>
    {completed.map(item => <option key={item.id} value={item.id}>{items.indexOf(item) + 1}. {item.content.slice(0,80)}</option>)}
   </select>
  </label>}
  {current.alreadyReviewed && !current.latestAttempt && !presentation.retry ? <div className="rounded-xl border border-border bg-card p-5"><p className="mb-3">Déjà révisé aujourd’hui. Vous pouvez passer cet item.</p><Button variant="outline" disabled={busy} onClick={() => setPresentation({id:current.id,before:'',retry:true})}>Refaire volontairement</Button></div> : <>
   {freshRetry && <p role="status" className="rounded-lg bg-accent p-3 text-sm">Nouvel essai après correction. Cette réponse sera conservée sans faire progresser la consolidation.</p>}
   {shown.sentence
    ? <SentenceExercise key={current.id} exercise={shown} sentence={shown.sentence} scopeId={scopeId} busy={busy} headingLevel={headingLevel}
       onSubmit={(answer,draft) => onSentenceSubmit(current,answer,draft)} onHint={(draft,level) => onHint(current,draft,level)}/>
    : <ExerciseList key={current.id+presentation.before} exercises={[shown]} busy={busy} onSubmit={onSubmit} onReveal={onReveal} allowRetry={!reviewing && needsWork(current) && !!shown.latestAttempt} headingLevel={headingLevel} initialMode="translation"/>}
  </>}
  {shown.latestAttempt?.assisted && <p className="text-sm text-muted-foreground">Réponse après aide ou correction : entraînement enregistré, consolidation inchangée.</p>}
  <div className="flex justify-end"><Button disabled={busy || !shown.latestAttempt && !current.alreadyReviewed && !current.revision?.pending} onClick={next}>Continuer</Button></div>
 </div>;
}
