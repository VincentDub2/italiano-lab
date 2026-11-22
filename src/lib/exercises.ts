import type { RevisionState } from './revision';
export type Sentence = { hintCount: number } & (
  | { format: 'guided' | 'transformation' | 'question' }
  | { format: 'word_order'; tokens: string[] }
  | { format: 'dialogue'; turns: string[] }
);
export type ExerciseType = 'flashcard' | 'cloze' | 'free_text' | 'questionnaire' | 'sentence';
export type Answer = string | string[] | number[];
export type SentenceDraft = { requestId: string; retryOf?: string };
export type Attempt = { request_id: string; id: string; exercise_id: string | null; answer: string; answerLabel?: string; replies?: string[]; retryOf?: string | null; hintCount?: number; status: string; feedback?: { correction?: string; explanation?: string; accepted?: string[]; example?: string; articleOmitted?: boolean; result?: string; retry?: boolean; turns?: { correction:string; explanation:string }[] }; is_correct: number | null; content?: string; instruction?:string; question?:{type:string;instruction:string;content:string;choices?:{value:string;label:string}[];sentence?:Sentence}; title?: string; submitted_at?: string; assisted?: boolean | null; context?: string; neutralized?: boolean; rectifications?: {correction:string;explanation:string;created_at:string}[] };
export type Exercise = { id: string; group_id: string | null; type: ExerciseType; choices?: { value: string; label: string }[]; instruction: string; content: string; latestAttempt: Attempt | null; item_id?: string; version_id?: string; revision?: RevisionState; alreadyReviewed?: boolean; needsAttempt?: boolean; retryReady?: boolean; notions?: {id:string;name:string}[]; sentence?: Sentence; sentenceHistory?: Attempt[] };
