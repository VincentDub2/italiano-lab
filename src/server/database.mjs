import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync, openSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateBank } from './bank-migration.mjs';
import { migrateProactive } from './proactive-migration.mjs';

let root = dirname(fileURLToPath(import.meta.url));
while (!existsSync(resolve(root, 'package.json'))) {
  const parent = dirname(root);
  if (parent === root) throw new Error('Racine du projet introuvable');
  root = parent;
}
export const databasePath = () => resolve(process.env.ITALIANO_DB_PATH || resolve(root, 'data/italiano.sqlite'));

export function openDatabase(path = databasePath()) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    if (db.prepare('PRAGMA journal_mode').get().journal_mode !== 'wal') db.exec('PRAGMA journal_mode = WAL');
    const hasMigrations = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
    if (hasMigrations && db.prepare('SELECT version FROM schema_migrations WHERE version=11').get()) {
      try { chmodSync(path, 0o600); } catch { /* Permissions may be managed by the filesystem. */ }
      return db;
    }
    const needsQuestionnaire = !hasMigrations || !db.prepare('SELECT version FROM schema_migrations WHERE version=3').get();
    if (hasMigrations) {
      const kind = db.prepare('SELECT version FROM schema_migrations WHERE version=10').get() ? 'proactive-lessons'
        : db.prepare('SELECT version FROM schema_migrations WHERE version=9').get() ? 'session-difficulty'
        : db.prepare('SELECT version FROM schema_migrations WHERE version=8').get() ? 'takeaways'
        : db.prepare('SELECT version FROM schema_migrations WHERE version=7').get() ? 'sentences'
        : db.prepare('SELECT version FROM schema_migrations WHERE version=6').get() ? 'availability' : 'bank';
      const backup = `${path}.before-${kind}-${Date.now()}-${randomUUID()}.sqlite`;
      // Reserve a private, empty destination before VACUUM writes any data (including WAL).
      closeSync(openSync(backup, 'wx', 0o600));
      db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
      chmodSync(backup, 0o600);
    }
    // SQLite requires foreign keys off before the transaction that replaces a referenced table.
    if (needsQuestionnaire) db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS vocabulary (id TEXT PRIMARY KEY, italian TEXT NOT NULL, french TEXT NOT NULL, example TEXT NOT NULL, translation TEXT NOT NULL, theme TEXT NOT NULL, source TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reviews (card_id TEXT PRIMARY KEY REFERENCES vocabulary(id), review_count INTEGER NOT NULL, lapses INTEGER NOT NULL, last_reviewed TEXT NOT NULL, due_at TEXT NOT NULL, rating TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, objective TEXT NOT NULL, scheduled_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')), source TEXT NOT NULL CHECK(source IN ('demo','prof')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS exercises (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), position INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('flashcard','cloze','free_text')), instruction TEXT NOT NULL, content TEXT NOT NULL, explanation TEXT, answer_json TEXT NOT NULL, weight REAL, objective TEXT, UNIQUE(session_id, position));
        CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, exercise_id TEXT NOT NULL REFERENCES exercises(id), request_id TEXT NOT NULL UNIQUE, answer TEXT NOT NULL, submitted_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('self_assessed','auto_corrected','pending_teacher','corrected')), is_correct INTEGER CHECK(is_correct IN (0,1) OR is_correct IS NULL), feedback_json TEXT, reviewed_at TEXT);
        INSERT OR IGNORE INTO schema_migrations(version) VALUES (1);`);
      if (!db.prepare('SELECT version FROM schema_migrations WHERE version=2').get()) {
        db.exec('ALTER TABLE exercises ADD COLUMN group_id TEXT; INSERT INTO schema_migrations(version) VALUES (2);');
      }
      if (!db.prepare('SELECT version FROM schema_migrations WHERE version=3').get()) {
        db.exec(`CREATE TABLE exercises_v3 (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), position INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('flashcard','cloze','free_text','questionnaire')), instruction TEXT NOT NULL, content TEXT NOT NULL, explanation TEXT, answer_json TEXT NOT NULL, weight REAL, objective TEXT, group_id TEXT, choices_json TEXT, UNIQUE(session_id, position));
          INSERT INTO exercises_v3 (id,session_id,position,type,instruction,content,explanation,answer_json,weight,objective,group_id)
            SELECT id,session_id,position,type,instruction,content,explanation,answer_json,weight,objective,group_id FROM exercises;
          DROP TABLE exercises;
          ALTER TABLE exercises_v3 RENAME TO exercises;
          INSERT INTO schema_migrations(version) VALUES (3);`);
        if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Migration refusée : références incohérentes.');
      }
      if (!db.prepare('SELECT version FROM schema_migrations WHERE version=4').get()) {
        db.exec(`CREATE TABLE practice_series (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, requested_count INTEGER NOT NULL, started_at TEXT NOT NULL);
          CREATE TABLE practice_questions (series_id TEXT NOT NULL REFERENCES practice_series(id), question_id TEXT NOT NULL, position INTEGER NOT NULL, type TEXT NOT NULL, instruction TEXT NOT NULL, content TEXT NOT NULL, objective TEXT, choices_json TEXT, answer_json TEXT NOT NULL, explanation TEXT, PRIMARY KEY(series_id, question_id));
          CREATE TABLE practice_attempts (id TEXT PRIMARY KEY, series_id TEXT NOT NULL, question_id TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE, answer TEXT NOT NULL, correct INTEGER NOT NULL CHECK(correct IN (0,1)), submitted_at TEXT NOT NULL, elapsed_ms INTEGER NOT NULL, FOREIGN KEY(series_id,question_id) REFERENCES practice_questions(series_id,question_id), UNIQUE(series_id,question_id));
          INSERT INTO schema_migrations(version) VALUES (4);`);
      }
      if (!db.prepare('SELECT version FROM schema_migrations WHERE version=5').get()) {
        db.exec(`ALTER TABLE practice_questions ADD COLUMN group_id TEXT;
          UPDATE practice_questions SET group_id=(SELECT group_id FROM exercises WHERE exercises.id=practice_questions.question_id);
          INSERT INTO schema_migrations(version) VALUES (5);`);
      }
      if (!db.prepare('SELECT version FROM schema_migrations WHERE version=6').get()) migrateBank(db);
      if (!db.prepare('SELECT version FROM schema_migrations WHERE version=7').get()) {
        // V6 existed before availability was introduced. Never overwrite explicit visibility.
        if (!db.prepare('PRAGMA table_info(bank_items)').all().some(column => column.name === 'available')) {
          db.exec(`ALTER TABLE bank_items ADD COLUMN available INTEGER NOT NULL DEFAULT 0 CHECK(available IN (0,1));
            UPDATE bank_items SET available=1
            WHERE id IN (SELECT e.bank_item_id FROM exercises e JOIN sessions s ON s.id=e.session_id WHERE s.status='published')
               OR id IN (SELECT bank_item_id FROM practice_questions)
               OR id IN (SELECT item_id FROM learning_attempts WHERE context='practice');`);
        }
        db.exec('INSERT INTO schema_migrations(version) VALUES (7)');
      }
      if (!db.prepare('SELECT version FROM schema_migrations WHERE version=8').get()) {
        db.exec(`CREATE TABLE sentence_attempts (
          context TEXT NOT NULL CHECK(context IN ('session','practice')),
          request_id TEXT NOT NULL,
          version_id TEXT NOT NULL REFERENCES item_versions(id),
          scope_id TEXT NOT NULL,
          hint_count INTEGER NOT NULL DEFAULT 0 CHECK(hint_count BETWEEN 0 AND 5),
          retry_of TEXT REFERENCES learning_attempts(id),
          PRIMARY KEY(context,request_id)
        );
        INSERT INTO schema_migrations(version) VALUES (8);`);
      }
      if (!db.prepare('SELECT version FROM schema_migrations WHERE version=9').get()) {
        db.exec(`CREATE TABLE session_takeaways (
          session_id TEXT NOT NULL PRIMARY KEY REFERENCES sessions(id),
          cards_json TEXT NOT NULL
        );
        INSERT INTO schema_migrations(version) VALUES (9);`);
      }
      if (!db.prepare('SELECT version FROM schema_migrations WHERE version=10').get()) {
        db.exec(`CREATE TABLE session_difficulty (
          session_id TEXT NOT NULL PRIMARY KEY REFERENCES sessions(id),
          difficulty TEXT NOT NULL CHECK(difficulty IN ('too_easy','just_right','too_hard'))
        );
        INSERT INTO schema_migrations(version) VALUES (10);`);
      }
      if (!db.prepare('SELECT version FROM schema_migrations WHERE version=11').get()) migrateProactive(db);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Migration refusée : références incohérentes.');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    db.exec('PRAGMA foreign_keys = ON');
    try { chmodSync(path, 0o600); } catch { /* Permissions may be managed by the filesystem. */ }
    return db;
  } catch (error) { db.close(); throw error; }
}
