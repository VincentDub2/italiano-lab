'use client';
import { useEffect, useRef, useState } from 'react';
import { StudyRunner } from './study-runner';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { stateLabels } from '@/lib/revision';
import type { Answer, Exercise, SentenceDraft } from '@/lib/exercises';

type Question = Exercise & { objective:string | null };
type Series = { id:string; questions:Question[] };
type StartRequest = { requestId:string; count:number; voluntary?:boolean; itemIds?:string[] };
type Overview = { workedSeconds:number; targetSeconds:number; remainingSeconds:number; dailyComplete:boolean; due:number };
type Bank = { questions:Question[]; overview:Overview; passages:number };
const activeKey = 'italiano-practice-active';
async function api<T>(action:string, body?:unknown):Promise<T> {
 const response = await fetch('/api/'+action,body === undefined ? {cache:'no-store'} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if (!response.ok) throw new Error('Opération impossible. Réessayez.');
 return response.json();
}
export function Practice({itemIds,suggested=false}:{itemIds?:string[];suggested?:boolean}) {
 const [bank,setBank] = useState<Bank | null>(null);
 const [series,setSeries] = useState<Series | null>(null);
 const [count,setCount] = useState(10);
 const [voluntary,setVoluntary] = useState(false);
 const [busy,setBusy] = useState(false);
 const [loading,setLoading] = useState(true);
 const [error,setError] = useState('');
 const lock = useRef(false);
 const starting = useRef<StartRequest | null>(null);
 const pending = useRef<Record<string,{requestId:string;answer:string;mode?:'translation'}>>({});
 useEffect(() => {
  let cancelled = false;
  async function load() {
   try {
    const data = await api<Bank>('practice-bank');
    if (cancelled) return;
    setBank(data);
    let saved:StartRequest | null = null;
    if (!itemIds) { try { saved = JSON.parse(sessionStorage.getItem(activeKey) || 'null'); } catch {} }
    if (itemIds) saved = {requestId:crypto.randomUUID(),count:itemIds.length,itemIds,voluntary:true};
    if (saved && (!suggested || !saved.voluntary && !saved.itemIds) && typeof saved.requestId === 'string' && Number.isInteger(saved.count)) {
     const resumed = await api<Series>('practice-start',saved);
     if (!cancelled) {setSeries(resumed);try {sessionStorage.setItem(activeKey,JSON.stringify(saved));} catch {}}
    }
   } catch { if (!cancelled) setError('Impossible de charger votre entraînement.'); }
   finally { if (!cancelled) setLoading(false); }
  }
  void load();
  return () => { cancelled = true; };
 },[itemIds,suggested]);
 const run = async (action:()=>Promise<void>) => {
  if (lock.current) return false;
  lock.current = true; setBusy(true); setError('');
  try { await action(); return true; }
  catch (error) {setError(error instanceof Error ? error.message : 'Enregistrement impossible.');return false;}
  finally {lock.current=false;setBusy(false);}
 };
 const start = () => run(async () => {
  const request = starting.current ??= {requestId:crypto.randomUUID(),count,voluntary,...(itemIds ? {itemIds,voluntary:true} : {})};
  const next = await api<Series>('practice-start',request);
  setSeries(next); starting.current=null;
  try {sessionStorage.setItem(activeKey,JSON.stringify(request));} catch {}
 });
 const submit = (item:Exercise,answer:string,mode?:'translation') => run(async () => {
  if (!series) return;
  const request = pending.current[item.id] ??= {requestId:crypto.randomUUID(),answer,...(mode ? {mode} : {})};
  if (request.answer !== answer || request.mode !== mode) throw new Error('Une réponse est en attente : renvoyez la même réponse.');
  const result = await api<{series:Series}>('practice-answer',{seriesId:series.id,questionId:item.id,...request});
  setSeries(result.series); delete pending.current[item.id];
  try {setBank(await api<Bank>('practice-bank'));} catch {setError('Réponse enregistrée ; le résumé sera actualisé à la prochaine ouverture.');}
 });
 const submitSentence = (item:Exercise,answer:Answer,draft:SentenceDraft) => run(async () => {
  if (!series) return;
  const result = await api<{series:Series}>('practice-answer',{seriesId:series.id,questionId:item.id,answer,...draft});
  setSeries(result.series);
  try {setBank(await api<Bank>('practice-bank'));} catch {setError('Réponse enregistrée ; le résumé sera actualisé à la prochaine ouverture.');}
 });
 const back = () => {setSeries(null);starting.current=null;try {sessionStorage.removeItem(activeKey);} catch {} void run(async () => setBank(await api<Bank>('practice-bank')));};
 return <section className="max-w-5xl" aria-label="Entraînement libre">
  <div className="eyebrow">À VOTRE RYTHME</div><h1>Entraînement libre</h1>
  <p className="intro">Retrouvez les items à leur échéance. Vos réponses et vos révisions sont communes aux séances du professeur.</p>
  {error && <p role="alert" className="mb-5 rounded-lg border border-destructive/30 p-4 text-destructive">{error}<Button variant="outline" className="ml-3" disabled={busy} onClick={() => void run(async () => setBank(await api<Bank>('practice-bank')))}>Réessayer</Button></p>}
  {loading ? <p role="status">Chargement de votre entraînement…</p> : series ? <>
   <div className="mb-5 flex flex-wrap justify-between gap-2">
    <Button variant="ghost" disabled={busy} onClick={back}>Retour à la banque</Button>
    <Button variant="outline" disabled={busy} onClick={() => void run(async () => setSeries(await api<Series>('practice-series?id='+encodeURIComponent(series.id))))}>Actualiser</Button>
   </div>
   <h2 className="mb-4">Votre série du moment</h2>
   <StudyRunner key={series.id} scopeId={series.id} items={series.questions} busy={busy}
    onSubmit={submit} onReveal={item => api('practice-reveal',{seriesId:series.id,questionId:item.id})}
    onSentenceSubmit={submitSentence} onHint={async (item,draft,level) => {
     const result = await api<{hints:string[]}>('practice-hint',{seriesId:series.id,questionId:item.id,...draft,level});
     return result.hints;
    }}/>
  </> : bank && <>
   <Card className="mb-6 gap-4 border-border p-5 shadow-none sm:p-6">
    <h2 className="mb-0">Votre prochaine série</h2>
    <p className="text-sm text-muted-foreground">{bank.overview.due} révision(s) due(s) · environ {Math.round(bank.overview.workedSeconds/60)} min travaillées aujourd’hui sur {bank.overview.targetSeconds/60} min suggérées.</p>
    {bank.overview.dailyComplete && <p role="status" className="rounded-lg bg-accent p-3 text-sm">Objectif quotidien déjà rempli. Vous pouvez continuer volontairement.</p>}
    <div className="flex flex-wrap gap-4">
     <label className="grid gap-1 text-sm">Nombre maximal d’items<select className="rounded-md border border-border bg-background p-2" value={count} disabled={busy} onChange={e => {setCount(Number(e.target.value));starting.current=null;}}>{[5,10,20,30].map(n => <option key={n} value={n}>{n} items</option>)}</select></label>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={voluntary} disabled={busy} onChange={e => {setVoluntary(e.target.checked);starting.current=null;}}/>Pratique volontaire, y compris avant échéance</label>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">La sélection respecte les échéances et le budget restant. Au plus cinq items encore à évaluer sont ajoutés à une série suggérée. Les répétitions anticipées ne font pas avancer la consolidation.</p>
    <Button className="self-start" disabled={busy || !bank.questions.length} onClick={() => void start()}>Commencer une série</Button>
    {!bank.questions.length && <p className="text-sm text-muted-foreground">Votre banque attend ses premiers exercices. Le professeur peut réutiliser les items publiés ou en créer.</p>}
   </Card>
   <section aria-label="Banque d’exercices"><h2>La banque d’exercices</h2><p className="mb-4 text-sm text-muted-foreground">{bank.questions.length} item(s) · {bank.passages} série(s) pratiquée(s). Les variantes ont chacune leur propre suivi.</p><div className="grid gap-3">{bank.questions.map(item => <Card key={item.id} className="gap-2 border-border p-4 shadow-none"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.instruction}</strong>{item.revision && <Badge variant="secondary">{stateLabels[item.revision.state]}</Badge>}</div><p lang="it" className="break-words">{item.content}</p><div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{item.notions?.map(n => n.name).join(', ') || item.objective || 'Notion à renseigner'}</span>{item.revision?.due && <span>Prochaine révision : {item.revision.due}</span>}{item.revision?.pending && <span>En attente de correction</span>}</div></Card>)}</div></section>
  </>}
 </section>;
}
