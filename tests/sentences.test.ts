import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { composeSession, createBankExercise, dailyPlan, reviseItem } from '../src/server/bank';
import { createSession, getAttempt, getSession, pending, publishSession, revealSessionHint, submitAttempt, submitFeedback } from '../src/server/domain';
import { journal, learningOverview } from '../src/server/learning';
import { answerPractice, getPracticeSeries, revealPracticeHint, startPractice } from '../src/server/practice';

function isolate(t: TestContext) {
 const dir = mkdtempSync(join(tmpdir(),'italiano-sentences-'));
 const previous = process.env.ITALIANO_DB_PATH;
 process.env.ITALIANO_DB_PATH = join(dir,'test.sqlite');
 t.after(() => {
  if (previous === undefined) delete process.env.ITALIANO_DB_PATH;
  else process.env.ITALIANO_DB_PATH = previous;
  rmSync(dir,{recursive:true,force:true});
 });
}
const guided = {
 content:'Vous rentrez du marché. Dites ce que vous avez acheté.',
 explanation:'Retour privé.',
 sentence:{format:'guided',hints:['Pensez au passé composé.','Utilisez ho comprato.'],rubric:{criteria:'Mentionner un achat au passé.',example:'Ho comprato delle mele.'}},
};
const sessionFields = {title:'Construire des phrases',objective:'Faire une phrase complète',scheduledDate:'2026-11-18'};

test('phrase guidée : indices privés, correction versionnée, reformulation et révision indépendante',t => {
 isolate(t);
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-18T12:00:00Z')});
 const group = createBankExercise({requestId:'guided',notions:['Passé composé'],exercise:{type:'sentence',instruction:'Écrivez une phrase entière.',items:[guided]}});
 const itemId = group.itemIds[0];
 const session = composeSession({requestId:'guided-session',...sessionFields,itemIds:[itemId]});
 const exerciseId = getSession(session.id).exercises[0].id;
 const draft = {exerciseId,requestId:'first'};
 assert.throws(() => revealSessionHint({...draft,level:1}),/inconnu/);
 publishSession(session.id);
 const publicItem = getSession(session.id,true).exercises[0];
 assert.deepEqual(publicItem.sentence,{format:'guided',hintCount:2});
 assert.doesNotMatch(JSON.stringify(publicItem),/Ho comprato|privé|passé composé\./);
 assert.throws(() => revealSessionHint({...draft,level:2}),/dans l’ordre/);
 assert.deepEqual(revealSessionHint({...draft,level:1}),{hints:[guided.sentence.hints[0]]});
 assert.deepEqual(revealSessionHint({...draft,level:1}),{hints:[guided.sentence.hints[0]]});
 const reply = {...draft,answer:'  Io comprato il pane.  '};
 const first = submitAttempt(reply);
 assert.equal(first.status,'pending_teacher');
 assert.equal(first.feedback,null);
 assert.equal(first.is_correct,null);
 assert.equal(first.hintCount,1);
 assert.equal(first.assisted,true);
 assert.equal(first.answer,reply.answer);
 assert.equal(submitAttempt(reply).id,first.id);
 assert.equal(journal({},false).items.length,0);
 assert.equal(startPractice({requestId:'while-pending',count:1,itemIds:[itemId],voluntary:true}).questions.length,0);
 assert.throws(() => submitAttempt({...draft,requestId:'blocked',answer:'Non so.'}),/attend une correction/);
 assert.throws(() => reviseItem({requestId:'changed-hints',itemId,kind:'typo',content:guided.content,sentence:{...guided.sentence,hints:['Nouveau.']}}),/pédagogique/);
 reviseItem({requestId:'typo',itemId,kind:'typo',content:'Vous rentrez du marché. Dites ce que vous y avez acheté.'});
 const queued = pending()[0];
 assert.equal(queued.content,guided.content);
 assert.equal('rubric' in queued && queued.rubric.criteria,guided.sentence.rubric.criteria);
 const feedback = {attemptId:first.id,result:'partial',correction:'Ho comprato il pane.',explanation:'Il faut ajouter l’auxiliaire avere.'};
 submitFeedback(feedback);
 assert.throws(() => submitAttempt({...draft,requestId:'missing-parent',answer:'Ho comprato il pane.'}),/dernière tentative/);
 const retry = submitAttempt({exerciseId,requestId:'reformulated',retryOf:first.id,answer:'Al mercato ho preso del pane.'});
 assert.equal(retry.retryOf,first.id);
 assert.equal(retry.hintCount,0);
 assert.equal(retry.assisted,true);
 const history = getSession(session.id,true).exercises[0].sentenceHistory;
 assert.deepEqual(history?.map((attempt:{answer:string}) => attempt.answer),[retry.answer,first.answer]);
 assert.equal(getAttempt(first.id).feedback?.explanation,feedback.explanation);
 submitFeedback({attemptId:retry.id,result:'correct',correction:retry.answer,explanation:'Formulation naturelle dans ce contexte.'});
 assert.equal(journal({},false).items[0].revision.successes,0);
 assert.equal(learningOverview().workedSeconds,360);

 t.mock.timers.setTime(Date.parse('2026-11-19T12:00:00Z'));
 assert.equal(dailyPlan().items[0].item_id,itemId);
 const next = composeSession({requestId:'followup',...sessionFields,itemIds:[itemId]});
 publishSession(next.id);
 const newItem = getSession(next.id,true).exercises[0];
 const independent = submitAttempt({exerciseId:newItem.id,requestId:'at-due-date',answer:'Ho preso del pane al mercato.'});
 assert.equal(independent.assisted,false);
 submitFeedback({attemptId:independent.id,result:'correct',correction:independent.answer,explanation:'Phrase naturelle.'});
 assert.equal(journal({},false).items[0].revision.successes,1);
});

test('ordre des mots : permutations validées, doublons équivalents et plusieurs ordres acceptés',t => {
 isolate(t);
 const words = {format:'word_order',tokens:['gatto','un','un','e','Ho','cane'],orders:[[4,1,5,3,2,0],[4,1,0,3,2,5]]};
 const session = (sentence:typeof words) => createSession({requestId:'tokens',...sessionFields,exercises:[{
  type:'sentence',instruction:'Remettez tous les mots en ordre.',items:[{content:'Ordre imposé pour le test.',sentence}],
 }]});
 assert.throws(() => session({...words,orders:[[4,5,1,0,3,3]]}));
 assert.throws(() => session({...words,orders:[[0,1,2,3,4,5]]}),/mélangés/);
 const created = session(words);
 publishSession(created.id);
 const item = getSession(created.id,true).exercises[0];
 assert.ok(item.sentence && !('orders' in item.sentence));
 const input = {exerciseId:item.id,requestId:'tokens-answer'};
 assert.throws(() => submitAttempt({...input,answer:[4,5,1,0,3,1]}),/chaque mot/);
 const wrong = submitAttempt({...input,answer:[0,1,2,3,4,5]});
 assert.equal(wrong.is_correct,0);
 assert.equal(wrong.answerLabel,'gatto un un e Ho cane');
 assert.equal(pending().length,0);
 assert.throws(() => submitFeedback({attemptId:wrong.id,result:'correct',explanation:'Test',correction:'Test'}),/inconnue/);
 const right = submitAttempt({...input,requestId:'tokens-retry',retryOf:wrong.id,answer:[4,2,0,3,1,5]});
 assert.equal(right.is_correct,1);
 assert.equal(right.answerLabel,'Ho un gatto e un cane');
 assert.equal(journal({},false).items[0].history.length,2);
});

test('entraînement libre : mini-dialogue envoyé ensemble, retour par réplique et reprise',t => {
 isolate(t);
 const turns = ['Che cosa desidera?','Vuole anche un caffè?'];
 const group = createBankExercise({requestId:'dialogue',exercise:{type:'sentence',instruction:'Répondez au serveur.',items:[{
  content:'Au bar.',sentence:{format:'dialogue',turns,hints:['Utilisez vorrei.'],rubric:{criteria:'Commander et répondre poliment.'}},
 }]}});
 const series = startPractice({requestId:'dialogue-practice',count:1,itemIds:group.itemIds});
 const draft = {seriesId:series.id,questionId:group.itemIds[0],requestId:'dialogue-answer'};
 assert.deepEqual(revealPracticeHint({...draft,level:1}),{hints:['Utilisez vorrei.']});
 assert.throws(() => answerPractice({...draft,answer:['Vorrei un cornetto.']}));
 const first = answerPractice({...draft,answer:[' Vorrei un cornetto. ','Sì, grazie.']});
 assert.equal(first.correct,null);
 assert.equal(first.explanation,null);
 assert.equal(first.attempt.is_correct,null);
 assert.equal(first.attempt.hintCount,1);
 assert.deepEqual(first.attempt.replies,[' Vorrei un cornetto. ','Sì, grazie.']);
 assert.deepEqual(pending().map(row => 'replies' in row && row.replies),[first.attempt.replies]);
 const feedback = {attemptId:first.attempt.id,result:'correct',correction:'Vorrei un cornetto. Sì, grazie.',explanation:'Échange complet.'};
 assert.throws(() => submitFeedback(feedback),/par réplique/);
 const turnFeedback = [{correction:'Vorrei un cornetto.',explanation:'Commande polie.'},{correction:'Sì, grazie.',explanation:'Réponse naturelle.'}];
 submitFeedback({...feedback,turns:turnFeedback});
 assert.deepEqual(getPracticeSeries(series.id).questions[0].latestAttempt?.feedback?.turns,turnFeedback);
 const retry = answerPractice({...draft,requestId:'dialogue-retry',retryOf:first.attempt.id,answer:['Prendo un cornetto.','No, grazie.']});
 assert.equal(retry.attempt.retryOf,first.attempt.id);
 assert.equal(retry.series.questions[0].sentenceHistory?.length,2);
});
