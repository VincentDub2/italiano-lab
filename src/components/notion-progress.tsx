'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { NotionStatus, StudentNotionProgress } from '@/server/notion-progress';
import { AssessmentComparisonsPanel } from './assessment-comparisons';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

type Notion = StudentNotionProgress['notions'][number];
type Activity = Notion['lastActivity'];
const statusLabels:Record<NotionStatus,string>={
 not_evaluated:'Pas encore évalué',
 assessing:'En cours d’évaluation',
 needs_work:'À consolider',
 recent_success:'Réussi sans aide récemment',
};
const dateLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Rome',day:'numeric',month:'long',year:'numeric'});

function DateLabel({date}:{date:string}) {
 return <time dateTime={date}>{dateLabel.format(new Date(date+'T12:00:00Z'))}</time>;
}

function ActivityLink({entry,children}:{entry:Activity;children:React.ReactNode}) {
 const prefix=entry.target==='correction'?'/corrections/':'/mon-niveau/tentatives/';
 return <Link className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline wrap-anywhere"
  href={prefix+encodeURIComponent(entry.attemptId)}>{children}</Link>;
}

function NotionCard({notion}:{notion:Notion}) {
 return <Card className="gap-4 p-4 shadow-none sm:p-6">
  <div className="grid min-w-0 gap-2">
   <h3 className="m-0 text-lg font-semibold wrap-anywhere">{notion.notion}</h3>
   <Badge variant="outline" className={notion.status==='recent_success' ? 'h-auto max-w-full whitespace-normal border-primary/30 text-primary' :
    notion.status==='needs_work' ? 'h-auto max-w-full whitespace-normal border-ring/30' : 'h-auto max-w-full whitespace-normal'}>
    {statusLabels[notion.status]}
   </Badge>
   <p className="m-0 text-sm leading-relaxed text-muted-foreground">{notion.reason}</p>
   <p className="m-0 text-xs text-muted-foreground">{notion.lastEvidenceDate ? 'Dernière preuve · ' : 'Dernière activité · '}
    <DateLabel date={notion.lastEvidenceDate ?? notion.lastActivity.date}/></p>
  </div>
  {notion.evidence.length>0 ? <ul aria-label="Preuves indépendantes" role="list" className="m-0 grid list-none gap-2 border-t border-border p-0 pt-3">
   {notion.evidence.map(e=><li className="min-w-0 text-sm" key={e.attemptId}>
    <ActivityLink entry={e}>{e.content}</ActivityLink>
    <div className="text-xs text-muted-foreground">
     {e.fact==='error'?'Point à retravailler':'Réussite'} · {e.source==='written'?'Production corrigée':'Exercice ciblé'} · {e.context==='session'?'Séance':'Entraînement libre'} · <DateLabel date={e.date}/>
    </div>
   </li>)}
  </ul> : !notion.assisted.latest && !notion.selfAssessments.latest &&
   <div className="border-t border-border pt-3 text-sm"><ActivityLink entry={notion.lastActivity}>Voir la dernière activité</ActivityLink></div>}
  {(notion.assisted.latest || notion.selfAssessments.latest) && <ul role="list" aria-label="Activités avec aide et auto-évaluations" className="m-0 grid gap-2 border-t border-border p-0 pt-3 text-sm">
   {notion.assisted.latest && <li><span className="text-muted-foreground">Avec aide · {notion.assisted.count} · </span>
    <ActivityLink entry={notion.assisted.latest}>Voir le dernier essai avec aide</ActivityLink></li>}
   {notion.selfAssessments.latest && <li><span className="text-muted-foreground">Auto-évaluation · {notion.selfAssessments.count} · </span>
    <ActivityLink entry={notion.selfAssessments.latest}>Voir la dernière auto-évaluation</ActivityLink></li>}
  </ul>}
 </Card>;
}

export function NotionProgress() {
 const [report,setReport]=useState<StudentNotionProgress|null>(null);
 const [error,setError]=useState(false);
 const [loading,setLoading]=useState(true);
 const request=useRef<AbortController|null>(null);
 const load=useCallback(async(offset=0)=>{
  request.current?.abort();
  const controller=new AbortController();
  request.current=controller;
  setLoading(true);
  setError(false);
  try {
   const response=await fetch('/api/notion-progress?offset='+offset,{cache:'no-store',signal:controller.signal});
   if (!response.ok) throw new Error();
   const next:StudentNotionProgress=await response.json();
   if (controller.signal.aborted) return;
   setReport(previous=>offset && previous ? {...next,notions:[
    ...previous.notions,...next.notions.filter(n=>!previous.notions.some(p=>p.notionId===n.notionId)),
   ]} : next);
  } catch { if (!controller.signal.aborted) setError(true); }
  finally { if (!controller.signal.aborted) setLoading(false); }
 },[]);

 useEffect(()=>{
  const timer=window.setTimeout(()=>void load(),0);
  return ()=>{window.clearTimeout(timer);request.current?.abort();};
 },[load]);

 return <>
  <h1 className="mb-4">Mon niveau</h1>
  <div className="mb-7 flex flex-wrap gap-2">
   <Button asChild variant="outline"><Link href="/mon-niveau/bilans">Bilans</Link></Button>
   <Button asChild variant="outline"><Link href="/mon-niveau/corrections">Voir mes corrections</Link></Button>
   <Button asChild variant="outline"><Link href="/mon-niveau/carnet">Ouvrir le carnet d’erreurs</Link></Button>
  </div>
  <section aria-labelledby="notion-progress-title">
   <h2 id="notion-progress-title" className="mb-2">Notions travaillées</h2>
   <p className="mb-5 max-w-xl text-sm leading-relaxed text-muted-foreground">Retrouvez les réussites et les difficultés observées dans vos séances et votre entraînement.</p>
   {loading && !report && <p role="status" className="text-sm text-muted-foreground">Chargement du bilan…</p>}
   {error && <div className="mb-4 flex flex-wrap items-center gap-3">
    <p role="alert" className="m-0 text-sm text-destructive">Votre bilan est momentanément indisponible.</p>
    <Button type="button" variant="outline" onClick={()=>void load(report?.nextOffset ?? 0)}>Réessayer</Button>
   </div>}
   {report && !report.notions.length && <Card className="border-dashed p-5 text-sm text-muted-foreground shadow-none">
    <p className="m-0">Les notions apparaissent ici au fil des exercices et des corrections.</p>
    <Button asChild variant="outline" className="w-fit"><Link href="/entrainement">S’entraîner<ArrowRight aria-hidden="true"/></Link></Button>
   </Card>}
   <ul role="list" className="m-0 grid gap-4 p-0 xl:grid-cols-2">
    {report?.notions.map(n=><li className="min-w-0" key={n.notionId}><NotionCard notion={n}/></li>)}
   </ul>
   {report?.nextOffset!=null && !error && <Button type="button" className="mt-4" variant="outline" disabled={loading}
    onClick={()=>void load(report.nextOffset!)}>{loading?'Chargement…':'Afficher d’autres notions'}</Button>}
  </section>
  <AssessmentComparisonsPanel/>
 </>;
}
