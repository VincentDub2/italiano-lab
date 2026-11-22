'use client';
import Link from 'next/link';
import { WrittenCorrection } from './correction-detail';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, RefreshCw } from 'lucide-react';
import { StudyRunner } from '@/components/study-runner';
import type { Answer, Attempt, Exercise, SentenceDraft } from '@/lib/exercises';
import type { StudentLesson } from '@/server/proactive-lessons';
import type { SessionDifficulty } from '@/server/domain';
import type { SessionTakeaway } from '@/server/schemas';
export type { Exercise } from '@/lib/exercises';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type SessionReminder={title:string;explanation:string;examples:{italian:string;french:string}[]};
type Session={id:string;title:string;objective:string;scheduled_date:string;source:'demo'|'prof';total:number;completed:number;pending:number;covered_today?:number;remaining?:number;exercises:Exercise[];reminders?:SessionReminder[];takeaways?:SessionTakeaway[];difficulty_feedback?:SessionDifficulty|null};
const difficultyChoices: [SessionDifficulty,string][] = [
 ['too_easy','Trop facile'],
 ['just_right','Bon niveau'],
 ['too_hard','Trop difficile'],
];
async function api(path:string, body?:unknown) {const r=await fetch('/api/'+path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw new Error('Opération impossible. Réessayez.'); return r.json();}
const todayRome=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const displayDate=(date:string)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Rome',day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00Z'));
export function Sessions({corrections=false,lesson,onLessonRefresh,onProgress,sessionId,occurrenceId}:{
 corrections?:boolean;lesson?:StudentLesson;onLessonRefresh?:()=>Promise<void>;onProgress?:()=>Promise<void>;sessionId?:string;occurrenceId?:string;
}) {
 const [sessions,setSessions]=useState<Session[]>([]); const [selected,setSelected]=useState<Session|null>(null); const [attempts,setAttempts]=useState<Attempt[]>([]); const [error,setError]=useState(''); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const lock=useRef(false);
 const [showAll,setShowAll]=useState(false);
 const lessonSessionId = lesson?.sessionId;
 const directSessionId = lessonSessionId ?? sessionId;
 const refresh=useCallback(async()=>{
  if (lessonSessionId) await onLessonRefresh?.();
  else if (corrections) setAttempts(await api('feedback'));
  else if (!sessionId) setSessions(await api('sessions'));
 },[corrections,lessonSessionId,onLessonRefresh,sessionId]);
 const open=useCallback(async(id:string)=>{
  const session:Session=await api('session?id='+encodeURIComponent(id));
  for (const e of session.exercises) {
   const key='italiano-attempt:'+e.id;
   try {
    const pending=JSON.parse(sessionStorage.getItem(key) || 'null');
    if (pending?.requestId===e.latestAttempt?.request_id) sessionStorage.removeItem(key);
   } catch {}
  }
  setSelected(session);
 },[]);
 useEffect(()=>{
  const timer=setTimeout(()=>{
   void (directSessionId ? open(directSessionId) : refresh()).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  },0);
  return ()=>clearTimeout(timer);
 },[directSessionId,open,refresh]);
 const run=async(fn:()=>Promise<void>)=>{if(lock.current)return false; lock.current=true;setBusy(true);try {setError('');await fn();return true;}catch(e){setError((e as Error).message);return false;}finally{lock.current=false;setBusy(false);}};
 const submit=async(e:Exercise,answer:string,mode?:'translation')=>{const key='italiano-attempt:'+e.id; let pending: {requestId:string;answer:string;mode?:'translation'}|null=null; try {pending=JSON.parse(sessionStorage.getItem(key) || 'null');} catch {} if(!pending) {pending={requestId:crypto.randomUUID(),answer,...(mode ? {mode} : {})};try {sessionStorage.setItem(key,JSON.stringify(pending));} catch {}} if(pending.answer!==answer || pending.mode!==mode) throw new Error('Une réponse est en attente : renvoyez votre réponse précédente.'); await api('attempt',{exerciseId:e.id,...pending}); await Promise.all([refresh(),open(selected!.id),onProgress?.()]);};
 const submitSentence=(e:Exercise,answer:Answer,draft:SentenceDraft)=>run(async()=>{
  if (!selected) return;
  await api('attempt',{exerciseId:e.id,answer,...draft});
  await Promise.all([refresh(),open(selected.id),onProgress?.()]);
 });
 if(loading) return <p className="practice-section" role="status">Chargement des séances…</p>;
 const date=todayRome();
 const toDo=sessions.filter(s=>s.scheduled_date<=date && (s.remaining ?? s.total-s.completed)>0);
 const visibleSessions=showAll?sessions:toDo;
 const sessionGroups=[
  {heading:'Aujourd’hui',items:visibleSessions.filter(s=>s.scheduled_date===date)},
  {heading:showAll?'Séances précédentes':'À rattraper',items:visibleSessions.filter(s=>s.scheduled_date<date)},
  {heading:'À venir',items:visibleSessions.filter(s=>s.scheduled_date>date)},
 ].filter(group=>group.items.length>0);
 const completed=selected?.exercises.filter(e=>(e.latestAttempt || e.alreadyReviewed) && !e.needsAttempt).length ?? 0;
 const worked=(s:Session)=>s.remaining===undefined ? s.completed+(s.covered_today || 0) : s.total-s.remaining;
 const groupCount=new Set(selected?.exercises.map(e=>e.group_id ?? e.id)).size;
 return <section className="mt-10" aria-label={lesson ? 'Contenu de la leçon' : corrections ? 'Corrections' : 'Votre pratique'}><div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-9"><div>{sessionId ? <h1 className="m-0 wrap-anywhere">{selected?.title ?? 'Séance'}</h1> : <h2 className="mb-0">{lesson?'Contenu de la leçon':corrections?'Corrections':'Séances'}</h2>}</div><Button variant="outline" className="border-border" disabled={busy} onClick={()=>void run(async()=>{await refresh();const id=directSessionId ?? selected?.id;if(id)await open(id);})}><RefreshCw aria-hidden="true"/>Actualiser</Button></div>{error && <p className="notice" role="alert">{error}</p>}{corrections ? <>{attempts.length===0 && <p>Aucune réponse en attente.</p>}{attempts.map(a=><Card className="mb-3 gap-3 p-5 shadow-none" key={a.id}><h3 className="font-semibold">{a.title || 'Entraînement libre'}</h3><p className="m-0 wrap-anywhere">{a.content}</p><WrittenCorrection attempt={a}/>
   {a.status==='corrected' && <Button asChild variant="outline" className="w-fit"><Link href={'/corrections/'+encodeURIComponent(a.id)}>Ouvrir la correction</Link></Button>}
  </Card>)}</> : !selected ? !directSessionId && <div className="grid gap-6">
  <div className="flex flex-wrap items-center justify-between gap-4">
    <span className="text-sm text-muted-foreground">{showAll?'Retrouvez toutes vos séances, passées et à venir.':'Vos séances à terminer, en commençant par aujourd’hui.'}</span>
    <div role="group" aria-label="Afficher les séances" className="inline-flex max-w-full gap-1 rounded-lg bg-accent p-1">
      <Button variant={showAll?'ghost':'default'} size="sm" aria-pressed={!showAll} onClick={()=>setShowAll(false)}>À faire<Badge aria-hidden="true" variant={showAll?'secondary':'outline'} className={showAll?'':'border-primary-foreground/30 text-primary-foreground'}>{toDo.length}</Badge></Button>
      <Button variant={showAll?'default':'ghost'} size="sm" aria-pressed={showAll} onClick={()=>setShowAll(true)}>Toutes les séances</Button>
    </div>
  </div>
  {sessionGroups.map(({heading,items})=><div key={heading} className="grid gap-3">
    <h3 className="m-0 flex items-center gap-2 text-sm font-semibold">{heading}<Badge aria-hidden="true" variant="secondary">{items.length}</Badge></h3>
    <div className="grid gap-3">
      {items.map(s=><Card key={s.id} className={`gap-0 overflow-hidden border-border py-0 shadow-none ${s.scheduled_date===date?'border-primary/30':''}`}>
        <Button variant="ghost" className="group h-auto w-full min-w-0 justify-between gap-4 rounded-xl px-4 py-5 text-left whitespace-normal sm:px-6" disabled={busy} onClick={()=>void run(()=>open(s.id))}>
          <span className="grid min-w-0 flex-1 gap-3">
            <span className="flex flex-wrap items-center gap-2"><strong className="text-base leading-snug break-words">{s.title}</strong><Badge variant={s.pending?'outline':'secondary'}>{s.pending?'En attente de correction':worked(s)===s.total?'Terminé':s.completed?'En cours':'À faire'}</Badge></span>
            <span className="text-sm leading-relaxed font-normal break-words text-muted-foreground">{s.objective}</span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-normal text-muted-foreground"><span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden="true"/><time dateTime={s.scheduled_date}>{displayDate(s.scheduled_date)}</time></span><span>{s.source==='demo'?'Démonstration':'Professeur'}</span></span>
            <span className="flex flex-wrap items-center gap-3 text-xs font-normal text-muted-foreground"><progress aria-label={'Progression de '+s.title} value={worked(s)} max={s.total || 1} className="h-1.5 w-24 overflow-hidden rounded-full border-0 bg-accent accent-primary [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-accent [&::-webkit-progress-value]:bg-primary"/><span>{worked(s)}/{s.total} items traités{s.covered_today ? ` · ${s.covered_today} déjà révisé(s) aujourd’hui` : ''}</span></span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 text-sm text-primary"><span className="hidden sm:inline">{worked(s)===s.total?'Consulter':s.completed?'Continuer':'Commencer'}</span><ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true"/></span>
        </Button>
      </Card>)}
    </div>
  </div>)}
  {!error && sessionGroups.length===0 && <Card className="items-start gap-2 border-dashed border-border p-6 shadow-none"><CalendarDays aria-hidden="true" className="mb-2 size-6 text-primary"/><strong>{showAll?'Aucune séance disponible.':'Vous êtes à jour !'}</strong><span className="text-sm leading-relaxed text-muted-foreground">{showAll?'Vos prochaines séances apparaîtront ici.':'Aucune séance à terminer pour aujourd’hui. Retrouvez les séances terminées et à venir dans « Toutes les séances ».'}</span></Card>}
 </div> : <div className="session-detail">
  {!lesson && (sessionId ? <Button asChild variant="ghost" className="session-back"><Link href="/#seances"><ArrowLeft aria-hidden="true"/>Retour aux séances</Link></Button>
   : <Button className="session-back" variant="ghost" disabled={busy} onClick={()=>setSelected(null)}><ArrowLeft aria-hidden="true"/>Retour aux séances</Button>)}
  {lesson?.status!=='advised' && <div className="session-summary">
    {!lesson && <div className="session-meta"><Badge variant="outline">{selected.source==='demo'?'Démonstration':'Professeur'}</Badge><span><CalendarDays size={14} aria-hidden="true"/><time dateTime={selected.scheduled_date}>{displayDate(selected.scheduled_date)}</time></span></div>}
    {!lesson && <>{!sessionId && <h3>{selected.title}</h3>}<p>{selected.objective}</p></>}
    <p className="exercise-help">{groupCount} exercice(s) · {selected.exercises.length} item(s)</p>
    <div className="session-progress"><span id="session-progress-label">Progression de la séance</span><strong>{completed} / {selected.exercises.length} items traités</strong></div>
    <progress aria-labelledby="session-progress-label" value={completed} max={selected.exercises.length || 1}/>
  </div>}
  {!!(selected.reminders ?? selected.takeaways)?.length && <section aria-labelledby="session-takeaways" className="mb-8">
   <h4 id="session-takeaways" className="mb-3 flex items-center gap-2 text-lg font-semibold text-primary">
     <BookOpen aria-hidden="true" className="size-5"/>À retenir
   </h4>
   <p className="mb-3 text-sm text-muted-foreground">À lire avant les exercices : ces cartes ne sont pas notées.</p>
   <ul role="list" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
     {(selected.reminders ?? selected.takeaways)!.map((card, index) => <li key={index} className="min-w-0 sm:flex-1 sm:basis-44">
        <Card className="h-full gap-3 border-border bg-accent/50 p-4 wrap-anywhere shadow-none">
          <h5 className="text-base font-semibold">{card.title}</h5>
          <p className="text-sm text-muted-foreground">{card.explanation}</p>
          <ul role="list" className="grid gap-3 border-l-2 border-primary/30 pl-3 text-sm">
            {card.examples.map((example, position) => <li key={position}>
              <span lang="it" className="block font-medium text-foreground">{example.italian}</span>
              <span className="block text-muted-foreground">{example.french}</span>
            </li>)}
          </ul>
        </Card>
      </li>)}
    </ul>
  </section>}
  {lesson?.status==='advised' ? <section aria-labelledby="lesson-preview-exercises">
   <h3 id="lesson-preview-exercises" className="mb-3 text-lg font-semibold">Exercices de la leçon</h3>
   <ol className="grid gap-3">
    {selected.exercises.map(e=><li key={e.id} className="rounded-lg border border-border p-4 text-sm wrap-anywhere">
     <p className="font-medium">{e.instruction}</p><p className="text-muted-foreground">{e.content}</p>
    </li>)}
   </ol>
  </section> : <StudyRunner headingLevel={4} key={selected.id} scopeId={selected.id} initialItemId={occurrenceId} items={selected.exercises} busy={busy}
    onReveal={e=>api('reveal',{exerciseId:e.id})} onSubmit={(e,answer,mode)=>run(()=>submit(e,answer,mode))}
    onSentenceSubmit={submitSentence} onHint={async(e,draft,level)=>(await api('sentence-hint',{exerciseId:e.id,...draft,level})).hints}
    completion={!lesson && completed===selected.exercises.length && <section aria-labelledby="session-difficulty-label" className="mt-4">
      <Card className="gap-3 border-border bg-accent/50 p-4 shadow-none sm:p-6">
        <h4 id="session-difficulty-label" className="font-semibold">Comment avez-vous trouvé cette séance ?</h4>
        <div className="flex flex-wrap gap-2">
          {difficultyChoices.map(([difficulty,label]) => {
            const chosen=selected.difficulty_feedback===difficulty;
            return <Button key={difficulty} type="button" variant={chosen ? 'default' : 'outline'} aria-pressed={chosen} disabled={busy}
              onClick={()=>void run(async()=>{
                await api('session-difficulty',{sessionId:selected.id,difficulty});
                setSelected({...selected,difficulty_feedback:difficulty});
              })}>{label}</Button>;
          })}
        </div>
        <p role="status" className="text-sm text-muted-foreground">{selected.difficulty_feedback ? 'Retour enregistré pour le prof.' : 'Ce retour facultatif aide le prof à préparer la prochaine séance.'}</p>
      </Card>
    </section>}/>}
 </div>}</section>;
}
