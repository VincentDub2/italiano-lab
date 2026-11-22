export type ReviewEvent = { submittedAt: string; reviewedAt?: string | null; result: 'correct' | 'partial' | 'incorrect' | 'pending' | 'self' | 'neutralized'; assisted: boolean | null };
export type RevisionState = { state: 'evaluate' | 'rework' | 'consolidating' | 'consolidated'; successes: number; step: number; due: string | null; lastSuccess: string | null; pending: boolean };
export const stateLabels = { evaluate: 'À évaluer', rework: 'À retravailler', consolidating: 'En consolidation', consolidated: 'Consolidé' };
export const romeDay = (date: string | Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
export function addDays(day: string, count: number) {
 const date = new Date(`${day}T12:00:00Z`);
 date.setUTCDate(date.getUTCDate() + count);
 return date.toISOString().slice(0, 10);
}
const romeOffset = new Intl.DateTimeFormat('en', {timeZone:'Europe/Rome',timeZoneName:'longOffset'});
export function romeDayStart(day: string) {
 const nearMidnight = new Date(`${addDays(day,-1)}T23:00:00Z`);
 const offset = romeOffset.formatToParts(nearMidnight).find(part=>part.type==='timeZoneName')!.value.slice(3);
 return new Date(`${day}T00:00:00${offset || 'Z'}`).toISOString();
}
export function calculateReview(events: ReviewEvent[]): RevisionState {
 const review: RevisionState = { state: 'evaluate', successes: 0, step: 0, due: null, lastSuccess: null, pending: false };
 for (const event of events) {
  const day = romeDay(event.submittedAt);
  if (event.result === 'pending') { review.pending = true; continue; }
  if (event.result === 'incorrect' || event.result === 'partial') {
   review.state = 'rework'; review.successes = 0; review.step = 0; review.lastSuccess = null;
   review.due = addDays(romeDay(event.reviewedAt || event.submittedAt), 1);
  } else if (event.result === 'correct' && event.assisted === false) {
   if (!review.due) { review.state = 'consolidating'; review.due = addDays(day, 1); }
   else if (day >= review.due && day !== review.lastSuccess) {
    review.successes++; review.step = Math.min(4, review.step + 1); review.lastSuccess = day;
    review.state = review.successes >= 3 ? 'consolidated' : 'consolidating';
    review.due = addDays(day, [1, 3, 7, 14, 30][review.step]);
   }
  }
 }
 return review;
}
