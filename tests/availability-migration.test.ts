import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
import type { Database } from '../src/server/store';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createV6 } from './fixtures/database-v6.mjs';
import { openDatabase } from '../src/server/database.mjs';
import { dailyPlan, createBankExercise } from '../src/server/bank';
import { createSession, getSession } from '../src/server/domain';
import { journal } from '../src/server/learning';

const proactiveTables = ['learning_observations','proactive_lessons','proactive_lesson_evidence',
 'proactive_milestones','proactive_revision_links','proactive_milestone_attempts'];
const emptyProgress = {item_version_notions:[],proactive_lesson_prerequisites:[]};
const assessmentTables = ['assessments','assessment_notions','assessment_tasks','assessment_answers','assessment_results','assessment_comparisons'];
const emptyAssessments = Object.fromEntries(assessmentTables.map(name => [name, []]));
const dropAssessments = assessmentTables.slice().reverse().map(name => 'DROP TABLE '+name+'; ').join('');
const emptyV15 = {...Object.fromEntries(proactiveTables.map(name=>[name,[]])),correction_reads:[],...emptyProgress,...emptyAssessments};
const dropProgress = dropAssessments + 'DROP TABLE proactive_lesson_prerequisites; DROP TABLE item_version_notions;';

function snapshot(d: Database, omitAvailability = false) {
 const result: Record<string, unknown> = {};
 for (const { name } of d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
  if (name === 'schema_migrations') continue;
  const rows = d.prepare(`SELECT * FROM "${String(name).replaceAll('"', '""')}" ORDER BY rowid`).all();
  result[String(name)] = rows.map((row: Record<string, unknown>) => {
   const copy = { ...row };
   if (name === 'bank_items' && omitAvailability) delete copy.available;
   return copy;
  });
 }
 return result;
}

for (const legacy of [true, false]) test(`V6 ${legacy ? 'ancienne' : 'actuelle'} : sauvegarde WAL privée, restauration et répétabilité`, () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-v6-backup-'));
 const path = join(dir, 'db.sqlite');
 try {
  const old = createV6(path, { legacy });
  // Keep this connection open: the backup must include committed WAL content.
  old.exec('PRAGMA wal_autocheckpoint=0');
  old.prepare('UPDATE sessions SET title=? WHERE id=?').run('Écriture WAL conservée', 'published');
  if (!legacy) old.exec("UPDATE bank_items SET available=0 WHERE id='published-item'");
  const before = snapshot(old, legacy);
  const migrated = openDatabase(path);
  assert.deepEqual(snapshot(migrated, legacy), { ...before, sentence_attempts: [], session_takeaways: [], session_difficulty: [], ...emptyV15 });
  assert.equal(migrated.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 15);
  assert.equal(migrated.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
  assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(migrated.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok');
  if (!legacy) assert.equal(migrated.prepare("SELECT available FROM bank_items WHERE id='published-item'").get()?.available, 0);
  const after = snapshot(migrated);
  migrated.close(); old.close();
  const backups = readdirSync(dir).filter(name => name.includes('.before-availability-'));
  assert.equal(backups.length, 1);
  const backup = join(dir, backups[0]);
  assert.equal(statSync(backup).mode & 0o777, 0o600);
  const restoredPath = join(dir, 'restored.sqlite');
  copyFileSync(backup, restoredPath);
  const restored = new DatabaseSync(restoredPath);
  assert.equal(restored.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 6);
  assert.deepEqual(snapshot(restored, legacy), before);
  assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(restored.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok');
  restored.close();
  const repeated = openDatabase(path);
  assert.deepEqual(snapshot(repeated), after);
  repeated.close();
  assert.equal(readdirSync(dir).filter(name => name.includes('.before-availability-')).length, 1);
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('V7 : échec après ALTER TABLE annule schéma et données, sauvegarde restaurable', () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-v7-rollback-'));
 const path = join(dir, 'db.sqlite');
 try {
  const old = createV6(path);
  old.exec("CREATE TRIGGER refuse_v7 BEFORE INSERT ON schema_migrations WHEN NEW.version=7 BEGIN SELECT RAISE(ABORT, 'synthetic migration failure'); END");
  const before = snapshot(old);
  old.close();
  assert.throws(() => openDatabase(path), /synthetic migration failure/);
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 6);
  assert.equal(raw.prepare('PRAGMA table_info(bank_items)').all().some((c: { name: string }) => c.name === 'available'), false);
  assert.deepEqual(snapshot(raw), before);
  assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);
  raw.exec('DROP TRIGGER refuse_v7'); raw.close();
  const backups = readdirSync(dir).filter(name => name.includes('.before-availability-'));
  assert.equal(backups.length, 1);
  const restored = new DatabaseSync(join(dir, backups[0]));
  assert.deepEqual(snapshot(restored), before); restored.close();
  const retry = openDatabase(path);
  assert.equal(retry.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 15);
  retry.close();
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

// All fixtures and backups stay in TMPDIR; no personal database is opened.
test('base neuve : V7 conserve le schéma V6 actuel sans sauvegarde inutile', () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-v7-new-'));
 try {
  const d = openDatabase(join(dir, 'db.sqlite'));
  assert.equal(d.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 15);
  const available = d.prepare('PRAGMA table_info(bank_items)').all().find((c: { name: string }) => c.name === 'available');
  assert.equal(available?.dflt_value, '1');
  assert.equal(available?.notnull, 1);
  d.close();
  assert.equal(readdirSync(dir).filter(name => name.includes('.before-')).length, 0);
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('V7 : les références invalides refusent la migration atomiquement', () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-v7-fk-'));
 const path = join(dir, 'db.sqlite');
 try {
  const old = createV6(path);
  old.exec("PRAGMA foreign_keys=OFF; UPDATE bank_items SET group_id='absent' WHERE id='draft-item'");
  const before = snapshot(old); old.close();
  assert.throws(() => openDatabase(path), /références incohérentes/);
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 6);
  assert.deepEqual(snapshot(raw), before);
  assert.equal(raw.prepare('PRAGMA table_info(bank_items)').all().some((c: { name: string }) => c.name === 'available'), false);
  raw.close();
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('V8 : la migration depuis V7 conserve les données et sauvegarde le schéma précédent', () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-v8-backup-'));
 const path = join(dir, 'db.sqlite');
 try {
  const v7 = createV6(path,{legacy:false});
  v7.exec('INSERT INTO schema_migrations(version) VALUES (7)');
  const before = snapshot(v7);
  v7.close();
  const upgraded = openDatabase(path);
  assert.deepEqual(snapshot(upgraded), {...before,sentence_attempts:[],session_takeaways:[],session_difficulty:[],...emptyV15});
  assert.deepEqual(upgraded.prepare('PRAGMA foreign_key_check').all(), []);
  upgraded.close();
  const backups = readdirSync(dir).filter(name => name.includes('.before-sentences-'));
  assert.equal(backups.length,1);
  const restored = new DatabaseSync(join(dir,backups[0]));
  assert.equal(restored.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n,7);
  assert.deepEqual(snapshot(restored),before);
  restored.close();
  openDatabase(path).close();
  assert.equal(readdirSync(dir).filter(name => name.includes('.before-sentences-')).length,1);
 } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('V9 : les anciennes séances gardent leurs réponses et leurs clés de création', () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-v9-backup-'));
 const path = join(dir, 'db.sqlite');
 const previous = process.env.ITALIANO_DB_PATH;
 process.env.ITALIANO_DB_PATH = path;
 try {
  createV6(path).close();
  const input = { requestId:'legacy-mutation', title:'Ancien brouillon', objective:'Saluer', scheduledDate:'2026-01-01', exercises:[{instruction:'Complétez',content:'___ Marco',answer:{accepted:['ciao']},type:'cloze'}] };
  const draft = createSession(input);
  const v8 = openDatabase(path);
  v8.exec(dropProgress+' DROP TABLE correction_reads');
  for (const name of [...proactiveTables].reverse()) v8.exec(`DROP TABLE ${name}`);
  v8.exec('DROP INDEX learning_attempts_by_version; DROP INDEX sentence_attempts_by_scope; DROP TABLE session_difficulty; DROP TABLE session_takeaways; DELETE FROM schema_migrations WHERE version>=9;');
  v8.prepare('UPDATE learning_mutations SET payload_json=? WHERE request_id=?').run(JSON.stringify({...input,source:'prof'}),input.requestId);
  const before = snapshot(v8);
  v8.close();

  const upgraded = openDatabase(path);
  assert.equal(upgraded.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 15);
  assert.deepEqual(snapshot(upgraded), {...before,session_takeaways:[],session_difficulty:[],...emptyV15});
  upgraded.close();
  const session = getSession('published', true);
  assert.deepEqual(session.takeaways, []);
  assert.equal(session.difficulty_feedback,null);
  assert.equal(session.exercises[0].latestAttempt.id, 'session-answer');
  assert.equal(session.exercises[0].latestAttempt.answer, 'non');
  assert.deepEqual(createSession(input), draft);
  assert.deepEqual(getSession(draft.id).takeaways, []);
  const backups = readdirSync(dir).filter(name => name.includes('.before-takeaways-'));
  assert.equal(backups.length, 1);
  const backup = new DatabaseSync(join(dir, backups[0]));
  assert.equal(backup.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 8);
  assert.deepEqual(snapshot(backup), before);
  backup.close();
 } finally {
  if (previous === undefined) delete process.env.ITALIANO_DB_PATH; else process.env.ITALIANO_DB_PATH = previous;
  rmSync(dir, { recursive: true, force: true });
 }
});

test('V6 ancienne : dailyPlan et journal retrouvent seulement les items exposés', () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-v6-availability-'));
 const path = join(dir, 'db.sqlite');
 const previous = process.env.ITALIANO_DB_PATH;
 process.env.ITALIANO_DB_PATH = path;
 try {
  const old = createV6(path);
  assert.deepEqual(old.prepare('PRAGMA table_info(bank_items)').all().map((c: { name: string }) => c.name), ['id', 'group_id', 'origin_id', 'source', 'current_version_id']);
  assert.equal(old.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 6);
  old.close();
  assert.ok(dailyPlan()); // Business API reproduces "no such column: b.available".
  assert.deepEqual(journal({}, false).items.map(x => x.item_id).sort(), ['legacy:series:practice-only', 'published-item']);
  const d = openDatabase(path);
  assert.deepEqual(d.prepare('SELECT id,available FROM bank_items ORDER BY id').all().map((r: { id: string; available: number }) => [r.id, r.available]), [
   ['draft-item', 0], ['legacy:series:practice-only', 1], ['practiced-draft', 1], ['published-item', 1], ['standalone', 0],
  ]);
  assert.equal(d.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 15);
  assert.throws(() => d.exec("UPDATE bank_items SET available=2 WHERE id='draft-item'"), /CHECK constraint failed/);
  d.close();
  const created = createBankExercise({ requestId: 'after-v7', exercise: { type: 'cloze', instruction: 'Complétez', items: [{ content: 'Nouveau ___', answer: { accepted: ['ciao'] } }] } });
  const check = openDatabase(path);
  assert.equal(check.prepare('SELECT available FROM bank_items WHERE id=?').get(created.itemIds[0])?.available, 1);
  check.close();
 } finally {
  if (previous === undefined) delete process.env.ITALIANO_DB_PATH; else process.env.ITALIANO_DB_PATH = previous;
  rmSync(dir, { recursive: true, force: true });
 }
});

test('V11 additive depuis V10 : séances, tentatives, difficulté et suivi conservés après deux ouvertures', () => {
 const dir=mkdtempSync(join(tmpdir(),'italiano-v10-backup-'));
 const path=join(dir,'db.sqlite');
 try {
  createV6(path).close();
  const historical=openDatabase(path);
  historical.exec(dropProgress+' DROP TABLE correction_reads');
  for (const name of [...proactiveTables].reverse()) historical.exec(`DROP TABLE ${name}`);
  historical.exec("DROP INDEX learning_attempts_by_version; DROP INDEX sentence_attempts_by_scope; DELETE FROM schema_migrations WHERE version>=11; INSERT INTO session_difficulty VALUES ('published','just_right')");
  const before=snapshot(historical);
  historical.close();
  for (let pass=0;pass<2;pass++) {
   const migrated=openDatabase(path);
   assert.deepEqual(snapshot(migrated),{...before,...emptyV15});
   assert.equal(migrated.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n,15);
   assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(),[]);
   migrated.close();
  }
  const backups=readdirSync(dir).filter(name=>name.includes('.before-proactive-lessons-'));
  assert.equal(backups.length,1);
  const backup=new DatabaseSync(join(dir,backups[0]));
  assert.equal(backup.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n,10);
  assert.deepEqual(snapshot(backup),before);
  backup.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('V12 depuis V11 conserve l’historique et part sans accusé de lecture',()=>{
 const dir=mkdtempSync(join(tmpdir(),'italiano-v11-backup-'));
 const path=join(dir,'db.sqlite');
 try {
  createV6(path).close();
  const previous=openDatabase(path);
  previous.exec(dropProgress+" DROP TABLE correction_reads; DELETE FROM schema_migrations WHERE version>=12");
  const before=snapshot(previous);
  previous.close();
  for (let pass=0;pass<2;pass++) {
   const migrated=openDatabase(path);
   assert.deepEqual(snapshot(migrated),{...before,correction_reads:[],...emptyProgress,...emptyAssessments});
   assert.equal(migrated.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n,15);
   assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(),[]);
   migrated.close();
  }
  assert.equal(readdirSync(dir).filter(name=>name.includes('.before-correction-reads-')).length,1);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('V13 depuis V12 fige les notions connues et conserve les leçons, preuves et échéances',()=>{
 const dir=mkdtempSync(join(tmpdir(),'italiano-v12-backup-'));
 const path=join(dir,'db.sqlite');
 try {
  createV6(path).close();
  const previous=openDatabase(path);
  previous.exec(dropProgress+`
   DELETE FROM schema_migrations WHERE version>=13;
   INSERT INTO notions VALUES ('temps','Temps du récit');
   INSERT INTO item_notions VALUES ('published-item','temps');
   INSERT INTO item_versions SELECT 'ancienne-version',item_id,cycle_id,type,instruction,content,objective,choices_json,answer_json,explanation,created_at
    FROM item_versions WHERE id='initial:published-item';
   UPDATE learning_attempts SET version_id='ancienne-version' WHERE id='session-answer';
   INSERT INTO proactive_lessons (id,notion_id,session_id,reason,status,created_at,started_at)
    VALUES ('started','temps','published','Revoir le récit','in_progress','2026-01-03T12:00:00Z','2026-01-03T12:00:00Z');
   INSERT INTO proactive_lesson_evidence VALUES ('started','session-answer');`);
  const before=snapshot(previous);
  previous.close();
  for (let pass=0;pass<2;pass++) {
   const migrated=openDatabase(path);
   assert.deepEqual(snapshot(migrated),{...before,...emptyProgress,...emptyAssessments,item_version_notions:[{version_id:'initial:published-item',notion_id:'temps'}]});
   assert.equal(migrated.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n,15);
   assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(),[]);
   migrated.close();
  }
  const backups=readdirSync(dir).filter(name=>name.includes('.before-notion-progress-'));
  assert.equal(backups.length,1);
  const backup=new DatabaseSync(join(dir,backups[0]));
  assert.deepEqual(snapshot(backup),before);
  assert.equal(backup.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n,12);
  backup.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('V14 depuis V13 sauvegarde le WAL et préserve les activités et les relations existantes', () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-v13-backup-'));
 const path = join(dir, 'db.sqlite');
 try {
  createV6(path).close();
  const previous = openDatabase(path);
  try {
   previous.exec(dropAssessments + "DELETE FROM schema_migrations WHERE version>=14; PRAGMA wal_autocheckpoint=0; UPDATE sessions SET title='Contenu WAL conservé' WHERE id='published'");
   const before = snapshot(previous);
   for (let pass = 0; pass < 2; pass++) {
    const migrated = openDatabase(path);
    try {
     assert.deepEqual(snapshot(migrated), { ...before, ...emptyAssessments });
     assert.equal(migrated.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 15);
     assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { migrated.close(); }
   }
   const backups = readdirSync(dir).filter(name => name.includes('.before-assessments-'));
   assert.equal(backups.length, 1);
   const backupPath = join(dir, backups[0]);
   assert.equal(statSync(backupPath).mode & 0o777, 0o600);
   const backup = new DatabaseSync(backupPath);
   try {
    assert.deepEqual(snapshot(backup), before);
    assert.equal(backup.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 13);
   } finally { backup.close(); }
  } finally { previous.close(); }
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('V15 depuis V14 sauvegarde les bilans déjà rendus et leurs résultats', () => {
 const dir = mkdtempSync(join(tmpdir(), 'italiano-v14-backup-'));
 const path = join(dir, 'db.sqlite');
 try {
  const previous = openDatabase(path);
  const stamp = '2026-03-04T12:00:00Z';
  previous.exec('DROP TABLE assessment_comparisons; DELETE FROM schema_migrations WHERE version=15');
  previous.prepare(`INSERT INTO assessments (id,status,title,objective,reason,estimated_minutes,criteria_json,created_at,offered_at,started_at,submitted_at)
   VALUES ('completed','reviewed','Le changement','Raconter','Transfert',10,'[]',?,?,?,?)`).run(stamp, stamp, stamp, stamp);
  previous.prepare("INSERT INTO assessment_tasks VALUES ('written','completed',0,'{}')").run();
  previous.prepare("INSERT INTO assessment_answers VALUES ('written',?)").run(JSON.stringify({ kind: 'answer', value: 'Ho cambiato orario.' }));
  previous.prepare("INSERT INTO assessment_results VALUES ('completed',?,'{}')").run(stamp);
  const before = snapshot(previous);
  previous.close();

  for (let pass = 0; pass < 2; pass++) {
   const migrated = openDatabase(path);
   try {
    assert.deepEqual(snapshot(migrated), { ...before, assessment_comparisons: [] });
    assert.equal(migrated.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 15);
    assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(), []);
   } finally { migrated.close(); }
  }
  const backups = readdirSync(dir).filter(name => name.includes('.before-assessment-comparisons-'));
  assert.equal(backups.length, 1);
  const backupPath = join(dir, backups[0]);
  assert.equal(statSync(backupPath).mode & 0o777, 0o600);
  const backup = new DatabaseSync(backupPath);
  try {
   assert.deepEqual(snapshot(backup), before);
   assert.equal(backup.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()?.n, 14);
  } finally { backup.close(); }
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
