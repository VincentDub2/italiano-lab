import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateReview, romeDay, addDays, type ReviewEvent } from '../src/lib/revision';

const event = (day: string, result: ReviewEvent['result'], assisted: boolean | null = false): ReviewEvent => ({ submittedAt: `${day}T12:00:00Z`, result, assisted });
test('erreur, essai aidé, trois échéances indépendantes puis rechute', () => {
 const events = [event('2026-01-01', 'incorrect'), event('2026-01-01', 'correct', true)];
 assert.deepEqual(calculateReview(events), { state: 'rework', successes: 0, step: 0, due: '2026-01-02', lastSuccess: null, pending: false });
 events.push(event('2026-01-02', 'correct'));
 assert.equal(calculateReview(events).due, '2026-01-05');
 events.push(event('2026-01-05', 'correct'), event('2026-01-12', 'correct'));
 assert.equal(calculateReview(events).state, 'consolidated');
 assert.equal(calculateReview(events).due, '2026-01-26');
 events.push(event('2026-01-13', 'partial'));
 assert.equal(calculateReview(events).due, '2026-01-14');
 assert.equal(calculateReview(events).successes, 0);
});
test('première réussite, pratique anticipée, aide inconnue et plafond', () => {
 const events = [event('2026-01-01', 'correct'), event('2026-01-01', 'correct'), event('2026-01-01', 'self')];
 assert.equal(calculateReview(events).successes, 0);
 assert.equal(calculateReview(events).due, '2026-01-02');
 assert.equal(calculateReview([event('2026-01-01', 'correct', null)]).state, 'evaluate');
 for (const day of ['2026-01-02', '2026-01-05', '2026-01-12', '2026-01-26', '2026-02-25']) events.push(event(day, 'correct'));
 assert.equal(calculateReview(events).due, '2026-03-27');
});
test('corrections différées, attente, retard et jours civils de Rome', () => {
 assert.equal(calculateReview([event('2026-01-01', 'pending')]).pending, true);
 const late = { ...event('2026-01-01', 'incorrect'), reviewedAt: '2026-01-10T12:00:00Z' };
 assert.equal(calculateReview([late]).due, '2026-01-11');
 assert.equal(calculateReview([{ ...late, result: 'correct' }]).due, '2026-01-02');
 assert.equal(romeDay('2026-01-01T23:30:00Z'), '2026-01-02');
 assert.equal(addDays('2026-03-28', 1), '2026-03-29');
 assert.equal(calculateReview([event('2026-01-01', 'incorrect'), event('2026-01-10', 'correct')]).due, '2026-01-13');
});
