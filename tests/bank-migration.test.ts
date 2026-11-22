import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
import { openDatabase as openV5 } from './fixtures/database-v5.mjs';
import { openDatabase } from '../src/server/database.mjs';
import { getSession, getAttempt } from '../src/server/domain';
import { journal } from '../src/server/learning';

test('migration V5 : IDs, snapshots, choix QCM des deux modes, aide inconnue et restauration', () => {
 const dir=mkdtempSync(join(tmpdir(),'italiano-migrate-bank-')),path=join(dir,'db.sqlite');process.env.ITALIANO_DB_PATH=path;
 try {
  let d=openV5(path);
  d.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?)').run('session','request','Ancienne séance','Piacere','2026-01-01','published','prof','2026-01-01T12:00:00Z','2026-01-01T12:00:00Z');
  const choices=JSON.stringify([{value:'singular',label:'piace'},{value:'plural',label:'piacciono'}]);
  const answer=JSON.stringify({value:'plural'});
  for (const [id,position] of [['item',0],['duplicate',1]] as const) d.prepare('INSERT INTO exercises (id,session_id,position,type,instruction,content,explanation,answer_json,group_id,choices_json) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,'session',position,'questionnaire','Choisissez','Mi ___ i gatti.','Pluriel.',answer,'group',choices);
  d.prepare('INSERT INTO attempts VALUES (?,?,?,?,?,?,?,?,?)').run('session-answer','item','shared-request','singular','2026-01-01T12:00:00Z','auto_corrected',0,JSON.stringify({accepted:['piacciono'],explanation:'Pluriel.'}),null);
  d.prepare('INSERT INTO practice_series VALUES (?,?,?,?)').run('series','series-request',1,'2026-01-02T12:00:00Z');
  d.prepare('INSERT INTO practice_questions VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('series','item',0,'questionnaire','Choisissez','Ancien énoncé ___',null,choices,answer,'Ancienne explication.','group');
  d.prepare('INSERT INTO practice_attempts VALUES (?,?,?,?,?,?,?,?)').run('practice-answer','series','item','shared-request','1',1,'2026-01-02T12:00:00Z',1234);
  const before=d.prepare('SELECT * FROM practice_questions').all();d.close();
  d=openDatabase(path);
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM bank_items').get()?.n,2);
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM learning_attempts').get()?.n,2);
  const migrated=d.prepare('SELECT * FROM practice_questions').all();
  for (const [key,value] of Object.entries(before[0])) assert.equal(migrated[0][key],value);
  assert.deepEqual(d.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(d.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');d.close();
  assert.equal(getSession('session',true).exercises[0].latestAttempt.answer,'singular');
  assert.equal(getAttempt('session-answer').answerLabel,'piace');assert.equal(getAttempt('practice-answer').answer,'1');assert.equal(getAttempt('practice-answer').answerLabel,'piacciono');assert.equal(getAttempt('practice-answer').question.content,'Ancien énoncé ___');assert.equal(getAttempt('practice-answer').question.choices?.[0].label,'piace');
  assert.equal(getAttempt('practice-answer').assisted,null);
  const importedJournal=journal({},false),entry=importedJournal.items[0];assert.equal(entry.history.length,2);assert.equal(entry.history[1].content,'Ancien énoncé ___');assert.equal(entry.revision.successes,0);assert.equal(entry.revision.due,importedJournal.today);
  d=openDatabase(path);assert.equal(d.prepare('SELECT COUNT(*) AS n FROM learning_attempts').get()?.n,2);d.close();
  const backups=readdirSync(dir).filter(name=>name.includes('.before-bank-'));assert.equal(backups.length,1);
  copyFileSync(join(dir,backups[0]),join(dir,'restored.sqlite'));
  const restored=new DatabaseSync(join(dir,'restored.sqlite'));
  assert.equal(restored.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n,5);
  assert.equal(restored.prepare('SELECT answer FROM attempts WHERE id=?').get('session-answer')?.answer,'singular');
  assert.equal(restored.prepare('SELECT answer FROM practice_attempts WHERE id=?').get('practice-answer')?.answer,'1');restored.close();
 } finally {delete process.env.ITALIANO_DB_PATH;rmSync(dir,{recursive:true,force:true});}
});

test('migration invalide : rollback complet et sauvegarde cohérente conservée', () => {
 const dir=mkdtempSync(join(tmpdir(),'italiano-bank-rollback-')),path=join(dir,'db.sqlite');
 try {
  const old=openV5(path);
  old.prepare('INSERT INTO practice_series VALUES (?,?,?,?)').run('series','series',1,'2026-01-01T12:00:00Z');
  old.prepare('INSERT INTO practice_questions (series_id,question_id,position,type,instruction,content,answer_json) VALUES (?,?,?,?,?,?,?)').run('series','orphan',0,'cloze','Complétez','Question ___','not-json');
  old.prepare('INSERT INTO practice_attempts VALUES (?,?,?,?,?,?,?,?)').run('answer','series','orphan','request','ciao',0,'2026-01-01T12:00:00Z',1);old.close();
  assert.throws(()=>openDatabase(path));
  const raw=new DatabaseSync(path);
  assert.equal(raw.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n,5);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='learning_attempts'").get()?.n,0);
  assert.equal(raw.prepare('SELECT answer FROM practice_attempts').get()?.answer,'ciao');raw.close();
  assert.equal(readdirSync(dir).filter(name=>name.includes('.before-bank-')).length,1);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
