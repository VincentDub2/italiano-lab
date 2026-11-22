'use client';
import { AttemptRectifications } from './attempt-rectifications';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, RefreshCw, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Exercise } from '@/components/sessions';

type CardAnswer={italian:string;example:string};
type Props={
  items:Exercise[];
  busy:boolean;
  onReveal:(item:Exercise)=>Promise<CardAnswer>;
  onSubmit:(item:Exercise,answer:string,mode?:'translation')=>Promise<boolean>;
  initialMode?:'memory'|'translation';
};

export function VocabularyCarousel({items,busy,onReveal,onSubmit,initialMode='memory'}:Props) {
  const [index,setIndex]=useState(0);
  const [mode,setMode]=useState<'memory'|'translation'>(initialMode);
  const [flipped,setFlipped]=useState(false);
  const [responses,setResponses]=useState<Record<string,CardAnswer>>({});
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [retrying,setRetrying]=useState<Record<string,boolean>>({});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const revealing=useRef(false);
  const touched=useRef(false);
  const frontRef=useRef<HTMLButtonElement>(null);
  const backRef=useRef<HTMLButtonElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const resultRef=useRef<HTMLDivElement>(null);
  const item=items[index];
  const retryKey=mode+':'+item.id;
  const result=!retrying[retryKey] && item.latestAttempt?.status===(mode==='memory'?'self_assessed':'auto_corrected') ? item.latestAttempt : null;
  const disabled=busy || loading;
  const hasResult=!!result;

  useEffect(()=>{
    if(!touched.current) return;
    const target=mode==='translation' ? hasResult ? resultRef.current : inputRef.current : flipped ? backRef.current : frontRef.current;
    target?.focus();
  },[index,mode,flipped,hasResult]);

  const move=(delta:number)=>{
    const next=Math.max(0,Math.min(items.length-1,index+delta));
    if(disabled || next===index) return;
    touched.current=true;
    setIndex(next);
    setFlipped(false);
    setError('');
  };
  const flip=async()=>{
    if(disabled || revealing.current) return;
    touched.current=true;
    if(responses[item.id]) {setFlipped(true);return;}
    revealing.current=true;
    setLoading(true);
    setError('');
    try {
      const answer=await onReveal(item);
      setResponses(current=>({...current,[item.id]:answer}));
      setFlipped(true);
    } catch {setError('Impossible de retourner la carte. Réessayez.');}
    finally {revealing.current=false;setLoading(false);}
  };
  const retry=()=>{
    touched.current=true;
    setRetrying(current=>({...current,[retryKey]:true}));
    setAnswers(current=>({...current,[item.id]:''}));
  };

  return <div className="vocabulary-carousel" role="region" aria-roledescription="carrousel" aria-label="Cartes de vocabulaire" onKeyDown={event=>{
    if(/INPUT|TEXTAREA/.test((event.target as HTMLElement).tagName)) return;
    if(event.key==='ArrowLeft' || event.key==='ArrowRight') {event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}
  }}>
    <div className="carousel-modes" role="group" aria-label="Mode de pratique">
      <Button variant={mode==='memory'?'default':'outline'} aria-pressed={mode==='memory'} disabled={disabled} onClick={()=>{touched.current=true;setMode('memory');setFlipped(false);}}>Mémoriser</Button>
      <Button variant={mode==='translation'?'default':'outline'} aria-pressed={mode==='translation'} disabled={disabled} onClick={()=>{touched.current=true;setMode('translation');setFlipped(false);}}>Traduire</Button>
    </div>
    <p className="exercise-help">{mode==='memory'?'Retournez la carte, puis indiquez si vous connaissiez la réponse.':'Retrouvez la traduction en italien sans retourner la carte.'}</p>
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="carousel-slide" role="group" aria-roledescription="carte" aria-label={'Question '+(index+1)}>
      {mode==='memory' ? <div className="memory-card" data-flipped={flipped}>
        <div className="memory-card-inner">
          <Button ref={frontRef} variant="ghost" className="memory-face memory-front" inert={flipped} aria-hidden={flipped} aria-label="Révéler la réponse" disabled={disabled} onClick={()=>void flip()}>
            <span className="memory-caption">LE MOT À RETROUVER</span>
            <strong>{item.content}</strong>
            <span className="memory-caption"><RefreshCw size={15} aria-hidden="true"/>{loading?'Chargement…':'Cliquez pour retourner la carte'}</span>
          </Button>
          <div className="memory-face memory-back" inert={!flipped} aria-hidden={!flipped}>
            <Button ref={backRef} className="memory-return" variant="ghost" size="sm" disabled={disabled} onClick={()=>setFlipped(false)}><RotateCcw aria-hidden="true"/>Revoir le mot</Button>
            <span className="memory-caption">LA RÉPONSE EN ITALIEN</span>
            <strong lang="it">{responses[item.id]?.italian}</strong>
            <p lang="it">{responses[item.id]?.example}</p>
            {result ? <div className="memory-saved"><span role="status">Auto-évaluation enregistrée.</span><Button variant="outline" disabled={disabled} onClick={retry}>Nouvelle tentative</Button></div> : <div className="memory-check">
              <Button variant="outline" disabled={disabled} onClick={()=>void onSubmit(item,'again').then(saved=>{if(saved)setRetrying(current=>({...current,[retryKey]:false}));})}><X aria-hidden="true"/>À revoir</Button>
              <Button disabled={disabled} onClick={()=>void onSubmit(item,'good').then(saved=>{if(saved)setRetrying(current=>({...current,[retryKey]:false}));})}><Check aria-hidden="true"/>Je savais</Button>
            </div>}
          </div>
        </div>
      </div> : <>
        <div className="translation-word"><span className="memory-caption">À TRADUIRE EN ITALIEN</span><strong>{item.content}</strong></div>
        {result ? <div ref={resultRef} tabIndex={-1} className="exercise-feedback" data-correct={result.is_correct} role="status">
          <strong>{result.neutralized?'Verdict neutralisé.':result.is_correct?'Correct.':'À revoir.'}</strong>
          <p>Votre traduction : <span lang="it">{result.answer}</span></p>
          <p>{result.feedback?.articleOmitted?'Avec l’article':'Réponse attendue'} : <span lang="it">{result.feedback?.accepted?.join(', ')}</span></p>
          {result.feedback?.example && <p lang="it">{result.feedback.example}</p>}
          {result.feedback?.explanation && <p>{result.feedback.explanation}</p>}
          <AttemptRectifications attempt={result}/>
          <Button variant="outline" disabled={disabled} onClick={retry}>Nouvelle tentative</Button>
        </div> : <form className="translation-form" onSubmit={event=>{event.preventDefault();touched.current=true;if(!disabled && answers[item.id]?.trim())void onSubmit(item,answers[item.id],'translation').then(saved=>{if(saved)setRetrying(current=>({...current,[retryKey]:false}));});}}>
          <label htmlFor={'translation-'+item.id}>Votre traduction en italien</label>
          <input ref={inputRef} id={'translation-'+item.id} value={answers[item.id] ?? ''} onChange={event=>setAnswers(current=>({...current,[item.id]:event.target.value}))} autoComplete="off" spellCheck={false} placeholder="Écrivez la traduction…" disabled={disabled}/>
          <Button type="submit" disabled={disabled || !answers[item.id]?.trim()}>Vérifier ma traduction <Check aria-hidden="true"/></Button>
        </form>}
      </>}
    </div>
    <div className="carousel-navigation">
      <Button variant="outline" size="icon" aria-label="Carte précédente" disabled={disabled || index===0} onClick={()=>move(-1)}><ArrowLeft aria-hidden="true"/></Button>
      <span role="status" aria-live="polite">Carte {index+1} / {items.length}</span>
      <Button variant="outline" size="icon" aria-label="Carte suivante" disabled={disabled || index===items.length-1} onClick={()=>move(1)}><ArrowRight aria-hidden="true"/></Button>
    </div>
  </div>;
}
