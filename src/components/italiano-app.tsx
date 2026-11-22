'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Dumbbell, Headphones, Layers, Leaf, Upload, Volume2 } from 'lucide-react';
import { Today } from '@/components/today';
import { NotionProgress } from '@/components/notion-progress';
import { AttemptDetail } from '@/components/attempt-detail';
import { CorrectionDetail } from '@/components/correction-detail';
import { Button } from '@/components/ui/button';
import { Card as Panel } from '@/components/ui/card';
import { demo } from '@/lib/demo';
import Link from 'next/link';
import { Lessons } from '@/components/lessons';
import { Sessions } from '@/components/sessions';
import { ErrorJournal } from '@/components/error-journal';
import { Practice } from '@/components/practice';
import { dueCards, emptyData, mergeImported, normalize, parseMarkdown, readData, type Card, type Data, type Rating } from '@/lib/study';

type Page = 'today' | 'review' | 'vocabulary' | 'difficulties' | 'sources' | 'corrections' | 'practice' | 'errors' | 'lessons' | 'level' | 'correction' | 'session' | 'attempt';
type Mode = 'due' | 'all' | 'difficult';
const primaryNav = [
 {id:'today',label:'Aujourd’hui',href:'/',icon:CalendarDays},
 {id:'lessons',label:'Mes leçons',href:'/lecons',icon:BookOpen},
 {id:'practice',label:'S’entraîner',href:'/entrainement',icon:Dumbbell},
 {id:'level',label:'Mon niveau',href:'/mon-niveau',icon:Leaf},
] as const;
const secondaryNav = [
 {id:'review',label:'Réviser',href:'/entrainement/reviser',icon:Layers},
 {id:'vocabulary',label:'Vocabulaire',href:'/entrainement/vocabulaire',icon:BookOpen},
 {id:'difficulties',label:'Mes difficultés',href:'/entrainement/difficultes',icon:Leaf},
 {id:'sources',label:'Sources / Obsidian',href:'/entrainement/sources',icon:Upload},
 {id:'errors',label:'Carnet d’erreurs',href:'/mon-niveau/carnet',icon:BookOpen},
 {id:'corrections',label:'Corrections',href:'/mon-niveau/corrections',icon:BookOpen},
] as const;
const navigationStyle = 'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm whitespace-nowrap text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-primary';
const ratings: { id: Rating; label: string; interval: string }[] = [{id:'again',label:'À revoir',interval:'10 min'}, {id:'hard',label:'Difficile',interval:'1 jour'}, {id:'good',label:'Bien',interval:'3 jours'}, {id:'easy',label:'Facile',interval:'7 jours'}];
export function ItalianoApp({initialPage:page='today',lessonId,sessionId,occurrenceId,attemptId,reviewMode,suggestedPractice}:{
 initialPage?:Page;lessonId?:string;sessionId?:string;occurrenceId?:string;attemptId?:string;reviewMode?:Mode;suggestedPractice?:boolean;
}) {
  const [data,setData] = useState<Data>(emptyData); const [ready,setReady] = useState(false); const [storageError,setStorageError] = useState(false);
  const [mode,setMode] = useState<Mode>(reviewMode ?? 'due'); const [session,setSession] = useState<string[] | null>(null); const [index,setIndex] = useState(0); const [revealed,setRevealed] = useState(false); const lock = useRef(false);
  const [query,setQuery] = useState(''); const [theme,setTheme] = useState('Tous'); const [message,setMessage] = useState(''); const [audioMessage,setAudioMessage] = useState('');
  const needsVocabulary = page==='review' || page==='vocabulary' || page==='difficulties' || page==='sources';
  useEffect(() => {
    if (!needsVocabulary) return;
    const controller=new AbortController();
    fetch('/api/vocabulary',{signal:controller.signal}).then(r=>{
      if (!r.ok) throw new Error();
      return r.json();
    }).then(v=>{
      if (controller.signal.aborted) return;
      const next:Data = {imported:v.cards.filter((c: Card) => !demo.some(d => d.id === c.id)), reviews:v.reviews};
      setData(next);
      if (reviewMode) {
        const all = [...demo,...next.imported];
        const selection = reviewMode==='difficult' ? all.filter(c=>['again','hard'].includes(next.reviews[c.id]?.rating)) : dueCards(all,next.reviews);
        setSession(selection.map(c=>c.id));
      }
    }).catch(()=>{if (!controller.signal.aborted) setStorageError(true);})
      .finally(()=>{if (!controller.signal.aborted) setReady(true);});
    return ()=>controller.abort();
  },[needsVocabulary,reviewMode]);
  const cards = useMemo(() => [...demo,...data.imported], [data.imported]);
  const due = dueCards(cards,data.reviews); const difficult = cards.filter(c => ['again','hard'].includes(data.reviews[c.id]?.rating));
  const current = session ? cards.find(c => c.id === session[index]) : undefined;
  const start = (nextMode: Mode) => { const selection = nextMode === 'due' ? due : nextMode === 'difficult' ? difficult : cards; setMode(nextMode); setSession(selection.map(c => c.id)); setIndex(0); setRevealed(false); lock.current = false; };
  const revealCard = () => { if (!current || lock.current) return; lock.current=true; void fetch('/api/vocabulary-reveal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cardId:current.id})}).then(r=>{if(!r.ok)throw new Error();setRevealed(true);}).catch(()=>setStorageError(true)).finally(()=>{lock.current=false;}); };
  const grade = (rating: Rating) => { if (!current || !revealed || lock.current) return; lock.current = true; void fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cardId:current.id,rating})}).then(r=>{if(!r.ok) throw new Error(); return r.json();}).then(review=>setData(d=>({...d,reviews:{...d.reviews,[current.id]:review}}))).catch(()=>setStorageError(true)); setRevealed(false); setIndex(i => i+1); };
  useEffect(() => { lock.current = false; }, [index,session]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { const target = event.target as HTMLElement; if (page !== 'review' || !current || /INPUT|TEXTAREA|SELECT|BUTTON/.test(target.tagName) || target.isContentEditable || event.repeat) return; if (event.code === 'Space' && !revealed) { event.preventDefault(); revealCard(); } else if (revealed && /^[1-4]$/.test(event.key)) grade(ratings[Number(event.key)-1].id); }; window.addEventListener('keydown',handler); return () => window.removeEventListener('keydown',handler); });
  const visible = cards.filter(c => (theme === 'Tous' || c.theme === theme) && normalize(`${c.italian} ${c.french}`).includes(normalize(query)));
  const speak = (c: Card) => { if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) { setAudioMessage('Lecture vocale indisponible dans ce navigateur.'); return; } const voice = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('it')); if (!voice) { setAudioMessage('Aucune voix italienne disponible sur cet appareil.'); return; } const utterance = new SpeechSynthesisUtterance(c.italian); utterance.lang='it-IT'; utterance.voice=voice; utterance.onerror=() => setAudioMessage('La lecture vocale a échoué.'); speechSynthesis.cancel(); speechSynthesis.speak(utterance); setAudioMessage(''); };
  const importFile = async (file?: File) => { if (!file) return; try { if (!file.name.toLowerCase().endsWith('.md')) throw new Error('Choisissez un fichier .md.'); const incoming = parseMarkdown(await file.text(),file.name); const added = mergeImported(cards,incoming); const response=await fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imported:added,reviews:{}})}); if(!response.ok) throw new Error('Import impossible.'); setData(d => ({...d,imported:[...d.imported,...added]})); setMessage(`${added.length} expression(s) importée(s), ${incoming.length-added.length} doublon(s) ignoré(s).`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Import impossible.'); } };
  const activePage = page==='level' || page==='errors' || page==='corrections' || page==='correction' || page==='attempt' ? 'level' :
    page==='session' || page==='today' ? 'today' : page==='lessons' ? 'lessons' : 'practice';
  return <div className="shell">
   <aside className="sidebar">
    <div className="brand"><span className="brand-mark">il.</span><span>Italiano <strong>Lab</strong></span></div>
    <nav aria-label="Navigation principale" className="flex-wrap">{primaryNav.map(({id,label,href,icon:Icon})=>
     <Link key={id} href={href} aria-current={activePage===id?'page':undefined} className={navigationStyle}><Icon size={18} aria-hidden="true"/>{label}</Link>)}</nav>
    <nav aria-label="Autres espaces" className="mt-4 flex-wrap border-t border-border pt-3">{secondaryNav.map(({id,label,href,icon:Icon})=>
     <Link key={id} href={href} aria-current={page===id?'page':undefined} className={navigationStyle}><Icon size={16} aria-hidden="true"/>{label}</Link>)}</nav>
   </aside>
   <main className="main">
    {needsVocabulary && !ready ? <p role="status">Chargement de votre vocabulaire…</p> : <>
    {storageError && <div className="notice" role="alert">Base locale indisponible. Vérifiez le serveur avant de continuer.</div>}
    {page==='today' && <Today/>}
    {page==='lessons' && <Lessons lessonId={lessonId}/>}
    {page==='practice' && <Practice key={suggestedPractice ? 'suggested' : 'standard'} suggested={suggestedPractice}/>}
    {page==='level' && <NotionProgress/>}
    {page==='attempt' && attemptId && <AttemptDetail key={attemptId} attemptId={attemptId}/>}
    {page==='errors' && <ErrorJournal/>}
    {page==='corrections' && <><h1 className="mb-2">Mes corrections</h1><Sessions corrections/></>}
    {page==='correction' && attemptId && <CorrectionDetail key={attemptId} attemptId={attemptId}/>}
    {page==='session' && sessionId && <Sessions key={sessionId} sessionId={sessionId} occurrenceId={occurrenceId}/>}
  {page === 'review' && <><div className="eyebrow">UN MOT APRÈS L’AUTRE</div><h1>Réviser</h1><p className="intro">Une petite séance pour ancrer les expressions qui comptent.</p><div className="mode-row"><Button variant={mode==='due'?'default':'outline'} onClick={() => start('due')}>Cartes dues ({due.length})</Button><Button variant={mode==='all'?'default':'outline'} onClick={() => start('all')}>Tout entraîner</Button>{mode === 'difficult' && <Button variant="outline" onClick={() => start('difficult')}>Mes difficultés ({difficult.length})</Button>}</div>{session === null ? <Panel className="review-card"><h2>Prêt pour une séance ?</h2><p>Choisissez les cartes dues ou entraînez-vous sur tout votre vocabulaire.</p><Button onClick={() => start('due')}>Commencer <ArrowRight size={16}/></Button></Panel> : current ? <Panel className="review-card"><div className="review-top"><span>FRANÇAIS → ITALIEN</span><span>{index+1} / {session.length}</span></div><div className="progress"><span style={{width:`${index/session.length*100}%`}}/></div><p className="prompt">Comment dit-on en italien ?</p><h2 className="flashword">{current.french}</h2>{!revealed ? <><Button onClick={revealCard}>Révéler la réponse</Button><p className="hint">ou appuyez sur espace</p></> : <div className="answer" aria-live="polite"><strong>{current.italian}</strong><p>{current.example}<br/><span>{current.translation}</span></p><div className="rating-grid">{ratings.map((r,i) => <Button key={r.id} variant="outline" onClick={() => grade(r.id)}><span>{r.label}<small>{i+1} · {r.interval}</small></span></Button>)}</div><p className="hint">Évaluez avec les touches 1 à 4</p></div>}</Panel> : <Panel className="review-card"><div className="eyebrow">BRAVO</div><h2>{session.length ? 'Séance terminée !' : 'Aucune carte dans cette séance'}</h2><p>{session.length ? `${session.length} carte(s) travaillée(s). À bientôt pour la suite !` : mode === 'due' ? 'Tout est à jour. Vous pouvez aussi vous entraîner sur toutes les cartes.' : 'Il n’y a aucune carte à entraîner ici pour le moment.'}</p><Button onClick={() => start('all')}>Entraîner toutes les cartes</Button></Panel>}<p className="algorithm">Intervalles fixes de ce prototype, sans algorithme FSRS : À revoir 10 minutes · Difficile 1 jour · Bien 3 jours · Facile 7 jours.</p></>}
  {page === 'vocabulary' && <><div className="eyebrow">IL TUO VOCABOLARIO</div><h1>Les mots du quotidien.</h1><p className="intro">Explorez vos expressions et retrouvez celles dont vous avez besoin.</p><div className="filters"><label>Rechercher<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Un mot en français ou en italien"/></label><label>Thème<select value={theme} onChange={e => setTheme(e.target.value)}><option>Tous</option>{[...new Set(cards.map(c => c.theme))].sort().map(t => <option key={t}>{t}</option>)}</select></label></div><p className="result-count">{visible.length} expression(s)</p>{audioMessage && <p role="status" className="notice">{audioMessage}</p>}<div className="vocab-list">{visible.map(c => <Panel key={c.id} className="vocab-card"><div><span className="tag">{c.theme}</span><h2>{c.italian}</h2><p>{c.french}</p><blockquote>{c.example}<br/><span>{c.translation}</span></blockquote><small>{c.source}</small></div><button className="audio" onClick={() => speak(c)} aria-label={`Écouter ${c.italian}`}><Volume2 size={19}/></button></Panel>)}</div>{!visible.length && <p>Aucune expression ne correspond à votre recherche.</p>}<p className="algorithm"><Headphones size={16}/> La lecture utilise une voix italienne de votre appareil, si disponible.</p></>}
  {page === 'difficulties' && <><div className="eyebrow">ON PREND SON TEMPS</div><h1>Mes difficultés.</h1><p className="intro">Les cartes que vous avez évaluées « À revoir » ou « Difficile » se retrouvent ici. Ce n’est pas un diagnostic de grammaire.</p>{difficult.length ? <><Button asChild><Link href="/entrainement/reviser?mode=difficile">Entraîner ces {difficult.length} carte(s) <ArrowRight size={16}/></Link></Button><div className="simple-list">{difficult.map(c => <div key={c.id}><strong>{c.italian}</strong><span>{c.french}</span></div>)}</div></> : <Panel className="empty"><Leaf size={25}/><h2>Rien à revoir pour le moment.</h2><p>Après une révision, les expressions difficiles apparaîtront ici.</p><Button asChild variant="outline"><Link href="/entrainement/reviser?mode=dues">Réviser mes cartes</Link></Button></Panel>}</>}
  {page === 'sources' && <><div className="eyebrow">VOS CONTENUS</div><h1>Sources & Obsidian.</h1><p className="intro">Retrouvez vos propres mots à côté des expressions de démonstration.</p><Panel className="source-panel"><h2>Démonstration — aucun vault connecté</h2><Button variant="outline" onClick={() => { void (async()=>{try {const raw=localStorage.getItem('italiano-lab:v1'); if(!raw) throw new Error('Aucune progression V1 trouvée.'); const parsed=JSON.parse(raw); const checked=readData(raw); if(JSON.stringify(parsed.imported)!==JSON.stringify(checked.imported) || JSON.stringify(parsed.reviews)!==JSON.stringify(checked.reviews)) throw new Error('Progression V1 invalide.'); const r=await fetch('/api/migration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(checked)}); if(!r.ok) throw new Error('Migration impossible.'); const v=await (await fetch('/api/vocabulary')).json(); setData({imported:v.cards.filter((c: Card)=>!demo.some(d=>d.id===c.id)),reviews:v.reviews}); setMessage('Ancienne progression importée.');}catch(e){setMessage(e instanceof Error?e.message:'Migration impossible.');}})(); }}>Importer mon ancienne progression</Button><p>Aucune synchronisation Obsidian ni correction par intelligence artificielle. Importez manuellement un fichier Markdown depuis votre appareil ; son contenu est enregistré dans la base locale.</p><a href="/examples/cours-exemple.md" download className="text-link">Télécharger le fichier exemple <ArrowRight size={16}/></a><label className="file-label">Importer un fichier .md<input type="file" accept=".md,text/markdown" onChange={e => { void importFile(e.target.files?.[0]); e.currentTarget.value=''; }}/></label>{message && <p role="status" className="notice">{message}</p>}</Panel><div className="format"><h2>Le format attendu</h2><p>Un frontmatter YAML de cours est facultatif. Chaque expression possède une section et quatre champs obligatoires :</p><pre>{`## Un chilo di pomodori\n- Français: Un kilo de tomates\n- Exemple: Vorrei un chilo di pomodori.\n- Traduction: Je voudrais un kilo de tomates.\n- Thème: Quotidien`}</pre><p>Les doublons italiens sont ignorés et la progression existante est conservée. Le nom du fichier devient la source.</p></div></>}
    </>}
  <footer>ITALIANO LAB <span>·</span> FATTO CON CALMA</footer></main></div>;
}
