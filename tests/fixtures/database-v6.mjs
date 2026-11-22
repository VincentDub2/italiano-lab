// Synthetic V6 fixtures only: never read or copy a user's database.
import { openDatabase as openV5 } from './database-v5.mjs';
import { migrateBank } from '../../src/server/bank-migration.mjs';

export function createV6(path, { legacy = true } = {}) {
 const d = openV5(path);
 const at = '2026-01-01T12:00:00Z';
 for (const status of ['published', 'draft']) {
  d.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?)').run(status, status, status, 'Test', '2026-01-03', status, 'prof', at, at);
 }
 for (const [id, session, position] of [['published-item', 'published', 0], ['draft-item', 'draft', 0], ['practiced-draft', 'draft', 1]]) {
  d.prepare('INSERT INTO exercises (id,session_id,position,type,instruction,content,answer_json,group_id) VALUES (?,?,?,?,?,?,?,?)').run(id, session, position, 'cloze', 'Complétez', `${id} ___`, '{"accepted":["ciao"]}', id);
 }
 d.prepare('INSERT INTO attempts VALUES (?,?,?,?,?,?,?,?,?)').run('session-answer', 'published-item', 'session-answer', 'non', at, 'auto_corrected', 0, '{"accepted":["ciao"]}', null);
 d.prepare('INSERT INTO practice_series VALUES (?,?,?,?)').run('series', 'series', 2, at);
 for (const [id, position] of [['practiced-draft', 0], ['practice-only', 1]]) {
  d.prepare('INSERT INTO practice_questions (series_id,question_id,position,type,instruction,content,answer_json,group_id) VALUES (?,?,?,?,?,?,?,?)').run('series', id, position, 'cloze', 'Complétez', `${id} ___`, '{"accepted":["ciao"]}', id);
 }
 d.prepare('INSERT INTO practice_attempts VALUES (?,?,?,?,?,?,?,?)').run('practice-answer', 'series', 'practice-only', 'practice-answer', 'non', 0, at, 1234);
 d.exec('BEGIN');
 migrateBank(d);
 // A standalone bank creation has no session/practice occurrence.
 d.prepare('INSERT INTO bank_exercises VALUES (?,?,?,?,?)').run('standalone', 'Complétez', 'cloze', null, at);
 d.prepare('INSERT INTO bank_items VALUES (?,?,?,?,?,?)').run('standalone', 'standalone', null, 'prof', 'standalone-v1', 1);
 d.prepare('INSERT INTO item_versions VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('standalone-v1', 'standalone', 'standalone-v1', 'cloze', 'Complétez', 'Standalone ___', null, null, '{"accepted":["ciao"]}', null, at);
 d.prepare('INSERT INTO revision_state VALUES (?,?,?,?,?,?,?,?)').run('published-item', 'initial:published-item', 'rework', 0, 0, '2026-01-04', null, 0);
 d.exec('COMMIT');
 if (legacy) d.exec('ALTER TABLE bank_items DROP COLUMN available');
 return d;
}
