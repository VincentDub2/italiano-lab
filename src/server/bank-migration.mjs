import { createHash } from 'node:crypto';

export function migrateBank(db) {
 db.exec(`
  CREATE TABLE bank_exercises (id TEXT PRIMARY KEY, instruction TEXT NOT NULL, type TEXT NOT NULL, objective TEXT, created_at TEXT NOT NULL);
  CREATE TABLE bank_items (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES bank_exercises(id), origin_id TEXT REFERENCES bank_items(id), source TEXT NOT NULL, current_version_id TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)));
  CREATE TABLE item_versions (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES bank_items(id), cycle_id TEXT NOT NULL, type TEXT NOT NULL, instruction TEXT NOT NULL, content TEXT NOT NULL, objective TEXT, choices_json TEXT, answer_json TEXT NOT NULL, explanation TEXT, created_at TEXT NOT NULL);
  CREATE TABLE notions (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
  CREATE TABLE item_notions (item_id TEXT NOT NULL REFERENCES bank_items(id), notion_id TEXT NOT NULL REFERENCES notions(id), PRIMARY KEY(item_id,notion_id));
  CREATE TABLE learning_attempts (id TEXT PRIMARY KEY, context TEXT NOT NULL CHECK(context IN ('session','practice')), request_id TEXT NOT NULL, item_id TEXT NOT NULL REFERENCES bank_items(id), version_id TEXT NOT NULL REFERENCES item_versions(id), occurrence_id TEXT, series_id TEXT REFERENCES practice_series(id), question_id TEXT, answer TEXT NOT NULL, submitted_at TEXT NOT NULL, status TEXT NOT NULL, is_correct INTEGER, feedback_json TEXT, reviewed_at TEXT, assisted INTEGER CHECK(assisted IN (0,1) OR assisted IS NULL), mode TEXT NOT NULL, elapsed_ms INTEGER, UNIQUE(context,request_id));
  CREATE INDEX learning_item ON learning_attempts(item_id,submitted_at);
  CREATE INDEX learning_occurrence ON learning_attempts(occurrence_id);
  CREATE INDEX learning_series ON learning_attempts(series_id,question_id);
  CREATE TABLE answer_exposures (item_id TEXT NOT NULL REFERENCES bank_items(id), day TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('correction','hint')), created_at TEXT NOT NULL, PRIMARY KEY(item_id,day,kind));
  CREATE TABLE revision_state (item_id TEXT NOT NULL REFERENCES bank_items(id), cycle_id TEXT NOT NULL, state TEXT NOT NULL, successes INTEGER NOT NULL, step INTEGER NOT NULL, due TEXT, last_success TEXT, pending INTEGER NOT NULL, PRIMARY KEY(item_id,cycle_id));
  CREATE TABLE feedback_rectifications (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, attempt_id TEXT NOT NULL REFERENCES learning_attempts(id), correction TEXT NOT NULL, explanation TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE learning_mutations (request_id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_json TEXT NOT NULL, result_json TEXT NOT NULL);
  CREATE TABLE bank_import (version INTEGER PRIMARY KEY, imported_at TEXT NOT NULL);
  ALTER TABLE exercises ADD COLUMN bank_item_id TEXT REFERENCES bank_items(id);
  ALTER TABLE exercises ADD COLUMN version_id TEXT REFERENCES item_versions(id);
  ALTER TABLE practice_questions ADD COLUMN bank_item_id TEXT REFERENCES bank_items(id);
  ALTER TABLE practice_questions ADD COLUMN version_id TEXT REFERENCES item_versions(id);
  ALTER TABLE practice_series ADD COLUMN selection_json TEXT;
 `);
 const importedAt = new Date().toISOString();
 const insertGroup = db.prepare('INSERT OR IGNORE INTO bank_exercises VALUES (?,?,?,?,?)');
 const insertItem = db.prepare('INSERT INTO bank_items VALUES (?,?,NULL,?,?,?)');
 const insertVersion = db.prepare('INSERT INTO item_versions VALUES (?,?,?,?,?,?,?,?,?,?,?)');
 const addVersion = (row, itemId, versionId) => insertVersion.run(versionId,itemId,versionId,row.type,row.instruction,row.content,row.objective,row.choices_json,row.answer_json,row.explanation,importedAt);
 for (const row of db.prepare('SELECT e.*,s.source,s.status AS session_status FROM exercises e JOIN sessions s ON s.id=e.session_id ORDER BY e.rowid').all()) {
  const group = row.group_id || 'legacy-group:' + createHash('sha256').update(JSON.stringify([row.session_id,row.type,row.instruction,row.objective])).digest('hex');
  const version = 'initial:' + row.id;
  insertGroup.run(group,row.instruction,row.type,row.objective,importedAt);
  insertItem.run(row.id,group,row.source,version,Number(row.session_status === 'published'));
  addVersion(row,row.id,version);
  db.prepare('UPDATE exercises SET bank_item_id=?,version_id=? WHERE id=?').run(row.id,version,row.id);
 }
 for (const row of db.prepare('SELECT * FROM practice_questions ORDER BY rowid').all()) {
  const original = db.prepare('SELECT * FROM exercises WHERE id=?').get(row.question_id);
  const itemId = original?.bank_item_id || `legacy:${row.series_id}:${row.question_id}`;
  if (!original) {
   const group = row.group_id || itemId;
   const version = `snapshot:${row.series_id}:${row.question_id}`;
   insertGroup.run(group,row.instruction,row.type,row.objective,importedAt);
   insertItem.run(itemId,group,'prof',version,1);
   addVersion(row,itemId,version);
  }
  const same = original && ['type','instruction','content','objective','choices_json','answer_json','explanation'].every(key => original[key] === row[key]);
  const version = same ? original.version_id : `snapshot:${row.series_id}:${row.question_id}`;
  if (original && !same) addVersion(row,itemId,version);
  db.prepare('UPDATE practice_questions SET bank_item_id=?,version_id=? WHERE series_id=? AND question_id=?').run(itemId,version,row.series_id,row.question_id);
 }
 db.exec(`INSERT INTO learning_attempts (id,context,request_id,item_id,version_id,occurrence_id,answer,submitted_at,status,is_correct,feedback_json,reviewed_at,assisted,mode)
  SELECT a.id,'session',a.request_id,e.bank_item_id,e.version_id,a.exercise_id,a.answer,a.submitted_at,a.status,a.is_correct,a.feedback_json,a.reviewed_at,NULL,
   CASE WHEN e.type='flashcard' AND a.status='auto_corrected' THEN 'translation' WHEN a.status='self_assessed' THEN 'memory' ELSE 'answer' END
  FROM attempts a JOIN exercises e ON e.id=a.exercise_id;`);
 for (const row of db.prepare('SELECT a.*,q.bank_item_id,q.version_id,q.type,q.answer_json,q.choices_json,q.explanation FROM practice_attempts a JOIN practice_questions q ON q.series_id=a.series_id AND q.question_id=a.question_id').all()) {
  const answer = JSON.parse(row.answer_json);
  const accepted = row.type === 'questionnaire' ? [JSON.parse(row.choices_json).find(choice => choice.value === answer.value).label] : answer.accepted;
  db.prepare(`INSERT INTO learning_attempts (id,context,request_id,item_id,version_id,series_id,question_id,answer,submitted_at,status,is_correct,feedback_json,assisted,mode,elapsed_ms) VALUES (?,'practice',?,?,?,?,?,?,?,'auto_corrected',?,?,NULL,'answer',?)`)
   .run(row.id,row.request_id,row.bank_item_id,row.version_id,row.series_id,row.question_id,row.answer,row.submitted_at,row.correct,JSON.stringify({accepted,explanation:row.explanation}),row.elapsed_ms);
 }
 db.prepare('INSERT INTO bank_import VALUES (6,?)').run(importedAt);
 db.exec('INSERT INTO schema_migrations VALUES (6)');
}
