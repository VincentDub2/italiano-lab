'use client';

import { useEffect, useRef, useState } from 'react';
import type { Answer, Attempt, Exercise, Sentence, SentenceDraft } from '@/lib/exercises';
import { AttemptRectifications } from './attempt-rectifications';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

const labels: Record<Sentence['format'],string> = {
  guided: 'Phrase guidée',
  transformation: 'Transformation',
  question: 'Réponse à une question',
  dialogue: 'Mini-dialogue',
  word_order: 'Mots à remettre dans l’ordre',
};
const field = 'w-full rounded-md border border-border bg-background px-3 py-2';

export function SentenceFeedback({ attempt }: { attempt: Attempt }) {
  const sentence = attempt.question?.sentence;
  const feedback = attempt.feedback;
  const verdict = attempt.neutralized ? 'Verdict neutralisé' : attempt.status === 'pending_teacher' ? 'En attente du professeur'
    : attempt.is_correct === 1 ? 'Correct' : attempt.is_correct === 0 ? 'À revoir' : 'Partiellement correct';
  return <div className="grid gap-3 text-sm">
    {sentence?.format === 'dialogue' ? <ol className="grid gap-3">
      {sentence.turns.map((turn,index) => <li key={index} className="grid gap-1 rounded-md bg-accent/40 p-3">
        <p lang="it" className="font-medium wrap-break-word">{turn}</p>
        <p>Votre réponse <span lang="it" className="whitespace-pre-wrap wrap-break-word">{attempt.replies?.[index]}</span></p>
        {feedback?.turns?.[index] && <>
          <p>Proposition <span lang="it" className="wrap-break-word">{feedback.turns[index].correction}</span></p>
          <p className="text-muted-foreground">{feedback.turns[index].explanation}</p>
        </>}
      </li>)}
    </ol> : <div>
      <p className="text-muted-foreground">Votre réponse</p>
      <p lang="it" className="whitespace-pre-wrap wrap-break-word">{attempt.answerLabel ?? attempt.answer}</p>
    </div>}
    <div className="grid gap-1 rounded-md border border-border bg-accent/50 p-3" role="status">
      <strong>{verdict}</strong>
      {feedback?.correction && <p lang="it" className="whitespace-pre-wrap wrap-break-word">{feedback.correction}</p>}
      {feedback?.accepted && <p>Ordres acceptés <span lang="it">{feedback.accepted.join(' / ')}</span></p>}
      {feedback?.explanation && <p className="whitespace-pre-wrap wrap-break-word">{feedback.explanation}</p>}
    </div>
    <AttemptRectifications attempt={attempt}/>
  </div>;
}

type Props = {
  exercise: Exercise;
  sentence: Sentence;
  scopeId: string;
  busy: boolean;
  headingLevel: 3 | 4;
  onSubmit: (answer: Answer, draft: SentenceDraft) => Promise<boolean>;
  onHint: (draft: SentenceDraft, level: number) => Promise<string[]>;
};
export function SentenceExercise({ exercise, sentence, scopeId, busy, headingLevel, onSubmit, onHint }: Props) {
  const [retryOf,setRetryOf] = useState<string>();
  const latest = exercise.latestAttempt;
  const retrying = !!retryOf && retryOf === latest?.id;
  const showForm = (!latest || retrying) && !exercise.revision?.pending;
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const history = exercise.sentenceHistory?.slice(1) ?? [];
  const draftKey = `italiano-sentence:${scopeId}:${exercise.id}:${retrying ? retryOf : 'first'}`;
  const promptId = `sentence-prompt-${exercise.id}`;
  return <Card className="gap-4 border-border p-5 shadow-none sm:p-6" aria-labelledby={`sentence-title-${exercise.id}`}>
    <Badge variant="secondary">{labels[sentence.format]}</Badge>
    <Heading id={`sentence-title-${exercise.id}`} className="m-0 font-serif text-2xl font-normal">{exercise.instruction}</Heading>
    <p id={promptId} className="whitespace-pre-wrap wrap-break-word">{exercise.content}</p>
    {latest && (retrying ? <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Relire votre réponse et la correction</summary>
      <div className="mt-3"><SentenceFeedback attempt={latest}/></div>
    </details> : <SentenceFeedback attempt={latest}/>)}
    {history.length > 0 && <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Tentatives précédentes ({history.length})</summary>
      <ol className="mt-3 grid gap-4">{history.map(attempt => <li key={attempt.id}><SentenceFeedback attempt={attempt}/></li>)}</ol>
    </details>}
    {!latest && exercise.revision?.pending && <p role="status">Une tentative attend déjà la correction du professeur.</p>}
    {latest?.feedback && !retrying && !exercise.revision?.pending && <Button className="w-fit" variant="outline" disabled={busy} onClick={() => setRetryOf(latest.id)}>
      {sentence.format === 'word_order' ? 'Réessayer' : 'Reformuler'}
    </Button>}
    {showForm && <SentenceForm key={draftKey} {...{sentence, busy, onSubmit, onHint, retryOf:retrying ? retryOf : undefined, draftKey, promptId}}/>}
  </Card>;
}

type FormState = { requestId: string; text: string; replies: string[]; order: number[]; hints: string[]; sending?: boolean };
type FormProps = Pick<Props,'sentence' | 'busy' | 'onSubmit' | 'onHint'> & { draftKey: string; promptId: string; retryOf?: string };
function SentenceForm({sentence,busy,onSubmit,onHint,draftKey,promptId,retryOf}: FormProps) {
  const [draft,setDraft] = useState<FormState>(() => {
    try {
      const stored = sessionStorage.getItem(draftKey);
      if (stored) return JSON.parse(stored) as FormState;
    } catch {}
    return {requestId:crypto.randomUUID(),text:'',replies:sentence.format === 'dialogue' ? sentence.turns.map(() => '') : [],order:[],hints:[]};
  });
  const [error,setError] = useState('');
  const [hintLoading,setHintLoading] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const update = (changes: Partial<FormState>) => {
    const next = {...draft,...changes};
    setDraft(next);
    try { sessionStorage.setItem(draftKey,JSON.stringify(next)); } catch {}
  };
  useEffect(() => {
    if (retryOf) form.current?.querySelector<HTMLElement>('textarea, button')?.focus();
  },[retryOf]);

  const request = {requestId:draft.requestId,...(retryOf ? {retryOf} : {})};
  const wordOrder = sentence.format === 'word_order';
  const dialogue = sentence.format === 'dialogue';
  const answer = wordOrder ? draft.order : dialogue ? draft.replies : draft.text;
  const valid = wordOrder ? draft.order.length === sentence.tokens.length : dialogue
    ? draft.replies.every(reply => reply.trim()) && draft.replies.reduce((total,reply) => total + reply.length,0) <= 4000
    : !!draft.text.trim();
  const locked = busy || hintLoading || !!draft.sending;
  const reveal = async () => {
    setError('');
    setHintLoading(true);
    update({});
    try { update({hints:await onHint(request,draft.hints.length + 1)}); }
    catch { setError('Impossible d’afficher l’indice. Réessayez.'); }
    finally { setHintLoading(false); }
  };
  return <form ref={form} className="grid gap-4" onSubmit={async event => {
    event.preventDefault();
    if (busy || hintLoading || !valid) return;
    update({sending:true});
    if (await onSubmit(answer,request)) {
      try { sessionStorage.removeItem(draftKey); } catch {}
    }
  }}>
    {retryOf && <p className="text-sm text-muted-foreground">{wordOrder ? 'Recomposez la phrase.' : 'Écrivez une nouvelle version. Vous pouvez vous passer des indices.'}</p>}
    {wordOrder ? <>
      <div role="group" aria-label="Mots à placer" className="flex flex-wrap gap-2">
        {sentence.tokens.map((word,index) => {
          const selected = draft.order.includes(index);
          return <Button type="button" key={index} variant={selected ? 'secondary' : 'outline'} disabled={locked} aria-pressed={selected} lang="it"
            className="h-auto min-h-9 max-w-full wrap-anywhere whitespace-normal"
            onClick={() => update({order:selected ? draft.order.filter(position => position !== index) : [...draft.order,index]})}>{word}</Button>;
        })}
      </div>
      <div className="min-h-16 rounded-md border border-dashed border-border p-3">
        <p className="mb-1 text-sm text-muted-foreground">Phrase assemblée</p>
        <p lang="it" className="wrap-break-word" aria-live="polite">{draft.order.map(index => sentence.tokens[index]).join(' ')}</p>
      </div>
    </> : dialogue ? <div className="grid gap-3">
      {sentence.turns.map((turn,index) => <label key={index} className="grid gap-2">
        <span id={`${promptId}-turn-${index}`} lang="it" className="font-medium wrap-break-word">{turn}</span>
        <textarea aria-label={`Votre réplique ${index + 1}`} aria-describedby={`${promptId}-turn-${index}`} className={field} lang="it" rows={2} maxLength={1000} disabled={locked}
          value={draft.replies[index]} onChange={event => update({replies:draft.replies.map((reply,i) => i === index ? event.target.value : reply)})}/>
      </label>)}
    </div> : <label className="grid gap-2">
      <span>Votre phrase</span>
      <textarea aria-describedby={promptId} className={field} lang="it" rows={3} maxLength={4000} disabled={locked} value={draft.text}
        onChange={event => update({text:event.target.value})}/>
    </label>}
    {draft.hints.length > 0 && <ol aria-live="polite" className="list-inside list-decimal space-y-1 rounded-md bg-accent/50 p-3 text-sm">
      {draft.hints.map((hint,index) => <li key={index}>{hint}</li>)}
    </ol>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy || hintLoading || !valid}>{draft.sending ? 'Renvoyer' : wordOrder ? 'Vérifier la phrase' : 'Envoyer au professeur'}</Button>
      {draft.hints.length < sentence.hintCount && <Button type="button" variant="outline" disabled={locked} onClick={() => void reveal()}>
        {draft.hints.length ? 'Indice suivant' : 'Afficher un indice'}
      </Button>}
    </div>
  </form>;
}
