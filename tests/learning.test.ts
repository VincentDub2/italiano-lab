import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSession, getSession, publishSession, submitAttempt } from '../src/server/domain';
import { startPractice, answerPractice, bank } from '../src/server/practice';
import { journal, learningOverview } from '../src/server/learning';
import { createBankExercise, composeSession, reviseItem, rectifyFeedback } from '../src/server/bank';

test('banque réutilisable, historique commun, carnet et versions immuables', () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-learning-'));
 process.env.ITALIANO_DB_PATH = join(dir, 'db.sqlite');
 try {
  const input = { requestId: 'bank', exercise: { type: 'cloze', instruction: 'Complétez.', objective: 'Piacere', items: [{ content: 'Mi ___ i gatti.', answer: { accepted: ['piacciono'] }, explanation: 'Pluriel.' }, { content: 'A Luca ___ la musica.', answer: { accepted: ['piace'] } }] }, notions: ['Piacere'] };
  const group = createBankExercise(input);
  assert.deepEqual(createBankExercise(input), group);
  assert.throws(() => createBankExercise({ ...input, notions: ['Autre'] }));
  const session = composeSession({ requestId: 'compose', title: 'Cours', objective: 'Piacere', scheduledDate: '2026-01-01', itemIds: [group.itemIds[0]] });
  assert.equal(bank().length,2,'Un brouillon qui référence la banque ne masque pas ses items.');
  publishSession(session.id);
  const occurrence = getSession(session.id).exercises[0];
  const wrong = submitAttempt({ exerciseId: occurrence.id, requestId: 'wrong', answer: ' piace ' });
  assert.equal(wrong.answer, ' piace ');
  const errors = journal({}, false);
  assert.equal(errors.items.length, 1);
  assert.equal(errors.items[0].history[0].answer, ' piace ');
  assert.equal(errors.items[0].revision.state, 'rework');
  const series = startPractice({ requestId: 'focused', count: 1, itemIds: [group.itemIds[0]], voluntary: true });
  assert.equal(series.questions[0].id, group.itemIds[0]);
  assert.equal(answerPractice({ seriesId: series.id, questionId: group.itemIds[0], requestId: 'after-correction', answer: 'piacciono' }).correct, true);
  assert.equal(journal({}, false).items[0].revision.successes, 0);
  assert.equal(journal({}, false).items[0].history.length, 2);
  assert.equal(learningOverview().workedSeconds, 60);
  const changed = reviseItem({ requestId: 'change', itemId: group.itemIds[0], kind: 'pedagogical', content: 'Mi ___ il gatto.', answer: { accepted: ['piace'] }, explanation: 'Singulier.' });
  assert.ok(changed.versionId);
  assert.equal(getSession(session.id).exercises[0].content, 'Mi ___ i gatti.');
  assert.equal(journal({}, false).items[0].history[0].content, 'Mi ___ i gatti.');
  rectifyFeedback({ requestId: 'rectify', attemptId: String(wrong.id), correction: 'Ancien corrigé invalide.', explanation: 'Neutralisation.' });
  assert.equal(journal({}, false).items[0].history.find(a => a.id === wrong.id)?.neutralized, true);
  const standalone = createSession({ requestId: 'legacy-format', title: 'Cours', objective: 'Test', scheduledDate: '2026-01-01', exercises: [{ type: 'cloze', instruction: 'Complétez', content: 'Io ___', answer: { accepted: ['parlo'] } }] });
  assert.ok(standalone.id);
 } finally { delete process.env.ITALIANO_DB_PATH; rmSync(dir, { recursive: true, force: true }); }
});

test('parcours daté commun : erreurs, nouvel essai, J1/J4/J11, rechute et budget', async t => {
 const dir=mkdtempSync(join(tmpdir(),'italiano-dated-'));process.env.ITALIANO_DB_PATH=join(dir,'db.sqlite');
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-01-01T12:00:00Z')});
 try {
  const group=createBankExercise({requestId:'dated-bank',exercise:{type:'cloze',instruction:'Complétez',items:Array.from({length:4},(_,i)=>({content:`${i} ___`,answer:{accepted:['ciao']}}))}});
  const source=composeSession({requestId:'dated-session',title:'Cours',objective:'Test',scheduledDate:'2026-01-01',itemIds:group.itemIds});publishSession(source.id);
  const occurrence=String(getSession(source.id).exercises[0].id);
  submitAttempt({exerciseId:occurrence,requestId:'dated-wrong',answer:'non'});
  const series=startPractice({requestId:'dated-series',count:4,voluntary:true});
  for (const item of series.questions.filter(q=>q.id!==group.itemIds[0])) answerPractice({seriesId:series.id,questionId:item.id,requestId:'other-'+item.id,answer:'ciao'});
  // La reprise conserve le carnet et les questions ; le réessai automatique est limité au contexte de sa première erreur.
  const sessionCopy=composeSession({requestId:'retry-session',title:'Réessai',objective:'Test',scheduledDate:'2026-01-01',itemIds:group.itemIds});publishSession(sessionCopy.id);
  const retryItems=getSession(sessionCopy.id).exercises;
  for (let i=0;i<4;i++) submitAttempt({exerciseId:retryItems[i].id,requestId:'sequence-'+i,answer:i===0?'non':'ciao'});
  assert.equal(getSession(sessionCopy.id,true).exercises[0].retryReady,true);
  submitAttempt({exerciseId:retryItems[0].id,requestId:'sequence-retry',answer:'ciao'});
  assert.equal(getSession(sessionCopy.id,true).exercises[0].retryReady,false);
  assert.equal(journal({},false).items[0].revision.successes,0);
  for (const [day,next,successes] of [['2026-01-02','2026-01-05',1],['2026-01-05','2026-01-12',2],['2026-01-12','2026-01-26',3]] as const) {
   t.mock.timers.setTime(new Date(day+'T12:00:00Z').getTime());
   const nextSeries=startPractice({requestId:day,count:1,itemIds:[group.itemIds[0]]});
   assert.equal(nextSeries.questions.length,1);
   answerPractice({seriesId:nextSeries.id,questionId:group.itemIds[0],requestId:'success-'+day,answer:'ciao'});
   const entry=journal({},false).items.find(x=>x.item_id===group.itemIds[0])!;
   assert.equal(entry.revision.successes,successes);assert.equal(entry.revision.due,next);
  }
  assert.equal(journal({view:'active'},false).items.length,0);
  assert.equal(journal({view:'history'},false).items[0].revision.state,'consolidated');
  assert.equal(startPractice({requestId:'not-due',count:1,itemIds:[group.itemIds[0]]}).questions.length,0);
  const relapse=startPractice({requestId:'relapse',count:1,itemIds:[group.itemIds[0]],voluntary:true});
  answerPractice({seriesId:relapse.id,questionId:group.itemIds[0],requestId:'relapse-answer',answer:'non'});
  assert.equal(journal({},false).items[0].revision.due,'2026-01-13');
  assert.equal(journal({},false).items[0].revision.successes,0);
 } finally {t.mock.timers.reset();delete process.env.ITALIANO_DB_PATH;rmSync(dir,{recursive:true,force:true});}
});

test('réponse libre différée, rectification, brouillon et journée déjà remplie', async t => {
 const {submitFeedback,getAttempt}=await import('../src/server/domain');
 const {updateDraft,dailyPlan}=await import('../src/server/bank');
 const dir=mkdtempSync(join(tmpdir(),'italiano-feedback-'));process.env.ITALIANO_DB_PATH=join(dir,'db.sqlite');
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-01-01T12:00:00Z')});
 try {
  const group=createBankExercise({requestId:'free-bank',exercise:{type:'free_text',instruction:'Écrivez',items:[{content:'Présentez-vous',answer:{}}]}});
  const session=composeSession({requestId:'free-compose',title:'Écrire',objective:'Test',scheduledDate:'2026-01-01',itemIds:group.itemIds});
  updateDraft({requestId:'draft-update',sessionId:session.id,title:'Titre modifié',objective:'Test',scheduledDate:'2026-01-02',itemIds:group.itemIds});
  assert.equal(getSession(session.id).title,'Titre modifié');publishSession(session.id);
  assert.throws(()=>updateDraft({requestId:'bad-draft',sessionId:session.id,title:'Interdit',objective:'Test',scheduledDate:'2026-01-02',itemIds:group.itemIds}));
  const item=String(getSession(session.id).exercises[0].id);
  const attempt=submitAttempt({exerciseId:item,requestId:'free-answer',answer:'Io sono una guida'});
  assert.equal(startPractice({requestId:'wait',count:1,itemIds:group.itemIds,voluntary:true}).questions.length,0);
  t.mock.timers.setTime(new Date('2026-01-10T12:00:00Z').getTime());
  submitFeedback({attemptId:attempt.id,result:'partial',correction:'Sono una guida.',explanation:'Sujet facultatif.'});
  assert.equal(journal({},false).items[0].revision.due,'2026-01-11');
  rectifyFeedback({requestId:'undo',attemptId:attempt.id,correction:'La première réponse était acceptable.',explanation:'Neutraliser ce verdict.'});
  assert.equal(getAttempt(attempt.id).neutralized,true);assert.equal(journal({},false).items[0].revision.state,'evaluate');
  assert.equal(journal({},false).items[0].revision.successes,0);
  assert.equal(dailyPlan().remainingSeconds,2100);
  // Productions de trois minutes : l’ancien seuil ne termine plus la journée.
  for(let i=0;i<12;i++) {
   const s=startPractice({requestId:'budget-'+i,count:1,itemIds:group.itemIds,voluntary:true});
   const a=answerPractice({seriesId:s.id,questionId:group.itemIds[0],requestId:'budget-answer-'+i,answer:'Sono una guida.'});
   submitFeedback({attemptId:a.attempt.id,result:'correct',correction:'Sono una guida.',explanation:'Correct.'});
   if(i===4) assert.equal(dailyPlan().outcome,'session_needed');
  }
  assert.equal(learningOverview().workedSeconds,2160);assert.equal(dailyPlan().outcome,'daily_complete');assert.equal(dailyPlan().items.length,0);
 } finally {t.mock.timers.reset();delete process.env.ITALIANO_DB_PATH;rmSync(dir,{recursive:true,force:true});}
});

test('variante indépendante, coquille, doublons de mutation et exposition persistante', async t => {
 const {searchBank}=await import('../src/server/bank');
 const {revealVocabulary,vocabulary}=await import('../src/server/domain');
 const dir=mkdtempSync(join(tmpdir(),'italiano-variant-'));process.env.ITALIANO_DB_PATH=join(dir,'db.sqlite');
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-01-01T12:00:00Z')});
 try {
  const group=createBankExercise({requestId:'original',notions:['Piacere'],exercise:{type:'cloze',instruction:'Complétez',items:[{content:'Mi ___ i gatti.',answer:{accepted:['piacciono']}}]}});
  const variant=createBankExercise({requestId:'variant',originItemId:group.itemIds[0],notions:['Piacere'],exercise:{type:'cloze',instruction:'Complétez',items:[{content:'A Luca ___ la musica.',answer:{accepted:['piace']}}]}});
  assert.equal(searchBank({notion:'Piacere'}).find(x=>x.item_id===variant.itemIds[0])?.origin_id,group.itemIds[0]);
  const series=startPractice({requestId:'variant-series',count:1,itemIds:variant.itemIds});
  answerPractice({seriesId:series.id,questionId:variant.itemIds[0],requestId:'variant-success',answer:'piace'});
  assert.equal(searchBank({}).find(x=>x.item_id===group.itemIds[0])?.revision.state,'evaluate');
  const old=searchBank({}).find(x=>x.item_id===variant.itemIds[0])!;
  reviseItem({requestId:'typo',itemId:variant.itemIds[0],kind:'typo',content:'A Luca ___ la musica!'});
  assert.deepEqual(searchBank({}).find(x=>x.item_id===variant.itemIds[0])?.revision,old.revision);
  assert.throws(()=>reviseItem({requestId:'bad-typo',itemId:variant.itemIds[0],kind:'typo',content:'A Luca ___ la musica.',answer:{accepted:['piacciono']}}));
  assert.throws(()=>composeSession({requestId:'rollback-compose',title:'Invalide',objective:'Test',scheduledDate:'2026-01-01',itemIds:['missing']}));
  assert.ok(composeSession({requestId:'rollback-compose',title:'Valide',objective:'Test',scheduledDate:'2026-01-01',itemIds:variant.itemIds}).id);
  const flash=createSession({requestId:'flash-exposure',title:'Mot',objective:'Mot',scheduledDate:'2026-01-01',exercises:[{type:'flashcard',instruction:'Traduire',content:'Bonjour',answer:{italian:'ciao',example:'Ciao!'}}]});publishSession(flash.id);
  const flashId=String(getSession(flash.id).exercises[0].id);
  submitAttempt({exerciseId:flashId,requestId:'memory-1',answer:'good'});
  submitAttempt({exerciseId:flashId,requestId:'memory-2',answer:'again'});
  submitAttempt({exerciseId:flashId,requestId:'memory-1',answer:'good'});
  assert.equal(vocabulary().reviews['session:'+flashId].reviewCount,2);
  assert.equal(vocabulary().reviews['session:'+flashId].rating,'again');
  revealVocabulary('session:'+flashId);
  assert.equal(submitAttempt({exerciseId:flashId,requestId:'translation',answer:'ciao',mode:'translation'}).assisted,true);
 } finally {t.mock.timers.reset();delete process.env.ITALIANO_DB_PATH;rmSync(dir,{recursive:true,force:true});}
});
