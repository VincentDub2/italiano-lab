'use client';
import { AttemptRectifications } from './attempt-rectifications';
import { useEffect, useRef, useState } from 'react';
import { Questionnaire } from '@shadcn/react/questionnaire';
import { ArrowLeft, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Exercise } from '@/lib/exercises';

type Props={items:Exercise[];busy:boolean;onSubmit:(item:Exercise,answer:string)=>Promise<boolean>;allowRetry?:boolean};

export function QuestionnaireExercise({items,busy,onSubmit,allowRetry=true}:Props) {
  const [active,setActive]=useState(items[0].id);
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [retrying,setRetrying]=useState<Record<string,boolean>>({});
  const resultRef=useRef<HTMLDivElement>(null);
  const current=items.find(e=>e.id===active)!;
  const resultId=retrying[active] ? undefined : current.latestAttempt?.id;
  useEffect(()=>{if(resultId)resultRef.current?.focus();},[active,resultId]);

  const verify=async()=>{
    if(busy || !answers[active] || resultId) return;
    if(await onSubmit(current,answers[active])) setRetrying(values=>({...values,[active]:false}));
  };

  return <Questionnaire.Root className="questionnaire-exercise" aria-label="Questionnaire de la séance" items={items.map(e=>({name:e.id,required:true,choices:e.choices}))} item={active} onItemChange={next=>{
    if(busy) return;
    if(items.findIndex(e=>e.id===next)>items.findIndex(e=>e.id===active) && !resultId) return;
    setActive(next);
  }} onSubmit={event=>event.preventDefault()} onKeyDown={event=>{
    if(busy) {event.preventDefault();return;}
    if(event.key==='Enter' && (event.target as HTMLElement).tagName==='INPUT') {event.preventDefault();void verify();}
  }}>
    <Questionnaire.Progress aria-label="Position dans le questionnaire" className="questionnaire-progress" render={(props,state)=><div {...props} aria-valuetext={`Question ${state.current} sur ${state.total}`}>Question {state.current} sur {state.total}</div>}/>
    {items.map(e=>{
      const result=retrying[e.id] ? null : e.latestAttempt;
      const selected=result?.answer ?? answers[e.id] ?? '';
      return <Questionnaire.Item className="questionnaire-item" key={e.id} name={e.id} required>
        <Questionnaire.Title className="questionnaire-title">{e.content}</Questionnaire.Title>
        <Questionnaire.Description className="exercise-help">Choisissez une seule réponse, puis vérifiez votre choix.</Questionnaire.Description>
        <Questionnaire.Choices className="questionnaire-choices" inert={!!result}>
          {e.choices?.map((choice,index)=><Questionnaire.Choice className="questionnaire-choice" key={choice.value} value={choice.value} disabled={busy} checked={selected===choice.value} onChange={event=>{
            if(result) {event.preventDefault();return;}
            setAnswers(values=>({...values,[e.id]:choice.value}));
          }}>
            <Questionnaire.ChoiceInput/>
            <span className="questionnaire-letter" aria-hidden="true">{String.fromCharCode(65+index)}</span>
            <Questionnaire.ChoiceLabel>{choice.label}</Questionnaire.ChoiceLabel>
          </Questionnaire.Choice>)}
        </Questionnaire.Choices>
        <Questionnaire.Error className="notice">Choisissez une réponse pour continuer.</Questionnaire.Error>
        {result ? <>
          <div ref={active===e.id ? resultRef : undefined} tabIndex={-1} className="exercise-feedback" data-correct={result.is_correct} role="status">
            <strong>{result.neutralized?'Verdict neutralisé.':result.is_correct?'Correct.':'À revoir.'}</strong>
            <p>Votre réponse : {e.choices?.find(c=>c.value===result.answer)?.label}</p>
            <p>Bonne réponse : {result.feedback?.accepted?.join(', ')}</p>
            {result.feedback?.explanation && <p>{result.feedback.explanation}</p>}
          </div>
          <AttemptRectifications attempt={result}/>
          {allowRetry && <Button className="questionnaire-verify" type="button" variant="outline" disabled={busy} onClick={()=>{
            setRetrying(values=>({...values,[e.id]:true}));
            setAnswers(values=>({...values,[e.id]:''}));
          }}><RefreshCw aria-hidden="true"/>Nouvelle tentative</Button>}
        </> : <Button className="questionnaire-verify" type="button" disabled={busy || !selected} onClick={()=>void verify()}><Check aria-hidden="true"/>Vérifier ma réponse</Button>}
      </Questionnaire.Item>;
    })}
    <div className="questionnaire-navigation">
      <Questionnaire.Previous render={<Button variant="outline"/>} disabled={busy}><ArrowLeft aria-hidden="true"/>Précédent</Questionnaire.Previous>
      <Questionnaire.Next render={<Button variant="outline"/>} disabled={busy || !resultId}>Suivant<ArrowRight aria-hidden="true"/></Questionnaire.Next>
      {active===items.at(-1)?.id && resultId && <span className="exercise-help">Toutes les questions ont été travaillées.</span>}
    </div>
  </Questionnaire.Root>;
}
