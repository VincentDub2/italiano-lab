'use client';
import { useEffect, useState } from 'react';
import { Practice } from './practice';
import { SentenceFeedback } from './sentence-exercise';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { stateLabels, type RevisionState } from '@/lib/revision';
import type { Attempt } from '@/lib/exercises';

type Entry = { id:string; item_id:string; content:string; objective:string | null; notions:{id:string;name:string}[]; revision:RevisionState; lastError:string; history:(Attempt & {answerLabel?:string})[] };
const date = (value:string) => new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Rome',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
export function ErrorJournal() {
 const [entries,setEntries] = useState<Entry[]>([]);
 const [importedAt,setImportedAt] = useState('');
 const [notion,setNotion] = useState('');
 const [state,setState] = useState('active');
 const [day,setDay] = useState('');
 const [error,setError] = useState('');
 const [loading,setLoading] = useState(true);
 const [retry,setRetry] = useState(0);
 const [selected,setSelected] = useState<string[] | null>(null);
 useEffect(() => {
  let cancelled = false;
  const params = new URLSearchParams();
  if (notion.trim()) params.set('notion',notion.trim());
  if (state !== 'active' && state !== 'all') params.set('state',state);
  if (state === 'active') params.set('view','active');
  if (day) params.set('date',day);
  fetch('/api/errors?'+params,{cache:'no-store'}).then(async response => {if (!response.ok) throw new Error(); return response.json();}).then(data => {if (!cancelled) {setEntries(data.items);setImportedAt(data.importedAt || '');setError('');}}).catch(() => {if (!cancelled) setError('Impossible de charger le carnet.');}).finally(() => {if (!cancelled) setLoading(false);});
  return () => {cancelled=true;};
 },[notion,state,day,retry]);
 if (selected) return <><Button variant="ghost" className="mb-5" onClick={() => {setSelected(null);setRetry(n => n+1);}}>Retour au carnet</Button><Practice itemIds={selected}/></>;
 return <section className="max-w-5xl" aria-label="Carnet d’erreurs"><div className="eyebrow">RETROUVER, COMPRENDRE, CONSOLIDER</div><h1>Carnet d’erreurs</h1><p className="intro">Chaque item garde vos réponses, ses corrections et sa prochaine révision. Les erreurs consolidées restent dans l’historique.</p>
  <div className="mb-5 grid gap-4 sm:grid-cols-3">
   <label className="grid gap-1 text-sm">Notion<input className="rounded-md border border-border bg-background p-2" value={notion} onChange={e => setNotion(e.target.value)} placeholder="Nom de la notion"/></label>
   <label className="grid gap-1 text-sm">Date de l’erreur<input className="rounded-md border border-border bg-background p-2" type="date" value={day} onChange={e => setDay(e.target.value)}/></label>
   <label className="grid gap-1 text-sm">État<select className="rounded-md border border-border bg-background p-2" value={state} onChange={e => setState(e.target.value)}><option value="active">À suivre</option><option value="all">Tout l’historique</option>{Object.entries(stateLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
  </div>
  {error && <p role="alert" className="mb-4 text-destructive">{error} <Button variant="outline" onClick={() => setRetry(n => n+1)}>Réessayer</Button></p>}
  {loading ? <p role="status">Chargement du carnet…</p> : <>
   {importedAt && entries.some(item => item.history.some(a => a.assisted === null)) && <p className="mb-4 text-sm text-muted-foreground">Suivi de l’ancien historique initialisé le {date(importedAt)}. Les aides non enregistrées restent inconnues ; les anciennes réussites ne créent pas automatiquement de consolidation.</p>}
   <div className="mb-5 flex flex-wrap items-center gap-3"><Button disabled={!entries.length} onClick={() => setSelected(entries.slice(0,100).map(x => x.item_id))}>Réviser les items affichés</Button><span className="text-sm text-muted-foreground">{entries.length} item(s)</span></div>
   {entries.length > 0 && <p className="mb-5 text-sm leading-relaxed text-muted-foreground">Les corrigés sont affichés ici. Un essai réalisé aujourd’hui après leur consultation sert à s’entraîner ; la consolidation sera vérifiée lors d’une prochaine échéance sans aide.</p>}
   {!entries.length && !error && <Card className="border-dashed border-border p-6 shadow-none">Aucune erreur pour ces filtres. Retrouvez les items consolidés dans « Tout l’historique ».</Card>}
   <div className="grid gap-4">{entries.map(item => <Card key={item.item_id} className="gap-3 border-border p-5 shadow-none"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{stateLabels[item.revision.state]}</Badge>{item.revision.pending && <Badge variant="outline">En attente de correction</Badge>}<span className="text-xs text-muted-foreground">{item.notions.map(n => n.name).join(', ') || item.objective || 'Notion à renseigner'}</span></div><h2 lang="it" className="mb-0 break-words text-xl">{item.content}</h2><p className="text-xs text-muted-foreground">Dernière erreur : {date(item.lastError)}{item.revision.due ? ` · Prochaine révision : ${item.revision.due}` : ''}</p><details open><summary className="cursor-pointer text-sm font-medium">Historique des tentatives ({item.history.length})</summary><ol className="mt-3 grid gap-3">{item.history.map(a => <li key={a.id} className="rounded-lg bg-accent/50 p-3 text-sm"><p className="mb-1 text-xs text-muted-foreground">{a.submitted_at && date(a.submitted_at)} · {a.context === 'practice' ? 'Entraînement libre' : a.title || 'Séance professeur'} · {a.assisted === null ? 'Aide inconnue (ancien historique)' : a.assisted ? 'Après aide ou correction' : 'Sans aide enregistrée'}</p><p className="text-xs text-muted-foreground">{a.instruction}</p><p lang="it" className="break-words">{a.content}</p>{a.question?.choices && <ul className="my-1 list-inside list-disc text-muted-foreground">{a.question.choices.map(c => <li key={c.value} lang="it">{c.label}</li>)}</ul>}{a.question?.sentence ? <SentenceFeedback attempt={a}/> : <><p>Votre réponse : <span lang="it" className="whitespace-pre-wrap break-words">{a.answerLabel || a.answer}</span></p><p>{a.neutralized ? 'Verdict neutralisé' : a.status === 'pending_teacher' ? 'En attente de correction' : a.is_correct === 1 ? 'Correct' : a.is_correct === 0 ? 'À revoir' : a.status === 'self_assessed' ? 'Auto-évaluation' : 'Partiellement correct'}</p>{a.feedback && <><p>Correction : <span lang="it">{a.feedback.correction || a.feedback.accepted?.join(', ')}</span></p><p>{a.feedback.explanation}</p></>}{a.rectifications?.map((r,i) => <p key={i}>Rectification : {r.correction} — {r.explanation}</p>)}</>}</li>)}</ol></details></Card>)}</div>
  </>}
 </section>;
}
