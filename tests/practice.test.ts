import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSession, getSession, publishSession, submitAttempt } from '../src/server/domain';
import { bank, startPractice, answerPractice, practiceSummary } from '../src/server/practice';
import { openDatabase } from '../src/server/database.mjs';
import { openDatabase as openV5 } from './fixtures/database-v5.mjs';

function fixture() { const dir=mkdtempSync(join(tmpdir(),'italiano-practice-'));process.env.ITALIANO_DB_PATH=join(dir,'db.sqlite');return () => {delete process.env.ITALIANO_DB_PATH;rmSync(dir,{recursive:true,force:true});}; }
const exercises=[{type:'cloze',instruction:'Compléter',objective:'Articles',items:[{content:'Il ___',answer:{accepted:['caffè','café']}},{content:'La ___',answer:{accepted:['città']}}]}];
const input={requestId:'s1',title:'Cours',objective:'Objectif séance',scheduledDate:'2026-01-01',exercises};
test('banque sans fusion automatique, corrigés privés et réponses brutes persistantes', () => {
 const cleanup=fixture();try {
  const s=createSession(input);assert.equal(bank().length,0);publishSession(s.id);
  const other=createSession({...input,requestId:'s2'});publishSession(other.id);assert.equal(bank().length,4);
  const series=startPractice({requestId:'series',count:10});assert.equal(series.questions.length,4);assert.ok(!JSON.stringify(series).includes('caffè'));
  assert.deepEqual(startPractice({requestId:'series',count:10}),series);
  const question=series.questions.find(q=>q.content==='Il ___')!;
  const request={seriesId:series.id,questionId:question.id,requestId:'answer',answer:' CAFFE\u0300 '};
  const result=answerPractice(request);assert.equal(result.correct,true);assert.equal(result.attempt.answer,request.answer);
  assert.deepEqual(answerPractice(request),result);assert.throws(()=>answerPractice({...request,answer:'wrong'}));
  assert.equal(practiceSummary().questionStats.find(q=>q.id===question.id)?.attempts,1);
 } finally {cleanup();}
});
test('sélection ciblée, nouvelles séries respectant échéances et pratique volontaire', () => {
 const cleanup=fixture();try {
  const s=createSession(input);publishSession(s.id);
  const ids=getSession(s.id).exercises.map((e:Record<string,unknown>)=>String(e.id));
  submitAttempt({exerciseId:ids[0],requestId:'session-success',answer:'caffè'});
  const automatic=startPractice({requestId:'due',count:1});assert.equal(automatic.questions.length,1);assert.equal(automatic.questions[0].id,ids[1]);
  const voluntary=startPractice({requestId:'all',count:1,itemIds:[ids[0]],voluntary:true});assert.equal(voluntary.questions[0].id,ids[0]);
  assert.throws(()=>startPractice({requestId:'all',count:1,itemIds:[ids[1]],voluntary:true}));
  assert.throws(()=>startPractice({requestId:'unknown',count:1,itemIds:['missing']}));
 } finally {cleanup();}
});
test('questionnaire : choix vérifiés, essais multiples et dernier résultat repris', () => {
 const cleanup=fixture();try {
  const s=createSession({requestId:'quiz',title:'Quiz',objective:'Piacere',scheduledDate:'2026-01-01',exercises:[{type:'questionnaire',instruction:'Choisissez',items:[{content:'Question A',choices:[{value:'a',label:'uno'},{value:'b',label:'due'}],answer:{value:'b'},explanation:'secret'}]}]});publishSession(s.id);
  const series=startPractice({requestId:'quiz-series',count:1});assert.ok(!JSON.stringify(series).includes('secret'));
  const q=series.questions[0];assert.throws(()=>answerPractice({seriesId:series.id,questionId:q.id,requestId:'invalid',answer:'z'}));
  assert.throws(()=>answerPractice({seriesId:series.id,questionId:q.id,requestId:'invalid-mode',answer:'0',mode:'memory'}));
  assert.equal(answerPractice({seriesId:series.id,questionId:q.id,requestId:'wrong',answer:'0'}).correct,false);
  assert.equal(answerPractice({seriesId:series.id,questionId:q.id,requestId:'retry',answer:'1'}).correct,true);
  const resumed=startPractice({requestId:'quiz-series',count:1});assert.equal(resumed.questions[0].latestAttempt?.answer,'1');assert.equal(resumed.questions[0].revision.successes,0);
  assert.equal(practiceSummary().questionStats[0].attempts,2);
 } finally {cleanup();}
});
test('banque volumineuse : cible exacte et limite de nouveautés suggérées', () => {
 const cleanup=fixture();try {
  const s=createSession({...input,exercises:Array.from({length:100},(_,i)=>({type:'cloze',instruction:'Complétez',content:`${i} ___`,answer:{accepted:['ciao']}}))});publishSession(s.id);
  assert.equal(startPractice({requestId:'suggested',count:100}).questions.length,5);
  assert.equal(startPractice({requestId:'voluntary',count:100,voluntary:true}).questions.length,100);
  assert.equal(startPractice({requestId:'one',count:1,voluntary:true}).questions.length,1);
 } finally {cleanup();}
});
test('migration additive depuis le schéma 3, sans toucher au vocabulaire', () => {
 const cleanup=fixture();try {
  const path=process.env.ITALIANO_DB_PATH!;
  let d=openV5(path);d.prepare('INSERT INTO vocabulary VALUES (?,?,?,?,?,?,?)').run('keep','caffè','café','un caffè','un café','bar','test');
  d.exec('DROP TABLE practice_attempts; DROP TABLE practice_questions; DROP TABLE practice_series; DELETE FROM schema_migrations WHERE version>=4');d.close();
  d=openDatabase(path);assert.equal(d.prepare('SELECT italian FROM vocabulary WHERE id=?').get('keep')?.italian,'caffè');assert.equal(d.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n,11);assert.deepEqual(d.prepare('PRAGMA foreign_key_check').all(),[]);d.close();
 } finally {cleanup();}
});
