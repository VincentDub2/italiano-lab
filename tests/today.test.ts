import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/server/database.mjs';
import { composeSession, createBankExercise, rectifyFeedback, searchBank } from '../src/server/bank';
import { createSession, getSession, publishSession, submitAttempt, submitFeedback } from '../src/server/domain';
import { actOnLesson, createLesson, getStudentLesson, publishLesson } from '../src/server/proactive-lessons';

function fixture(t: TestContext) {
 const dir = mkdtempSync(join(tmpdir(),'italiano-today-'));
 const oldDb = process.env.ITALIANO_DB_PATH, oldExternal = process.env.ITALIANO_REMINDERS_PATH;
 process.env.ITALIANO_DB_PATH = join(dir,'test.sqlite');
 const external = process.env.ITALIANO_REMINDERS_PATH = join(dir,'revisions.json');
 const now = new Date('2026-03-28T23:20:00Z'); // 29 March in Rome.
 t.mock.timers.enable({apis:['Date'],now});
 t.after(()=>{
  if (oldDb===undefined) delete process.env.ITALIANO_DB_PATH; else process.env.ITALIANO_DB_PATH=oldDb;
  if (oldExternal===undefined) delete process.env.ITALIANO_REMINDERS_PATH; else process.env.ITALIANO_REMINDERS_PATH=oldExternal;
  rmSync(dir,{recursive:true,force:true});
 });
 return {now,external};
}
function session(key: string, day: string, open = true) {
 const {id}=createSession({requestId:key,title:key,objective:'Raconter',scheduledDate:day,exercises:open ?
  [{type:'free_text',instruction:'Racontez.',content:'Décrivez '+key,answer:{}}] :
  [{type:'cloze',instruction:'Complétez.',content:'Io ___ '+key,answer:{accepted:['sono']}}]});
 publishSession(id);
 return {id,exerciseId:getSession(id).exercises[0].id};
}
function answer(exerciseId:string,key:string, answer='Sono in viaggio.') {
 return submitAttempt({exerciseId,requestId:key,answer});
}
function correct(attemptId:string,retry=false) {
 submitFeedback({attemptId,result:'partial',correction:'Sono in viaggio.',explanation:'Relisez le temps utilisé.',retry});
}

test('projection sans mutation, correction exacte à lire, rejeu et nouvelle rectification',async t=>{
 const {now}=fixture(t);
 const {getToday}=await import('../src/server/today');
 const {getStudentCorrection,markCorrectionRead}=await import('../src/server/student-corrections');
 const future=session('Future','2026-03-30');
 const recent=session('Séance prête','2026-03-29');
 const production=session('Production','2026-03-28');
 const a=answer(production.exerciseId,'written');
 assert.notEqual((await getToday(now)).primaryAction?.targetId,production.id);
 correct(a.id,true);
 const db=openDatabase();
 const snapshot=()=>['learning_attempts','answer_exposures','revision_state','proactive_milestones'].map(name=>db.prepare('SELECT * FROM '+name).all());
 try {
  const before=snapshot();
  const board=await getToday(now);
  assert.equal(board.date,'2026-03-29');
  assert.equal(board.primaryAction?.kind,'correction');
  assert.equal(board.primaryAction?.targetId,a.id);
  assert.notEqual(board.primaryAction?.targetId,future.id);
  assert.doesNotMatch(JSON.stringify(board),/Sono in viaggio|Relisez le temps|answer_json/);
  const detail=getStudentCorrection(a.id);
  assert.equal(detail.attempt.answer,'Sono in viaggio.');
  assert.equal(detail.read,false);
  assert.equal(getStudentCorrection(a.id).read,false);
  markCorrectionRead({attemptId:a.id,version:detail.version},now);
  markCorrectionRead({attemptId:a.id,version:detail.version},now);
  assert.equal(getStudentCorrection(a.id).read,true);
  assert.equal((await getToday(now)).primaryAction?.targetId,recent.id);
  rectifyFeedback({requestId:'rectify-today',attemptId:a.id,correction:'Sono partito.',explanation:'Le verdict est à revoir.'});
  const rectified=getStudentCorrection(a.id);
  assert.notEqual(rectified.version,detail.version);
  assert.equal(rectified.read,false);
  markCorrectionRead({attemptId:a.id,version:detail.version},now);
  assert.equal(getStudentCorrection(a.id).read,false);
  assert.equal((await getToday(now)).primaryAction?.targetId,a.id);
  const after=snapshot();
  assert.deepEqual(after[0],before[0]);
  assert.deepEqual(after[1],before[1]);
  assert.deepEqual(after[3],before[3]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM correction_reads').get().n,1);
 } finally {db.close();}
});

function bank(key:string, closed=false) {
 return createBankExercise({requestId:key,notions:['Temps du récit'],exercise:closed ?
  {type:'cloze',instruction:'Complétez.',content:'Ieri ___ '+key,answer:{accepted:['sono andato']}} :
  {type:'free_text',instruction:'Racontez.',content:'Racontez '+key,answer:{}}}).itemIds[0];
}

function lesson(key:string) {
 const notionId=searchBank({notion:'Temps du récit'})[0]?.notions[0].id ||
  createBankExercise({requestId:'notion-base',notions:['Temps du récit'],exercise:{type:'cloze',instruction:'Complétez.',content:'Io ___ oggi.',answer:{accepted:['sono']}}}) && searchBank({notion:'Temps du récit'})[0].notions[0].id;
 const evidenceAttemptIds=['-a','-b'].map(suffix=>{
  const s=session(key+suffix,'2026-03-28');
  const a=answer(s.exerciseId,'proof-'+key+suffix);
  submitFeedback({attemptId:a.id,result:'partial',correction:'Sono arrivato.',explanation:'Action ponctuelle.',
   observations:[{notionId,kind:'error',explanation:'Le temps de l’action ponctuelle est à revoir.'}]});
  return a.id;
 });
 const draft=createLesson({requestId:'create-'+key,notionId,title:key,objective:'Raconter',reason:'Le récit confond les temps.',
  evidenceAttemptIds,itemIds:[bank(key+'-fermé',true),bank(key+'-ouvert')],
  reminders:[{title:'Deux temps',explanation:'Distinguez le contexte et l’action.',examples:[{italian:'Sono arrivato.',french:'Je suis arrivé.'}]}]});
 publishLesson({lessonId:draft.id,requestId:'publish-'+key});
 return draft;
}

test('J0 actionnable, J0 en attente, puis priorité au jalon lié du jour sur un retour récent',async t=>{
 const {now,external}=fixture(t);
 const {getToday}=await import('../src/server/today');
 const d=lesson('Les temps du récit');
 actOnLesson({lessonId:d.id,requestId:'start-lesson',action:'start'});
 assert.equal((await getToday(now)).primaryAction?.kind,'resume-lesson');
 const [closed,open]=getSession(d.sessionId).exercises;
 answer(closed.id,'closed','sono andato');
 const a=answer(open.id,'open');
 let today=await getToday(now);
 assert.notEqual(today.primaryAction?.kind,'resume-lesson');
 assert.ok(today.notices.some(n=>n.kind==='lesson-pending'));
 assert.equal(getStudentLesson(d.id).milestones.length,0);
 correct(a.id);
 const [j1]=getStudentLesson(d.id).milestones;
 const distinctNotionFixture = session('Retour indépendant','2026-03-29');
 const c=answer(distinctNotionFixture.exerciseId,'independent');
 correct(c.id);
 t.mock.timers.setTime(new Date('2026-03-29T22:20:00Z').getTime());
 writeFileSync(external,JSON.stringify({themes:[{titre:'Les temps du récit',dates:{J1:j1.date}}]}));
 today=await getToday(new Date());
 assert.ok(today.revisions.some(r=>r.id===j1.id && r.status==='unscheduled'));
 assert.ok(today.revisions.some(r=>r.source==='external' && r.status==='external'));
 const work=composeSession({requestId:'target-j1',title:'En voyage',objective:'Raconter un contretemps',scheduledDate:j1.date,
  itemIds:[bank('autre-position',true),bank('activité-liée',true),bank('nouveau-texte')],revisionLinks:[{milestoneId:j1.id,positions:[1]}]});
 publishSession(work.id);
 today=await getToday(new Date());
 assert.equal(today.primaryAction?.kind,'revision');
 assert.equal(today.primaryAction?.targetId,work.id);
 assert.equal(today.primaryAction?.occurrenceId,getSession(work.id).exercises[1].id);
 assert.ok(today.secondaryActions.some(a=>a.kind==='correction'));
 assert.equal(getStudentLesson(d.id).milestones[0].completedAt,null);
 writeFileSync(external,'{');
 today=await getToday(new Date());
 assert.equal(today.primaryAction?.kind,'revision');
 assert.ok(today.notices.some(n=>n.kind==='external-unavailable'));
});

test('fenêtre de rattrapage, retour ancien, simulation et budget rempli',async t=>{
 const {now}=fixture(t);
 const {getToday}=await import('../src/server/today');
 t.mock.timers.setTime(Date.parse('2026-03-20T12:00:00Z'));
 const old=session('Ancien retour','2026-03-20');
 correct(answer(old.exerciseId,'older-text').id);
 t.mock.timers.setTime(now.getTime());
 session('Trop ancienne','2026-03-22',false);
 session('Prévue demain','2026-03-30',false);
 const demonstration=createSession({requestId:'demo-today',title:'Démo',objective:'Saluer',scheduledDate:'2026-03-29',
  exercises:[{type:'cloze',instruction:'Complétez.',content:'___ !',answer:{accepted:['ciao']}}]},'demo');
 publishSession(demonstration.id);
 const ready=session('Rattrapage récent','2026-03-23',false);
 assert.equal((await getToday(now)).primaryAction?.targetId,ready.id);
 for (let i=0;i<70;i++) answer(ready.exerciseId,'trained-'+i,'sono');
 const board=await getToday(now);
 assert.equal(board.primaryAction,null);
 assert.equal(board.dailyComplete,true);
 assert.ok(board.notices.some(n=>n.kind==='external-unavailable'));
});
