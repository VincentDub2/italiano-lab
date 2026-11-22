import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/[action]/route.ts';
import { createV6 } from './fixtures/database-v6.mjs';
import { openDatabase } from '../src/server/database.mjs';

test('la démo V6 préexistante reste inchangée lors des appels répétés aux routes', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-demo-migration-'));
 const previous = process.env.ITALIANO_DB_PATH;
 const path = join(dir, 'test.sqlite');
 process.env.ITALIANO_DB_PATH = path;
 try {
  const old = createV6(path);
  old.prepare("UPDATE sessions SET request_id='demo-v2', source='demo', title='Ancienne démo personnalisée' WHERE id='published'").run();
  assert.equal(old.prepare("SELECT COUNT(*) AS n FROM learning_mutations WHERE request_id='demo-v2'").get().n, 0);
  old.close();
  let db = openDatabase(path);
  const sessionBefore = db.prepare("SELECT * FROM sessions WHERE id='published'").get();
  const exercisesBefore = db.prepare("SELECT * FROM exercises WHERE session_id='published' ORDER BY position").all();
  db.close();
  const get = (action:string, query='') => GET(new NextRequest(`http://localhost/api/${action}${query}`), {params:Promise.resolve({action})});
  for (let i=0; i<2; i++) {
   const response = await get('sessions');
   assert.equal(response.status, 200);
   const sessions = await response.json();
   assert.equal(sessions.filter((s:{request_id:string}) => s.request_id === 'demo-v2').length, 1);
   assert.equal(sessions.filter((s:{request_id:string}) => s.request_id === 'demo-questionnaire-v1').length, 1);
   const detail = await get('session', '?id=published');
   assert.equal(detail.status, 200);
   assert.equal((await detail.json()).title, 'Ancienne démo personnalisée');
  }
  db = openDatabase(path);
  assert.deepEqual(db.prepare("SELECT * FROM sessions WHERE id='published'").get(), sessionBefore);
  assert.deepEqual(db.prepare("SELECT * FROM exercises WHERE session_id='published' ORDER BY position").all(), exercisesBefore);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE request_id IN ('demo-v2','demo-questionnaire-v1')").get().n, 2);
  db.close();
 } finally {
  if (previous === undefined) delete process.env.ITALIANO_DB_PATH; else process.env.ITALIANO_DB_PATH = previous;
  rmSync(dir, {recursive:true, force:true});
 }
});
