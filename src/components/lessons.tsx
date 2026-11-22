'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { StudentLesson } from '@/server/proactive-lessons';
import { romeDay } from '@/lib/revision';
import { Sessions } from './sessions';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

function lessonHref(id: string) { return '/lecons/'+encodeURIComponent(id); }
const dateLabel = new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Rome',day:'numeric',month:'long',year:'numeric'});
function lessonState(lesson: StudentLesson) {
 if (lesson.waitingForCorrection) return 'En attente de correction';
 if (lesson.status==='j0_completed') return 'J0 terminé';
 if (lesson.status==='dismissed') return 'Écartée';
 if (lesson.status==='in_progress') return 'En cours';
 return lesson.canStart ? 'Conseillée' : 'Proposition indisponible';
}

async function lessonApi<T>(path: string, body?: unknown): Promise<T> {
 const response = await fetch('/api/'+path,body===undefined ? {cache:'no-store'} : {
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
 });
 if (!response.ok) throw new Error('La leçon est actuellement indisponible.');
 return response.json();
}

function LessonActions({lesson,refresh}: {lesson:StudentLesson;refresh:()=>Promise<void>}) {
 const pendingKey = useRef<Partial<Record<'start'|'dismiss',string>>>({});
 const busy = useRef(false);
 const [saving,setSaving] = useState(false);
 const [error,setError] = useState('');
 const act = async(action:'start'|'dismiss')=>{
  if (busy.current) return;
  busy.current = true;
  setSaving(true);
  setError('');
  try {
   const key = pendingKey.current[action] ??= crypto.randomUUID();
   await lessonApi('lesson-action',{lessonId:lesson.id,requestId:key,action});
   await refresh();
  } catch {
   setError('Action indisponible. Actualisez la leçon, puis réessayez.');
   await refresh().catch(()=>{});
  } finally {
   busy.current = false;
   setSaving(false);
  }
 };
 return <div className="mt-2 flex flex-wrap items-center gap-2">
  {lesson.status==='advised' && <>
   {lesson.canStart && <Button type="button" disabled={saving} onClick={()=>void act('start')}>Commencer</Button>}
   <Button type="button" variant="ghost" disabled={saving} onClick={()=>void act('dismiss')}>Pas maintenant</Button>
  </>}
  {error && <p role="alert" className="basis-full text-sm text-destructive">{error}</p>}
 </div>;
}

function LessonDates({lesson}: {lesson:StudentLesson}) {
 if (!lesson.milestones.length) return null;
 const today = romeDay();
 return <section className="mt-5" aria-label="Révisions de la leçon">
  <h2 className="mb-3 text-xl">Révisions de la leçon</h2>
  <ul className="grid gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3" role="list">
   {lesson.milestones.map(m=><li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
    <Badge variant="outline">J{m.step}</Badge>
    <time dateTime={m.date}>{dateLabel.format(new Date(m.date+'T12:00:00Z'))}</time>
    <span className="text-muted-foreground">{m.completedAt ? 'Effectué' : m.date<today ? 'En retard' : m.date===today ? 'Aujourd’hui' : 'À venir'}</span>
    {m.completedAt && m.result==='needs_work' && <span className="basis-full text-muted-foreground">Points à retravailler</span>}
    {m.completedAt && m.result==='assisted' && <span className="basis-full text-muted-foreground">Avec aide</span>}
    {m.completedAt && m.result==='invalidated' && <span className="basis-full text-muted-foreground">Résultat rectifié</span>}
   </li>)}
  </ul>
 </section>;
}

export function Lessons({lessonId}: {lessonId?:string}) {
 const [lessons,setLessons] = useState<StudentLesson[] | null>(null);
 const [error,setError] = useState(false);
 const refresh = useCallback(async()=>{
  const path = lessonId ? 'lesson?id='+encodeURIComponent(lessonId) : 'lessons';
  const result = lessonId ? [await lessonApi<StudentLesson>(path)] : await lessonApi<StudentLesson[]>(path);
  setLessons(result);
  setError(false);
 },[lessonId]);

 useEffect(()=>{
  const timer = setTimeout(()=>{void refresh().catch(()=>setError(true));},0);
  return ()=>clearTimeout(timer);
 },[refresh]);

 const loadError = error && <div className="flex flex-wrap items-center gap-3">
  <p role="alert" className="text-sm text-destructive">Impossible de charger les leçons.</p>
  <Button type="button" variant="outline" onClick={()=>void refresh().catch(()=>setError(true))}>Réessayer</Button>
 </div>;
 const loading = !lessons && !error && <p role="status" className="text-sm text-muted-foreground">Chargement des leçons…</p>;

 const lesson = lessonId ? lessons?.[0] : undefined;
 if (lessonId) return <div className="mt-6">
  <Button asChild variant="ghost" className="mb-5"><Link href="/lecons"><ArrowLeft aria-hidden="true"/>Mes leçons</Link></Button>
  {loading}{loadError}
  {lesson && <>
   <h1 className="mb-3 wrap-anywhere">{lesson.title}</h1>
   <p className="mb-4 text-muted-foreground wrap-anywhere">{lesson.objective}</p>
   <p className="mb-4 wrap-anywhere">{lesson.reason}</p>
   <div role="status"><Badge variant="outline">{lessonState(lesson)}</Badge></div>
   {lesson.status==='advised' && <LessonActions key={lesson.id} lesson={lesson} refresh={refresh}/>}
   <LessonDates lesson={lesson}/>
   {lesson.status!=='dismissed' && <Sessions lesson={lesson} onLessonRefresh={refresh}/>}
  </>}
 </div>;

 return <section className="mt-6">
  <h1 className="mb-5">Mes leçons</h1>
  {loading}{loadError}
  {lessons?.length===0 && <Card className="border-dashed p-5 text-sm text-muted-foreground shadow-none">Les leçons conseillées par le professeur apparaîtront ici.</Card>}
  {!!lessons?.length && <ul className="grid gap-3 p-0" role="list">
   {lessons.map(l=>{
    const next = l.milestones.find(m=>!m.completedAt);
    return <li key={l.id}>
     <Card className="gap-2 p-4 shadow-none sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
       <Link className="font-semibold text-primary underline-offset-4 hover:underline wrap-anywhere" href={lessonHref(l.id)}>{l.title}</Link>
       <Badge variant="outline">{lessonState(l)}</Badge>
      </div>
      {next && <p className="m-0 text-sm text-muted-foreground">{next.date<romeDay()?'Révision en retard':'Prochaine révision'} · J{next.step} · <time dateTime={next.date}>{dateLabel.format(new Date(next.date+'T12:00:00Z'))}</time></p>}
     </Card>
    </li>;
   })}
  </ul>}
 </section>;
}
