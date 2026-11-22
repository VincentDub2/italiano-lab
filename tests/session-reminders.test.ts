import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSession, getSession, publishSession, listSessions } from '../src/server/domain.ts';
import { createBankExercise, composeSession, updateDraft } from '../src/server/bank.ts';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/[action]/route.ts';

const cards = [{title:'Essere',explanation:'Pour parler de soi.',examples:[{italian:'Sono di Roma.',french:'Je suis de Rome.'}]}];
const input = {requestId:'reminders',title:'Séance',objective:'Italien',scheduledDate:'2026-01-01',exercises:[{type:'cloze',instruction:'Compléter',content:'Io ___',answer:{accepted:['sono']}}]};
test('les rappels sont visibles avant et après publication sans modifier la progression',()=>{
 const dir=mkdtempSync(join(tmpdir(),'session-reminders-')); process.env.ITALIANO_DB_PATH=join(dir,'db.sqlite');
 try {
  const session=createSession({...input,reminders:cards});
  assert.deepEqual(getSession(session.id).reminders,cards);
  const before=listSessions()[0];
  publishSession(session.id);
  assert.deepEqual(getSession(session.id,true).reminders,cards);
  const after=listSessions()[0];
  assert.equal(after.total,before.total); assert.equal(after.completed,before.completed); assert.equal(after.pending,before.pending);
 } finally {rmSync(dir,{recursive:true,force:true}); delete process.env.ITALIANO_DB_PATH;}
});

test('validation, édition, historique et API élève',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'session-reminders-')); process.env.ITALIANO_DB_PATH=join(dir,'db.sqlite');
 try {
  const old=createSession({...input,requestId:'old'});
  assert.deepEqual(getSession(old.id).reminders,[]);
  for (const reminders of [Array(4).fill(cards[0]),[{...cards[0],examples:[]}],[{...cards[0],title:' '}],[{...cards[0],examples:[{italian:'ciao',french:' '}]}]]) {
   assert.throws(()=>createSession({...input,requestId:'invalid',reminders}));
  }
  const bank=createBankExercise({requestId:'bank',exercise:input.exercises[0]});
  const composed=composeSession({requestId:'compose',title:input.title,objective:input.objective,scheduledDate:input.scheduledDate,itemIds:bank.itemIds,reminders:cards});
  const edit={sessionId:composed.id,title:input.title,objective:input.objective,scheduledDate:input.scheduledDate,itemIds:bank.itemIds};
  assert.deepEqual(getSession(composed.id).reminders,cards);
  updateDraft({...edit,requestId:'keep'}); assert.deepEqual(getSession(composed.id).reminders,cards);
  updateDraft({...edit,requestId:'clear',reminders:[]}); assert.deepEqual(getSession(composed.id).reminders,[]);
  updateDraft({...edit,requestId:'replace',reminders:cards}); publishSession(composed.id);
  assert.throws(()=>updateDraft({...edit,requestId:'late',reminders:[]}));
  assert.deepEqual(getSession(composed.id).reminders,cards);
  const response=await GET(new NextRequest(`http://localhost:3211/api/session?id=${composed.id}`),{params:Promise.resolve({action:'session'})});
  assert.deepEqual((await response.json()).reminders,cards);
 } finally {rmSync(dir,{recursive:true,force:true}); delete process.env.ITALIANO_DB_PATH;}
});
