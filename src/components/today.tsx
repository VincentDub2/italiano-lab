'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3 } from 'lucide-react';
import type { Today as TodayData, TodayAction } from '@/server/today';
import { Button, buttonVariants } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Reminders } from './reminders';
import { Sessions } from './sessions';

const lessonHref = (id:string) => '/lecons/'+encodeURIComponent(id);
const sessionHref = (id:string, occurrenceId?:string) => '/seances/'+encodeURIComponent(id)+
 (occurrenceId ? '?item='+encodeURIComponent(occurrenceId) : '');
const correctionHref = (id:string) => '/corrections/'+encodeURIComponent(id);

function actionHref(action:TodayAction) {
 switch(action.kind) {
  case 'revision':
  case 'resume-session':
  case 'start-session': return sessionHref(action.targetId,action.occurrenceId);
  case 'resume-lesson':
  case 'start-lesson': return lessonHref(action.targetId);
  case 'correction': return correctionHref(action.targetId);
  case 'practice': return '/entrainement?mode=cible';
 }
}
function actionLabel(action:TodayAction) {
 switch(action.kind) {
  case 'revision': return `${action.resuming ? 'Reprendre' : 'Travailler'} le J${action.step}`;
  case 'resume-session': return 'Reprendre la séance';
  case 'start-session': return 'Commencer la séance';
  case 'resume-lesson': return 'Reprendre la leçon';
  case 'start-lesson': return 'Commencer la leçon';
  case 'correction': return 'Lire la correction';
  case 'practice': return 'S’entraîner';
 }
}

function PrimaryAction({action,refresh}:{action:TodayAction;refresh:()=>Promise<void>}) {
 const router = useRouter();
 const key = useRef<string | undefined>(undefined);
 const lock = useRef(false);
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState(false);

 async function startLesson(lessonId:string) {
  if (lock.current) return;
  lock.current=true;
  setBusy(true);
  setError(false);
  try {
   const response = await fetch('/api/lesson-action',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'start',lessonId,requestId:key.current ??= crypto.randomUUID()}),
   });
   if (!response.ok) throw new Error();
   router.push(lessonHref(lessonId));
  } catch {
   setError(true);
   await refresh();
  } finally {
   lock.current=false;
   setBusy(false);
  }
 }
 return <>
  <h2 className="m-0 text-2xl leading-tight wrap-anywhere sm:text-3xl">{action.title}</h2>
  <p className="m-0 max-w-2xl text-sm leading-relaxed text-muted-foreground wrap-anywhere sm:text-base">{action.reason}</p>
  {action.minutes && <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" aria-hidden="true"/>Environ {action.minutes} min</p>}
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
   {action.kind==='start-lesson' ? <>
    <Button type="button" size="lg" disabled={busy} onClick={()=>void startLesson(action.targetId)}>
     {actionLabel(action)}<ArrowRight aria-hidden="true"/>
    </Button>
    <Link href={actionHref(action)} className="rounded-sm text-sm font-medium text-primary underline underline-offset-4">Voir la leçon</Link>
   </> : <Button asChild size="lg">
    <Link href={actionHref(action)}>{actionLabel(action)}<ArrowRight aria-hidden="true"/></Link>
   </Button>}
  </div>
  {error && <p role="alert" className="m-0 text-sm text-destructive">Le démarrage n’a pas abouti. Actualisez la leçon pour vérifier son état.</p>}
 </>;
}

const revisionStatus = {
 external:'Rappel externe · Couverture à confirmer',ready:'Séance prête',waiting:'En attente de correction',
 unscheduled:'Séance à préparer',blocked:'Après le jalon précédent',done:'Effectuée',
};

export function Today() {
 const [data,setData] = useState<TodayData | null>(null);
 const [error,setError] = useState(false);
 const [calendarRevision,setCalendarRevision] = useState(0);
 const controller = useRef<AbortController | null>(null);
 const refresh = useCallback(async()=>{
  controller.current?.abort();
  const request = new AbortController();
  controller.current=request;
  try {
   const response=await fetch('/api/today',{cache:'no-store',signal:request.signal});
   if (!response.ok) throw new Error();
   const value:TodayData=await response.json();
   if (!request.signal.aborted) {setData(value);setError(false);}
  } catch { if (!request.signal.aborted) setError(true); }
 },[]);

 const refreshActivities = useCallback(async()=>{
  setCalendarRevision(revision=>revision+1);
  await refresh();
 },[refresh]);

 useEffect(()=>{
  const timer=window.setTimeout(()=>void refresh(),0);
  const onReturn=(event:PageTransitionEvent)=>{if(event.persisted) void refreshActivities();};
  const onVisible=()=>{if(document.visibilityState==='visible') void refreshActivities();};
  window.addEventListener('pageshow',onReturn);
  document.addEventListener('visibilitychange',onVisible);
  return ()=>{
   window.clearTimeout(timer);
   controller.current?.abort();
   window.removeEventListener('pageshow',onReturn);
   document.removeEventListener('visibilitychange',onVisible);
  };
 },[refresh,refreshActivities]);

 const action = error ? null : data?.primaryAction;
 return <>
  <h1 className="mb-5">Aujourd’hui</h1>
  <Card role="region" aria-labelledby="today-action-title" className="gap-3 border-primary/25 bg-accent/45 p-5 shadow-none sm:gap-4 sm:p-7">
   <p id="today-action-title" className="m-0 text-sm font-semibold text-primary">À faire maintenant</p>
   {error ? <div className="grid justify-items-start gap-3">
    <p role="alert" className="m-0 text-sm text-destructive">Impossible de charger la prochaine action.</p>
    <Button variant="outline" type="button" onClick={()=>void refresh()}>Réessayer</Button>
   </div> : !data ? <p role="status" className="m-0 text-sm text-muted-foreground">Chargement de la prochaine action…</p>
   : action ? <PrimaryAction key={action.kind+'-'+action.targetId} action={action} refresh={refresh}/>
   : <>
    <h2 className="m-0 text-2xl">Rien d’obligatoire pour aujourd’hui</h2>
    <p className="m-0 text-sm text-muted-foreground">{data.dailyComplete ? 'Votre objectif quotidien est rempli.' : 'Vous pouvez retrouver vos activités à tout moment.'}</p>
   </>}
  </Card>
  <section aria-labelledby="today-other-actions" className="mt-6">
   <h2 id="today-other-actions" className="mb-3 text-xl">Autres actions</h2>
   <ul className="m-0 grid gap-2 p-0 sm:grid-cols-2" role="list">
    {!error && data?.secondaryActions.map(other=>(
     <li key={other.kind+'-'+other.targetId} className="min-w-0">
      <Link href={actionHref(other)} className="flex h-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm leading-relaxed text-primary hover:bg-accent">
       <span className="min-w-0 wrap-anywhere"><strong className="block font-semibold">{other.title}</strong>
        <span className="text-muted-foreground">{other.kind==='start-lesson' ? 'Voir la leçon conseillée' : actionLabel(other)}</span></span>
       <ArrowRight className="size-4 shrink-0" aria-hidden="true"/>
      </Link>
     </li>
    ))}
   </ul>
   <div className="mt-3 flex flex-wrap gap-2">
    {action?.kind!=='practice' && (error || !data?.secondaryActions.some(a=>a.kind==='practice')) &&
     <Button asChild variant="outline"><Link href="/entrainement">Entraînement libre</Link></Button>}
    <a className={buttonVariants({variant:'outline'})} href="#seances">Voir les séances</a>
    <a className={buttonVariants({variant:'outline'})} href="#revisions-prevues"><CalendarDays aria-hidden="true"/>Calendrier</a>
   </div>
  </section>
  {!error && !!data?.notices.some(n=>n.kind!=='external-unavailable') &&
   <ul aria-label="Réponses en attente" role="list" className="mt-5 grid gap-2 p-0 text-sm text-muted-foreground">
    {data.notices.map(n=> n.targetId && <li key={n.targetId}>
     <Link className="text-primary underline-offset-4 hover:underline" href={n.kind==='lesson-pending'?lessonHref(n.targetId):sessionHref(n.targetId)}>{n.title}</Link>
     {' · En attente de correction'}
    </li>)}
   </ul>}
  <section id="revisions-prevues" aria-labelledby="today-revisions-title" className="mt-10 scroll-mt-5 border-t border-border pt-6">
   <h2 id="today-revisions-title" className="mb-3">Révisions prévues</h2>
   {!error && data?.notices.some(n=>n.kind==='external-unavailable') &&
    <p className="mb-3 text-sm text-muted-foreground">Calendrier externe indisponible. Les échéances d’Italiano Lab restent accessibles.</p>}
   {!error && !!data?.revisions.length && <ul role="list" className="m-0 grid gap-2 p-0">
    {data.revisions.map(r=><li key={r.source+'-'+r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card p-3 text-sm">
     <Badge variant="outline">{r.step}</Badge><strong className="min-w-0 wrap-anywhere">{r.title}</strong>
     <span className="text-muted-foreground">{revisionStatus[r.status]}{r.date<data.date ? ' · En retard' : ''}</span>
     {r.sessionId && (action?.kind!=='revision' || action.occurrenceId!==r.occurrenceId) &&
      <Link className="text-primary underline underline-offset-4" href={sessionHref(r.sessionId,r.occurrenceId)}>Ouvrir la séance</Link>}
    </li>)}
   </ul>}
   <Reminders revision={calendarRevision}/>
  </section>
  <div id="seances" className="scroll-mt-5"><Sessions onProgress={refreshActivities}/></div>
 </>;
}
