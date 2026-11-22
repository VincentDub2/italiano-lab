'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { StudentAttempt } from '@/server/student-corrections';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

const ratings:Record<string,string>={again:'À revoir',hard:'Difficile',good:'Je savais',easy:'Facile'};

export function AttemptDetail({attemptId}:{attemptId:string}) {
 const [attempt,setAttempt]=useState<StudentAttempt|null>(null);
 const [error,setError]=useState(false);
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/attempt-detail?id='+encodeURIComponent(attemptId),{cache:'no-store',signal:controller.signal})
   .then(response=>{if (!response.ok) throw new Error();return response.json();})
   .then(value=>{if (!controller.signal.aborted) {setAttempt(value);setError(false);}})
   .catch(()=>{if (!controller.signal.aborted) setError(true);});
  return ()=>controller.abort();
 },[attemptId,reload]);
 const verdict=attempt?.neutralized ? 'Verdict neutralisé' :
  attempt?.status==='pending_teacher' ? 'En attente de correction' : attempt?.status==='self_assessed' ? 'Auto-évaluation' :
  attempt?.isCorrect===true ? 'Réponse correcte' : 'À retravailler';

 return <>
  <Button asChild variant="ghost" className="mb-4"><Link href="/mon-niveau">Retour à Mon niveau</Link></Button>
  <h1 className="mb-5">Tentative</h1>
  {!attempt && !error && <p role="status">Chargement de la tentative…</p>}
  {error && <div className="flex items-center gap-3">
   <p role="alert">Tentative indisponible.</p>
   <Button variant="outline" onClick={()=>setReload(value=>value+1)}>Réessayer</Button>
  </div>}
  {attempt && <Card className="gap-3 p-5 shadow-none sm:p-6">
   <h2 className="m-0 text-xl wrap-anywhere">{attempt.title || 'Entraînement libre'}</h2>
   <p className="m-0 wrap-anywhere">{attempt.instruction}</p>
   <p className="m-0 font-medium whitespace-pre-wrap wrap-anywhere">{attempt.content}</p>
   <div className="flex flex-wrap items-center gap-2">
    <Badge variant="outline">{verdict}</Badge>
    {attempt.assisted && attempt.status!=='self_assessed' && <Badge variant="secondary">Avec aide</Badge>}
    <time className="text-sm text-muted-foreground" dateTime={attempt.date}>{new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeZone:'Europe/Rome'}).format(new Date(attempt.date+'T12:00:00Z'))}</time>
   </div>
   <div className="rounded-lg bg-accent/50 p-3">
    <p className="m-0 text-sm text-muted-foreground">Votre réponse</p>
    <p lang={attempt.status==='self_assessed'?undefined:'it'} className="m-0 whitespace-pre-wrap wrap-anywhere">
     {attempt.status==='self_assessed' ? ratings[attempt.answer] ?? attempt.answer : attempt.answer}
    </p>
   </div>
   {attempt.status==='corrected' && <Button asChild variant="outline" className="w-fit"><Link href={'/corrections/'+encodeURIComponent(attempt.id)}>Lire la correction</Link></Button>}
  </Card>}
 </>;
}
