import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/[action]/route.ts';
import { createSession, publishSession } from '../src/server/domain.ts';
test('routes élève : secrets, brouillons, origine et absence de retour public',async()=>{const dir=mkdtempSync(join(tmpdir(),'data-test-'));process.env.ITALIANO_DB_PATH=join(dir,'test.sqlite');try {const s=createSession({requestId:'security',title:'Test',objective:'Test',scheduledDate:'2026-01-01',exercises:[{type:'cloze',instruction:'Question',content:'...',answer:{accepted:['secret']},explanation:'explication secrète'}]}); const id=String(s.id); const exercise=String((await import('../src/server/domain.ts')).getSession(id).exercises[0].id); const context=(action:string)=>({params:Promise.resolve({action})}); const get=async(action:string,query='')=>GET(new NextRequest(`http://localhost:3211/api/${action}${query}`),context(action)); const post=async(action:string,body:unknown,origin='http://localhost:3211')=>POST(new NextRequest(`http://localhost:3211/api/${action}`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),context(action)); assert.equal((await get('session','?id='+id)).status,400); assert.equal((await post('attempt',{exerciseId:exercise,requestId:'1',answer:'x'})).status,400);publishSession(id); const response=await get('session','?id='+id);const payload=await response.text();assert.ok(!payload.includes('secret'));assert.equal((await post('attempt',{exerciseId:exercise,requestId:'1',answer:'x'},'http://evil.test')).status,403);assert.equal((await post('submit_feedback',{})).status,404);}finally{rmSync(dir,{recursive:true,force:true});delete process.env.ITALIANO_DB_PATH;}});

test('entraînement : origine, corrigés privés et réponse enregistrée',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'data-test-'));process.env.ITALIANO_DB_PATH=join(dir,'test.sqlite');
 try {
  const s=createSession({requestId:'practice-api',title:'Test',objective:'Test',scheduledDate:'2026-01-01',exercises:[{type:'cloze',instruction:'Compléter',content:'Il ___',answer:{accepted:['caffè']},explanation:'secret'}]});publishSession(String(s.id));
  const context=(action:string)=>({params:Promise.resolve({action})});
  const get=(action:string)=>GET(new NextRequest(`http://localhost:3211/api/${action}`),context(action));
  const post=(action:string,body:unknown,origin='http://localhost:3211')=>POST(new NextRequest(`http://localhost:3211/api/${action}`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),context(action));
  const listing=await (await get('practice-bank')).text(); assert.ok(!listing.includes('caffè')); assert.ok(!listing.includes('secret'));
  assert.equal((await post('practice-start',{requestId:'r',count:1},'http://evil.test')).status,403);
  const response=await post('practice-start',{requestId:'r',count:1});const raw=await response.text(); assert.ok(!raw.includes('caffè'));assert.ok(!raw.includes('secret'));const series=JSON.parse(raw);
  const answer=await post('practice-answer',{seriesId:series.id,questionId:series.questions[0].id,requestId:'a',answer:'caffè'});assert.equal((await answer.json()).correct,true);
  const session=await (await GET(new NextRequest(`http://localhost:3211/api/session?id=${s.id}`),context('session'))).json(); assert.equal(session.exercises[0].latestAttempt,null);
 } finally {rmSync(dir,{recursive:true,force:true});delete process.env.ITALIANO_DB_PATH;}
});

test('retour de difficulté : séance terminée, dernière réponse conservée et suivi intact',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'italiano-session-difficulty-'));
 process.env.ITALIANO_DB_PATH=join(dir,'test.sqlite');
 try {
  const {id:sessionId}=createSession({requestId:'difficulty',title:'Saluer',objective:'Dire bonjour',scheduledDate:'2026-01-01',exercises:[{type:'cloze',instruction:'Complétez',content:'___ Marco',answer:{accepted:['ciao']}}]});
  const context=(action:string)=>({params:Promise.resolve({action})});
  const get=async(action:string,query='')=>(await GET(new NextRequest(`http://localhost:3211/api/${action}${query}`),context(action))).json();
  const post=(action:string,body:unknown,origin='http://localhost:3211')=>POST(new NextRequest(`http://localhost:3211/api/${action}`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),context(action));
  const readSession=()=>get('session','?id='+sessionId);
  const vote=(difficulty:string)=>post('session-difficulty',{sessionId,difficulty});
  assert.equal((await vote('too_easy')).status,400);
  publishSession(sessionId);
  const session=await readSession();
  assert.equal(session.difficulty_feedback,null);
  assert.equal((await vote('too_easy')).status,400);
  assert.equal((await post('attempt',{requestId:'difficulty-attempt',exerciseId:session.exercises[0].id,answer:'ciao'})).status,200);
  const before=await readSession();
  const progress=await get('learning-overview');
  assert.equal((await vote('invalid')).status,400);
  assert.equal((await post('session-difficulty',{sessionId,difficulty:'too_easy'},'http://evil.test')).status,403);
  for (const difficulty of ['too_easy','just_right','too_hard','too_hard']) {
   assert.deepEqual(await (await vote(difficulty)).json(),{difficulty_feedback:difficulty});
  }
  assert.deepEqual(await readSession(),{...before,difficulty_feedback:'too_hard'});
  assert.deepEqual(await get('learning-overview'),progress);
 } finally {rmSync(dir,{recursive:true,force:true});delete process.env.ITALIANO_DB_PATH;}
});
