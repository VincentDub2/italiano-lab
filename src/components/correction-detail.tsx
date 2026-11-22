'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import type { StudentCorrection } from '@/server/student-corrections';
import type { Attempt } from '@/lib/exercises';
import { SentenceFeedback } from './sentence-exercise';
import { AttemptRectifications } from './attempt-rectifications';
import { Button } from './ui/button';
import { Card } from './ui/card';

export function WrittenCorrection({attempt}:{attempt:Attempt}) {
 if (attempt.question?.sentence) return <SentenceFeedback attempt={attempt}/>;
 return <>
  <div>
   <p className="m-0 text-sm font-medium">Votre réponse</p>
   <p lang="it" className="m-0 whitespace-pre-wrap wrap-anywhere">{attempt.answer}</p>
  </div>
  {attempt.status==='pending_teacher' ? <p role="status">En attente du professeur.</p> : <>
   <div className="rounded-lg bg-accent/60 p-4">
    <p className="m-0 font-semibold">{attempt.neutralized ? 'Verdict neutralisé' :
     ({correct:'Correct',partial:'Partiellement correct',incorrect:'À retravailler'}[attempt.feedback?.result ?? ''] ?? 'Retour du professeur')}</p>
    {attempt.feedback?.correction && <p lang="it" className="m-0 whitespace-pre-wrap wrap-anywhere">{attempt.feedback.correction}</p>}
    {attempt.feedback?.explanation && <p className="m-0 whitespace-pre-wrap wrap-anywhere">{attempt.feedback.explanation}</p>}
   </div>
   <AttemptRectifications attempt={attempt}/>
   {attempt.feedback?.retry && <p className="m-0 text-sm text-muted-foreground">Vous pouvez réessayer dans la séance.</p>}
  </>}
 </>;
}

export function CorrectionDetail({attemptId}:{attemptId:string}) {
 const [detail,setDetail] = useState<StudentCorrection | null>(null);
 const [error,setError] = useState('');
 const [busy,setBusy] = useState(false);
 const lock = useRef(false);
 const load = useCallback(async(signal?:AbortSignal)=>{
  try {
   const response = await fetch('/api/correction?id='+encodeURIComponent(attemptId),{cache:'no-store',signal});
   if (!response.ok) throw new Error();
   const result:StudentCorrection=await response.json();
   if (!signal?.aborted) {setDetail(result);setError('');}
  } catch { if (!signal?.aborted) setError('Correction indisponible. Réessayez.'); }
 },[attemptId]);
 useEffect(()=>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>void load(controller.signal),0);
  return ()=>{window.clearTimeout(timer);controller.abort();};
 },[load]);

 async function acknowledge(current:StudentCorrection) {
  if (lock.current) return;
  lock.current=true;
  setBusy(true);
  try {
   const response=await fetch('/api/correction-read',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({attemptId,version:current.version})});
   if (response.ok) setDetail({...current,read:true});
   else {
    await load();
    setError('Le retour a peut-être changé. Vérifiez la version affichée.');
   }
  } catch {setError('Impossible d’enregistrer la lecture. Réessayez.');}
  finally {lock.current=false;setBusy(false);}
 }
 return <>
  <Button asChild variant="ghost" className="mb-4"><Link href="/mon-niveau/corrections"><ArrowLeft aria-hidden="true"/>Toutes les corrections</Link></Button>
  <h1 className="mb-5">Correction</h1>
  {!detail && !error && <p role="status">Chargement du retour…</p>}
  {error && <div className="mb-4 grid justify-items-start gap-2">
   <p className="m-0 text-sm text-destructive" role="alert">{error}</p>
   {!detail && <Button type="button" variant="outline" onClick={()=>void load()}>Réessayer</Button>}
  </div>}
  {detail && <Card className="gap-4 p-5 shadow-none sm:p-6">
   <h2 className="m-0 text-xl wrap-anywhere">{detail.attempt.title || 'Entraînement libre'}</h2>
   <p className="m-0 whitespace-pre-wrap wrap-anywhere">{detail.attempt.question.content}</p>
   <WrittenCorrection attempt={detail.attempt}/>
   <div className="flex flex-wrap items-center gap-2">
    {detail.read ? <p role="status" className="m-0 flex items-center gap-2 text-sm text-primary"><Check className="size-4" aria-hidden="true"/>Correction lue</p>
     : <Button type="button" disabled={busy} onClick={()=>void acknowledge(detail)}>Marquer comme lue</Button>}
    <Button asChild variant="outline"><Link href="/">Retour à Aujourd’hui</Link></Button>
   </div>
  </Card>}
 </>;
}
