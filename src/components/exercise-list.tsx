'use client';
import { AttemptRectifications } from './attempt-rectifications';
import { useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import { QuestionnaireExercise } from '@/components/questionnaire-exercise';
import { VocabularyCarousel } from '@/components/vocabulary-carousel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import type { Exercise } from '@/lib/exercises';

type Props = { exercises: Exercise[]; busy: boolean; onSubmit: (exercise: Exercise, answer: string, mode?: 'translation') => Promise<boolean>; onReveal?: (exercise: Exercise) => Promise<{ italian: string; example: string }>; allowRetry?: boolean; headingLevel?: 3 | 4; initialMode?: 'memory' | 'translation' };
export function ExerciseList({ exercises, busy, onSubmit, onReveal, allowRetry = true, headingLevel = 4, initialMode }: Props) {
 const Title = headingLevel === 3 ? 'h3' : 'h4';
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [retrying,setRetrying]=useState<Record<string,boolean>>({});
 const groups=new Map<string,Exercise[]>();
 for(const e of exercises) {
  const key=e.group_id ?? e.id;
  const items=groups.get(key);
  if(items) items.push(e); else groups.set(key,[e]);
 }
 const submit=async(e:Exercise,answer:string,mode?:'translation')=>{
  if(await onSubmit(e,answer,mode)) {setRetrying(x=>({...x,[e.id]:false}));return true;}
  return false;
 };
 return <div className="exercise-list">{Array.from(groups,([groupId,items],index)=>{
    const exercise=items[0];
    return <Card className="exercise-card gap-5 border-border shadow-none" key={groupId} aria-labelledby={'exercise-title-'+groupId}>
      <CardHeader>
        <div className="exercise-meta"><span>EXERCICE {String(index+1).padStart(2,'0')}</span><Badge variant="secondary">{{flashcard:'Carte mémoire',cloze:'Texte à trous',free_text:'Expression écrite',questionnaire:'Questionnaire',sentence:'Construction de phrase'}[exercise.type]}</Badge></div>
        <Title id={'exercise-title-'+groupId} className="mt-2 mb-0 font-serif text-2xl leading-snug font-normal">{exercise.instruction}</Title>
        <span className="exercise-help">{items.filter(e=>e.latestAttempt).length} / {items.length} items travaillés</span>
      </CardHeader>
      <CardContent className="exercise-items px-0">{exercise.type==='flashcard' ? onReveal && <VocabularyCarousel items={items} busy={busy} onReveal={onReveal} onSubmit={submit} initialMode={initialMode}/> : exercise.type==='questionnaire' ? <QuestionnaireExercise items={items} busy={busy} onSubmit={submit} allowRetry={allowRetry}/> : items.map((e,itemIndex)=>{
        const result=retrying[e.id]?null:e.latestAttempt;
        const gap=e.type==='cloze' ? /_{2,}/.exec(e.content) : null;
        return <div className="exercise-item" role="group" aria-label={'Question '+(itemIndex+1)} key={e.id}>
          <div className="exercise-body px-6">
            {items.length>1 && <span className="exercise-item-number">ITEM {String(itemIndex+1).padStart(2,'0')}</span>}
        <p className="exercise-prompt" lang={e.type==='cloze'?'it':undefined}>{gap ? <>{e.content.slice(0,gap.index)}<input className="cloze-answer" aria-label="Votre réponse" aria-describedby={'exercise-title-'+groupId} aria-invalid={result && !result.neutralized ? result.is_correct===0 : undefined} autoComplete="off" spellCheck={false} disabled={busy} readOnly={!!result} value={result?.answer ?? answers[e.id] ?? ''} onChange={event=>setAnswers(x=>({...x,[e.id]:event.target.value}))}/>{e.content.slice(gap.index+gap[0].length)}</> : e.content}</p>
        {result ? <>
          {!gap && <div className="exercise-response"><span>Votre réponse</span><p lang="it">{result.answer}</p></div>}
          <div className="exercise-feedback" role="status">
            {e.type==='free_text' ? result.status==='pending_teacher' ? <><strong>En attente du professeur.</strong><p>Votre réponse a été envoyée. Actualisez la séance pour consulter votre correction.</p></> : <><strong>{result.neutralized?'Verdict neutralisé.':result.feedback?.result==='correct'?'Correct.':result.feedback?.result==='partial'?'Partiellement correct.':'À revoir.'}</strong><p lang="it">{result.feedback?.correction}</p><p>{result.feedback?.explanation}</p></> : <><strong>{result.is_correct?'Correct.':'À revoir.'}</strong><p>Réponses acceptées : <span lang="it">{result.feedback?.accepted?.join(', ')}</span></p>{result.feedback?.explanation && <p>{result.feedback.explanation}</p>}</>}
          </div>
          <AttemptRectifications attempt={result}/>
        </> : gap ? <p className="exercise-help">Complétez directement la phrase. Votre réponse sera corrigée automatiquement.</p> : <label className="exercise-input" htmlFor={'exercise-answer-'+e.id}>Votre réponse<textarea id={'exercise-answer-'+e.id} rows={2} disabled={busy} value={answers[e.id] ?? ''} placeholder={e.type==='cloze'?'Écrivez le mot manquant…':'Écrivez votre réponse en italien…'} onChange={event=>setAnswers(x=>({...x,[e.id]:event.target.value}))}/><span className="exercise-help">{e.type==='cloze'?'Votre réponse sera corrigée automatiquement.':'Votre professeur corrigera votre réponse.'}</span></label>}
          </div>
          <CardFooter className="exercise-actions">
        {result ? allowRetry && <Button disabled={busy} variant="outline" onClick={()=>{setRetrying(x=>({...x,[e.id]:true}));setAnswers(x=>({...x,[e.id]:''}));}}><RefreshCw aria-hidden="true"/>Nouvelle tentative</Button> : <Button disabled={busy || !answers[e.id]?.trim()} onClick={()=>void submit(e,answers[e.id])}><Send aria-hidden="true"/>Envoyer</Button>}
          </CardFooter>
        </div>;
      })}</CardContent>
    </Card>;
  })}</div>;
}
