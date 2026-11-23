import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/server/database.mjs';

test('migrations SQLite répétables, persistance, clés étrangères et rollback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'data-test-'));
  const path = join(dir, 'test.sqlite');
  try {
    let db = openDatabase(path);
    db.prepare('INSERT INTO vocabulary VALUES (?, ?, ?, ?, ?, ?, ?)').run('id', 'ciao', 'salut', 'ciao', 'salut', 'quotidien', 'test');
    assert.throws(() => db.prepare('INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?)').run('absent', 1, 0, 'now', 'later', 'good'));
    db.exec('BEGIN');
    db.prepare('DELETE FROM vocabulary WHERE id = ?').run('id');
    db.exec('ROLLBACK');
    db.close();
    db = openDatabase(path);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vocabulary').get()?.n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n, 15);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
