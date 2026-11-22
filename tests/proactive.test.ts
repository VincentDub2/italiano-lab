import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeSession, createBankExercise, rectifyFeedback, searchBank, updateDraft } from '../src/server/bank';
import { openDatabase } from '../src/server/database.mjs';
import { getAttempt, getSession, publishSession, revealSessionHint, submitAttempt, submitFeedback } from '../src/server/domain';

function isolated() {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-proactive-'));
 process.env.ITALIANO_DB_PATH = join(dir, 'test.sqlite');
 return () => {delete process.env.ITALIANO_DB_PATH;rmSync(dir,{recursive:true,force:true});};
}

function written(key: string, content: string) {
 return createBankExercise({requestId:key,notions:['Temps du récit'],exercise:{
  type:'free_text',instruction:'Écrivez deux phrases.',items:[{content,answer:{}}],
 }}).itemIds[0];
}

function attempt(key: string, itemId: string) {
 const {id} = composeSession({requestId:key,title:'Test',objective:'Raconter',scheduledDate:'2026-01-01',itemIds:[itemId]});
 publishSession(id);
 return submitAttempt({requestId:key+'-answer',exerciseId:getSession(id).exercises[0].id,answer:'Facevo la spesa ieri.'});
}

test('observations atomiques et candidatures fondées sur deux énoncés indépendants', async () => {
 const cleanup = isolated();
 try {
  const itemA = written('a','Racontez votre achat au marché.');
  const itemB = written('b','Décrivez une interruption du voyage.');
  const itemCopy = written('a-copy','Racontez votre achat au marché !');
  const notionId = searchBank({notion:'Temps du récit'})[0].notions[0].id;
  const observation = {notionId,kind:'error',explanation:'L’action ponctuelle demande le passé composé.'};
  const a = attempt('first',itemA), copy = attempt('copy',itemCopy), b = attempt('second',itemB);
  const feedback = (attemptId: string) => ({attemptId,result:'incorrect',correction:'Ho fatto la spesa.',explanation:'Action terminée.'});
  const qualified = {...feedback(a.id),requestId:'feedback-a',observations:[observation,observation]};
  assert.throws(() => submitFeedback({...qualified,observations:[{...observation,notionId:'absent'}]}));
  assert.equal(getAttempt(a.id).status,'pending_teacher');
  assert.deepEqual(submitFeedback(qualified),submitFeedback(qualified));
  assert.throws(() => submitFeedback({...qualified,observations:[]}));
  assert.equal(getAttempt(a.id).observations.length,1);
  assert.ok(!('observations' in getSessionFromAttempt(a.exercise_id!)));

  const {listLearningSignals} = await import('../src/server/learning-signals');
  submitFeedback({...feedback(copy.id),observations:[observation]});
  assert.equal(listLearningSignals().state,'no_candidate');
  const style = attempt('style',written('style-item','Décrivez le matin.'));
  submitFeedback({...feedback(style.id),observations:[{...observation,kind:'style'},{...observation,kind:'typo'}]});
  const review = attempt('repeat',itemA);
  assert.equal(review.assisted,true);
  submitFeedback({...feedback(review.id),observations:[observation]});
  const guided = createBankExercise({requestId:'hinted-bank',notions:['Temps du récit'],exercise:{
   type:'sentence',instruction:'Écrivez sur votre journée.',items:[{content:'Racontez votre déjeuner.',
    sentence:{format:'guided',hints:['Utilisez un temps du passé.'],rubric:{criteria:'Raconter une action précise.'}}}],
  }}).itemIds[0];
  const {id:guidedSession}=composeSession({requestId:'hinted-session',title:'Test',objective:'Raconter',scheduledDate:'2026-01-01',itemIds:[guided]});
  publishSession(guidedSession);
  const exerciseId=getSession(guidedSession).exercises[0].id;
  revealSessionHint({exerciseId,requestId:'hint-old-key',level:1});
  const assisted=submitAttempt({exerciseId,requestId:'hint-new-key',answer:'Mangiavo un panino.'});
  assert.equal(assisted.assisted,true);
  submitFeedback({...feedback(assisted.id),observations:[observation]});
  assert.equal(listLearningSignals().state,'no_candidate');
  submitFeedback({...feedback(b.id),result:'correct',explanation:'Le récit est compréhensible. Un temps reste à revoir.',observations:[observation]});
  assert.equal(listLearningSignals().candidates[0].evidence.length,2);
  rectifyFeedback({requestId:'neutralize-b',attemptId:b.id,correction:'Verdict neutralisé',explanation:'Erreur de lecture.'});
  assert.equal(listLearningSignals().state,'no_candidate');
  assert.equal(getAttempt(b.id).observations.length,1);
  assert.equal(getAttempt(b.id).neutralized,true);
 } finally {cleanup();}
});

function getSessionFromAttempt(occurrenceId: string) {
 const db = openDatabase();
 try {
  const sessionId = String(db.prepare('SELECT session_id FROM exercises WHERE id=?').get(occurrenceId)?.session_id);
  return getSession(sessionId,true).exercises[0].latestAttempt!;
 } finally {db.close();}
}

function closed(key: string, content = 'Ieri ___ al cinema.') {
 return createBankExercise({requestId:key,notions:['Temps du récit'],exercise:{
  type:'cloze',instruction:'Complétez.',items:[{content,answer:{accepted:['sono andato']}}],
 }}).itemIds[0];
}

function lessonInputs() {
 const a = attempt('proof-a-session',written('proof-a','Racontez votre trajet en bus.'));
 const b = attempt('proof-b-session',written('proof-b','Racontez votre achat au marché.'));
 const notionId = searchBank({notion:'Temps du récit'})[0].notions[0].id;
 for (const {id} of [a,b]) submitFeedback({
  attemptId:id,result:'incorrect',correction:'Ho fatto la spesa.',explanation:'Action terminée.',
  observations:[{notionId,kind:'error',explanation:'Le temps de l’action terminée est incorrect.'}],
 });
 const itemIds = [closed('restitution'),written('application','Racontez un changement de train.')];
 const reminders = [{title:'Le temps du récit',explanation:'Pour une action terminée, utilisez le passé composé.',examples:[{italian:'Ho mangiato.',french:'J’ai mangé.'}]}];
 return {notionId,evidenceAttemptIds:[a.id,b.id],itemIds,reminders,title:'Raconter au passé',objective:'Raconter un imprévu',reason:'Les deux récits mélangent les temps.'};
}

test('proposition isolée, tentative réelle et validation J0 au jour civil de Rome', async (t) => {
 const cleanup = isolated();
 const dates = new Date('2026-03-28T22:59:00Z');
 t.mock.timers.enable({apis:['Date'],now:dates});
 try {
  const input = lessonInputs();
  const {createLesson, publishLesson, getStudentLesson, listStudentLessons, actOnLesson} = await import('../src/server/proactive-lessons');
  const {listSessions} = await import('../src/server/domain');
  const draft = createLesson({...input,requestId:'draft'});
  assert.deepEqual(createLesson({...input,requestId:'draft'}),draft);
  assert.equal(listStudentLessons().length,0);
  assert.throws(()=>publishSession(draft.sessionId),/leçon/);
  publishLesson({lessonId:draft.id,requestId:'propose'});
  const preview = getSession(draft.sessionId,true);
  assert.equal(preview.reminders.length,1);
  assert.ok(!('answer_json' in preview.exercises[0]));
  const exerciseId = preview.exercises[0].id;
  const answer = {exerciseId,requestId:'j0-closed',answer:'sono andato'};
  assert.throws(()=>submitAttempt(answer),/commencer/);
  assert.ok(!listSessions(true).some(s=>s.id===draft.sessionId));
  const other = createLesson({...input,requestId:'other'});
  assert.throws(()=>publishLesson({lessonId:other.id,requestId:'propose-other'}),/déjà/);
  assert.equal(getSession(other.sessionId).status,'draft');
  assert.deepEqual(getStudentLesson(draft.id).milestones,[]);
  actOnLesson({lessonId:draft.id,requestId:'start',action:'start'});
  actOnLesson({lessonId:draft.id,requestId:'start-twice',action:'start'});
  rectifyFeedback({requestId:'remove-evidence',attemptId:input.evidenceAttemptIds[0],correction:'Verdict neutralisé',explanation:'Mauvaise lecture.'});
  assert.equal(getStudentLesson(draft.id).status,'in_progress');
  const restitution = submitAttempt(answer);
  rectifyFeedback({requestId:'neutralize-closed-j0',attemptId:restitution.id,correction:'Verdict neutralisé',explanation:'La restitution a bien été envoyée.'});
  const a = submitAttempt({exerciseId:preview.exercises[1].id,requestId:'j0-written',answer:'Ho cambiato treno.'});
  assert.equal(getStudentLesson(draft.id).waitingForCorrection,true);
  assert.deepEqual(getStudentLesson(draft.id).milestones,[]);
  t.mock.timers.setTime(new Date('2026-03-28T23:05:00Z').getTime());
  const feedback = {requestId:'j0-feedback',attemptId:a.id,result:'partial',correction:'Ho cambiato treno a Roma.',explanation:'Précisez le lieu.'};
  submitFeedback(feedback);
  submitFeedback(feedback);
  const done = getStudentLesson(draft.id);
  assert.equal(done.j0Date,'2026-03-29');
  assert.equal(done.status,'j0_completed');
  assert.deepEqual(done.milestones.map(m=>m.date),['2026-03-30','2026-04-01','2026-04-05','2026-04-12','2026-04-28']);
  rectifyFeedback({requestId:'neutralize-j0',attemptId:a.id,correction:'Verdict neutralisé',explanation:'Mauvaise lecture.'});
  assert.deepEqual(getStudentLesson(draft.id).milestones,done.milestones);
 } finally {cleanup();}
});

test('une proposition écartée exige des preuves nouvelles et une preuve rectifiée bloque le départ', async () => {
 const cleanup = isolated();
 try {
  const input = lessonInputs();
  const {createLesson, publishLesson, getStudentLesson, actOnLesson} = await import('../src/server/proactive-lessons');
  const first = createLesson({...input,requestId:'first-draft'});
  publishLesson({lessonId:first.id,requestId:'first-publish'});
  actOnLesson({lessonId:first.id,requestId:'dismiss',action:'dismiss'});
  assert.equal(getStudentLesson(first.id).status,'dismissed');
  assert.deepEqual(getStudentLesson(first.id).milestones,[]);
  const second = createLesson({...input,requestId:'second-draft'});
  assert.throws(()=>publishLesson({lessonId:second.id,requestId:'second-publish'}),/nouvelle preuve/);
  const thirdAttempt = attempt('proof-c-session',written('proof-c','Racontez une panne nocturne.'));
  submitFeedback({attemptId:thirdAttempt.id,result:'incorrect',correction:'Si è rotto.',explanation:'Événement ponctuel.',
   observations:[{notionId:input.notionId,kind:'error',explanation:'Le passé composé marque la panne.'}]});
  const third = createLesson({...input,evidenceAttemptIds:[input.evidenceAttemptIds[0],thirdAttempt.id],requestId:'third-draft'});
  publishLesson({lessonId:third.id,requestId:'third-publish'});
  rectifyFeedback({requestId:'neutralize-proof',attemptId:thirdAttempt.id,correction:'Verdict neutralisé',explanation:'Mauvaise lecture.'});
  assert.equal(getStudentLesson(third.id).canStart,false);
  assert.throws(()=>actOnLesson({lessonId:third.id,requestId:'too-late',action:'start'}));
 } finally {cleanup();}
});

test('un jalon exige les occurrences liées d’une seule séance et conserve le résultat du travail', async (t) => {
 const cleanup = isolated();
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-03-29T15:00:00Z')});
 try {
  const input = lessonInputs();
  const {createLesson,publishLesson,getStudentLesson,actOnLesson} = await import('../src/server/proactive-lessons');
  const {dailyPlan} = await import('../src/server/bank');
  const lesson = createLesson({...input,requestId:'links-lesson'});
  publishLesson({lessonId:lesson.id,requestId:'links-publish'});
  actOnLesson({lessonId:lesson.id,requestId:'links-start',action:'start'});
  const j0 = getSession(lesson.sessionId,true).exercises;
  submitAttempt({requestId:'links-j0-closed',exerciseId:j0[0].id,answer:'sono andato'});
  const a = submitAttempt({requestId:'links-j0-written',exerciseId:j0[1].id,answer:'Ho cambiato treno.'});
  submitFeedback({attemptId:a.id,result:'correct',correction:'Ho cambiato treno.',explanation:'Action terminée.'});
  const [j1,j3] = getStudentLesson(lesson.id).milestones;
  t.mock.timers.setTime(new Date('2026-04-01T15:00:00Z').getTime());
  const firstDue = dailyPlan().revisionMilestones[0];
  assert.equal(firstDue.id,j1.id);
  assert.deepEqual(firstDue.laterDue.map((m:{id:string})=>m.id),[j3.id]);

  const unrelated = closed('unrelated','Ieri ___ alla stazione.');
  const linked = closed('linked','Su un treno, ieri ___ a Napoli.');
  const linkedOpen = written('linked-open','Racontez une commande livrée en retard.');
  const compose = {title:'Raconter un imprévu',objective:'Appliquer les temps',scheduledDate:'2026-04-01',itemIds:[unrelated,linked,linkedOpen]};
  assert.throws(()=>composeSession({...compose,requestId:'invalid-position',revisionLinks:[{milestoneId:j1.id,positions:[12]}]}),/position/i);
  const wrongStep = composeSession({...compose,requestId:'wrong-step',revisionLinks:[{milestoneId:j3.id,positions:[1,2]}]});
  assert.throws(()=>publishSession(wrongStep.id),/jalon/i);
  const first = composeSession({...compose,requestId:'first-linked',revisionLinks:[{milestoneId:j1.id,positions:[1,2]}]});
  const second = composeSession({...compose,requestId:'second-linked',revisionLinks:[{milestoneId:j1.id,positions:[1,2]}]});
  assert.throws(()=>updateDraft({...compose,sessionId:first.id,requestId:'lose-links',itemIds:[unrelated,linkedOpen]}),/revisionLinks/);
  updateDraft({...compose,sessionId:first.id,requestId:'reorder-links',itemIds:[linked,unrelated,linkedOpen]});
  const [closedExercise,unlinkedExercise,openExercise] = getSession(first.id).exercises;
  assert.deepEqual(getSession(first.id).revision_links?.[0].positions,[0,2]);
  assert.deepEqual(getSession(first.id).revision_links?.[0].occurrenceIds,[closedExercise.id,openExercise.id]);
  publishSession(first.id);
  publishSession(second.id);
  assert.equal(getStudentLesson(lesson.id).milestones[0].completedAt,null);
  submitAttempt({exerciseId:unlinkedExercise.id,requestId:'not-linked',answer:'sono andato'});
  const wrong = submitAttempt({exerciseId:closedExercise.id,requestId:'linked-closed',answer:'andavo'});
  const elsewhere = submitAttempt({exerciseId:getSession(second.id).exercises[2].id,requestId:'other-linked-open',answer:'Arrivava tardi.'});
  const feedback = {result:'incorrect',correction:'È arrivata tardi.',explanation:'Action terminée.'};
  submitFeedback({...feedback,attemptId:elsewhere.id});
  assert.equal(getStudentLesson(lesson.id).milestones[0].completedAt,null);
  const linkedWritten = submitAttempt({exerciseId:openExercise.id,requestId:'linked-open-written',answer:'È arrivata tardi.'});
  assert.equal(getStudentLesson(lesson.id).milestones[0].completedAt,null);
  submitFeedback({...feedback,attemptId:linkedWritten.id});
  assert.equal(getStudentLesson(lesson.id).milestones[0].result,'needs_work');
  assert.equal(dailyPlan().revisionMilestones[0].id,j3.id);
  assert.equal(getStudentLesson(lesson.id).milestones[1].completedAt,null);
  rectifyFeedback({requestId:'linked-rectify',attemptId:wrong.id,correction:'Verdict neutralisé',explanation:'Mauvaise lecture.'});
  const changed = getStudentLesson(lesson.id).milestones[0];
  assert.equal(changed.result,'invalidated');
  assert.ok(changed.completedAt);
  assert.equal(changed.date,j1.date);
 } finally {cleanup();}
});

test('un énoncé déjà travaillé hors de la fenêtre reste une répétition', async (t) => {
 const cleanup=isolated();
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-01T12:00:00Z')});
 try {
  const item=written('old-prompt','Racontez une panne au travail.');
  const original=attempt('original-session',item);
  submitFeedback({attemptId:original.id,result:'partial',correction:'Il computer si è rotto.',explanation:'Événement ponctuel.'});
  t.mock.timers.setTime(Date.parse('2026-11-15T12:00:00Z'));
  const other=written('new-prompt','Décrivez un imprévu pendant le dîner.');
  const copy=written('repeated-prompt','Racontez une panne au travail !');
  const notionId=searchBank({notion:'Temps du récit'})[0].notions[0].id;
  for (const [key,bankId] of [['repeated',copy],['new',other]]) {
   const {id}=attempt(key+'-session',bankId);
   submitFeedback({attemptId:id,result:'partial',correction:'Il computer si è rotto.',explanation:'Événement ponctuel.',
    observations:[{notionId,kind:'error',explanation:'Le récit demande le passé composé.'}]});
  }
  const {listLearningSignals}=await import('../src/server/learning-signals');
  assert.equal(listLearningSignals().state,'no_candidate');
 } finally {cleanup();}
});
