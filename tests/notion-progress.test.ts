import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/[action]/route';
import { composeSession, createBankExercise, rectifyFeedback, reviseItem } from '../src/server/bank';
import { getSession, publishSession, revealSessionHint, submitAttempt, submitFeedback } from '../src/server/domain';
import { openDatabase } from '../src/server/database.mjs';
import { answerPractice, startPractice } from '../src/server/practice';
import { actOnLesson, createLesson, getStudentLesson, getTeacherLesson, publishLesson } from '../src/server/proactive-lessons';
import { resolveLearningNotion } from '../src/server/learning-signals';

function fixture(t:TestContext) {
 const dir=mkdtempSync(join(tmpdir(),'italiano-notions-'));
 const previous=process.env.ITALIANO_DB_PATH;
 process.env.ITALIANO_DB_PATH=join(dir,'db.sqlite');
 function at(value:string) {t.mock.timers.setTime(Date.parse(value));}
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-03-29T22:05:00Z')});
 t.after(()=>{
  if (previous===undefined) delete process.env.ITALIANO_DB_PATH; else process.env.ITALIANO_DB_PATH=previous;
  rmSync(dir,{recursive:true,force:true});
 });
 return {at};
}

const notion=(name:string)=>resolveLearningNotion({requestId:'notion-'+name,name});
function item(key:string,label:string,kind:'written'|'cloze'|'flashcard'|'guided'|'quiz'='written',extra:string[]=[]){
 const exercise=kind==='cloze' ? {type:'cloze',instruction:'Complétez.',content:'Ieri ___ '+key,answer:{accepted:['sono']}} :
  kind==='flashcard' ? {type:'flashcard',instruction:'Retrouvez le mot.',content:key,answer:{italian:'ciao',example:'Ciao!'}} :
  kind==='guided' ? {type:'sentence',instruction:'Écrivez.',items:[{content:key,sentence:{format:'guided',hints:['Pensez à la forme de politesse.'],rubric:{criteria:'Employer une demande.',example:'Le modèle reste privé.'}}}]} :
  kind==='quiz' ? {type:'questionnaire',instruction:'Choisissez.',items:[{content:key,choices:[{value:'a',label:'Vorrei'},{value:'b',label:'So'}],answer:{value:'a'}}]} :
  {type:'free_text',instruction:'Écrivez.',content:key,answer:{}};
 return createBankExercise({requestId:'item-'+key,notions:[label,...extra],exercise}).itemIds[0];
}

function occurrence(key:string,itemId:string) {
 const {id}=composeSession({requestId:'session-'+key,title:key,objective:'Raconter',scheduledDate:'2026-03-01',itemIds:[itemId]});
 publishSession(id);
 return getSession(id).exercises[0].id;
}
function written(key:string, notionId:string, kind:'error'|'strength', itemId:string, result='correct') {
 const a=submitAttempt({exerciseId:occurrence(key,itemId),requestId:'answer-'+key,answer:'Vorrei una domanda.'});
 submitFeedback({attemptId:a.id,result,correction:'Vorrei chiedere.',explanation:'Retour public.',
  observations:[{notionId,kind,explanation:'Observation interne '+key}]});
 return a;
}
const exposeAuto=(key:string,itemId:string,response='sono')=>{
 const series=startPractice({requestId:'practice-'+key,count:1,itemIds:[itemId],voluntary:true});
 return answerPractice({seriesId:series.id,questionId:itemId,requestId:'answer-'+key,answer:response}).attempt;
};
const get=(action:string,search='')=>GET(new NextRequest('http://localhost/api/'+action+search),{params:Promise.resolve({action})});

test('preuves datées des deux modes, erreur ciblée malgré un verdict correct, rectification et API élève',async t=>{
 fixture(t);
 const {listNotionProgress}=await import('../src/server/notion-progress');
 const n=notion('Politesse');
 notion('Jamais travaillée');
 const a=written('gare',n.id,'strength',item('Demandez un horaire à la gare.',n.name));
 const query=()=>listNotionProgress({notionId:n.id}).notions[0];
 assert.equal(query().status,'assessing');

 const duplicate=written('copie',n.id,'strength',item('Demandez un horaire à la gare !',n.name));
 assert.equal(query().status,'assessing');
 assert.ok(!query().evidence.some(e=>e.attemptId===duplicate.id));

 const b=exposeAuto('café',item('al bar.',n.name,'cloze'));
 assert.equal(query().status,'recent_success');
 assert.deepEqual(new Set(query().prerequisiteEvidenceIds),new Set([a.id,b.id]));
 const published=await get('notion-progress');
 assert.equal(published.status,200);
 const student=await published.json();
 assert.equal(student.notions.length,1);
 assert.equal(student.notions[0].lastEvidenceDate,'2026-03-30');
 assert.doesNotMatch(JSON.stringify(student),/Observation interne|Vorrei chiedere|answerJson|prerequisiteEvidenceIds/);
 const d=openDatabase();
 try {
  const count=d.prepare('SELECT COUNT(*) AS n FROM answer_exposures');
  const before=count.get().n;
  await get('notion-progress');
  assert.equal(count.get().n,before);
 } finally {d.close();}

 const error=written('cabinet',n.id,'error',item('Demandez un rendez-vous au cabinet.',n.name));
 assert.equal(query().status,'needs_work');
 assert.deepEqual(query().prerequisiteEvidenceIds,[]);
 rectifyFeedback({requestId:'rectifier',attemptId:error.id,correction:'La demande était acceptable.',explanation:'La consigne était ambiguë.'});
 assert.equal(query().status,'recent_success');
});

test('aide, auto-évaluation, attente, erreur récurrente et notion à cible multiple',async t=>{
 fixture(t);
 const {listNotionProgress}=await import('../src/server/notion-progress');
 const n=notion('Demander'), other=notion('Commander');
 const guided=item('Demandez un conseil au kiosque.',n.name,'guided');
 const exerciseId=occurrence('guidé',guided);
 revealSessionHint({exerciseId,requestId:'guide',level:1});
 const assisted=submitAttempt({exerciseId,requestId:'guide',answer:'Vorrei un consiglio.'});
 submitFeedback({attemptId:assisted.id,result:'correct',correction:'Vorrei un consiglio.',explanation:'Bonne phrase.',
  observations:[{notionId:n.id,kind:'strength',explanation:'Demande correcte.'}]});
 const memory=item('Bon après-midi',n.name,'flashcard');
 const self=submitAttempt({exerciseId:occurrence('mémoire',memory),requestId:'mémoire',answer:'good'});
 const waiting=submitAttempt({exerciseId:occurrence('en attente',item('Posez une question à la mairie.',n.name)),requestId:'wait',answer:'Vorrei sapere.'});
 const multi=exposeAuto('multi',item('in un ufficio.',n.name,'cloze',[other.name]));
 const quiz=submitAttempt({exerciseId:occurrence('QCM',item('Au téléphone',n.name,'quiz')),requestId:'quiz',answer:'a'});

 const query=()=>listNotionProgress({notionId:n.id}).notions[0];
 assert.equal(query().status,'not_evaluated');
 assert.equal(query().assisted.latest?.attemptId,assisted.id);
 assert.equal(query().selfAssessments.latest?.attemptId,self.id);
 assert.ok(!query().evidence.some(e=>[waiting.id,multi.id,quiz.id].includes(e.attemptId)));
 const publicAttempt=await (await get('attempt-detail','?id='+assisted.id)).json();
 assert.equal(publicAttempt.id,assisted.id);
 assert.doesNotMatch(JSON.stringify(publicAttempt),/Le modèle reste privé|hints|rubric|observations|correction/);
 assert.equal(listNotionProgress({notionId:other.id}).notions[0].status,'not_evaluated');
 const firstPage=listNotionProgress({limit:1});
 const secondPage=listNotionProgress({limit:1,offset:firstPage.nextOffset});
 assert.equal(firstPage.nextOffset,1);
 assert.equal(secondPage.nextOffset,null);
 assert.notEqual(firstPage.notions[0].notionId,secondPage.notions[0].notionId);
 written('erreur-1',n.id,'error',item('Demandez de l’eau pendant le repas.',n.name));
 written('erreur-2',n.id,'error',item('Demandez un billet dans le tram.',n.name));
 assert.equal(query().status,'needs_work');
});

test('fenêtre de 30 jours civils à Rome et conservation des notions par version',async t=>{
 const {at}=fixture(t);
 const {listNotionProgress}=await import('../src/server/notion-progress');
 const a=notion('Formules'), b=notion('Itinéraire');
 at('2026-02-28T23:10:00Z'); // 1 March in Rome, included on 30 March.
 const proof=written('bureau',a.id,'strength',item('Demandez un document au bureau.',a.name));
 const autoId=item('in strada.',a.name,'cloze');
 const auto=exposeAuto('initial',autoId);
 reviseItem({requestId:'retag',itemId:autoId,kind:'pedagogical',instruction:'Complétez.',content:'Domani ___ in stazione.',notions:[b.name]});
 const query=()=>listNotionProgress({notionId:a.id}).notions[0];
 at('2026-03-30T21:59:00Z');
 assert.equal(query().status,'recent_success');
 assert.deepEqual(new Set(query().prerequisiteEvidenceIds),new Set([proof.id,auto.id]));
 assert.equal(listNotionProgress({notionId:b.id}).notions.length,0);
 at('2026-03-30T22:00:00Z');
 assert.equal(query().status,'assessing');
 assert.equal(query().lastEvidenceDate,'2026-03-01');
});

test('next_step exige les preuves du prérequis lors de la création, de la publication et du départ',t=>{
 fixture(t);
 const prereq=notion('Demandes formelles'), target=notion('Décrire un incident');
 const a=written('demande',prereq.id,'strength',item('Demandez un horaire au guichet.',prereq.name));
 const b=exposeAuto('secrétariat',item('al segretariato.',prereq.name,'cloze'));
 const payload={kind:'next_step',prerequisiteNotionId:prereq.id,notionId:target.id,evidenceAttemptIds:[a.id,b.id],
  title:'Décrire un incident',objective:'Expliquer une panne',reason:'Vous savez demander une aide poliment. Expliquez maintenant ce qui est arrivé.',
  itemIds:[item('sul treno.',target.name,'cloze'),item('Racontez un incident en gare.',target.name)],
  reminders:[{title:'Un incident',explanation:'Donnez un événement et sa conséquence.',examples:[{italian:'Il treno si è fermato.',french:'Le train s’est arrêté.'}]}]};
 assert.throws(()=>createLesson({...payload,requestId:'mal-ciblée',prerequisiteNotionId:target.id}),/prérequis/i);
 assert.throws(()=>createLesson({...payload,requestId:'manque-preuve',evidenceAttemptIds:[a.id]}));
 const l=createLesson({...payload,requestId:'progression'});
 assert.deepEqual(createLesson({...payload,requestId:'progression'}),l);
 assert.equal(getTeacherLesson(l.id).prerequisiteNotionId,prereq.id);
 const second=createLesson({...payload,requestId:'autre-progression'});
 publishLesson({lessonId:l.id,requestId:'publish-progression'});
 assert.equal(getStudentLesson(l.id).canStart,true);
 assert.deepEqual(getStudentLesson(l.id).milestones,[]);
 assert.throws(()=>publishLesson({lessonId:second.id,requestId:'publish-autre'}),/occupe déjà/);
 rectifyFeedback({requestId:'remove-strength',attemptId:a.id,correction:'Retour rectifié.',explanation:'Preuve insuffisante.'});
 assert.equal(getStudentLesson(l.id).canStart,false);
 assert.throws(()=>actOnLesson({lessonId:l.id,requestId:'start-now',action:'start'}),/preuves|prérequis/i);
 assert.throws(()=>publishLesson({lessonId:second.id,requestId:'publish-invalide'}),/preuves|prérequis/i);
});
