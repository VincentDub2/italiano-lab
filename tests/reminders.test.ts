import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readReminders } from '../src/server/reminders';

test('calendrier en lecture seule : dates de Rome, échéances, données absentes et invalides', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'italiano-reminders-'));
  const path = join(dir, 'revisions.json');
  try {
    assert.equal((await readReminders(path)).state, 'missing');
    const content = JSON.stringify({ themes: [{ titre: 'Thème', dates: { J1: '2026-11-01', J3: '2026-11-02' } }] });
    await writeFile(path, content);
    const result = await readReminders(path, new Date('2026-11-01T23:30:00Z'));
    assert.deepEqual(result.reminders.map(r => [r.step, r.due]), [['J1', true], ['J3', true]]);
    assert.equal((await readReminders(path, new Date('2026-11-01T22:30:00Z'))).reminders[1].due, false);
    assert.equal(await (await import('node:fs/promises')).readFile(path, 'utf8'), content);
    await writeFile(path, '{"themes":[{"titre":"x","dates":{"J1":"2026-02-30"}}]}');
    await assert.rejects(readReminders(path));
    await writeFile(path, '{');
    await assert.rejects(readReminders(path));
    await writeFile(path, '{"themes":[]}');
    assert.deepEqual(await readReminders(path), { state: 'available', reminders: [] });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('route historique de rappels : contrat sans cache et source de test', async (t) => {
  const dir = await mkdtemp(join(tmpdir(),'italiano-external-test-'));
  process.env.ITALIANO_REMINDERS_PATH = join(dir,'missing.json');
  t.after(async()=>{delete process.env.ITALIANO_REMINDERS_PATH; await rm(dir,{recursive:true,force:true});});
  const { GET } = await import('../src/app/api/reminders/route');
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body,{state:'missing',reminders:[]});
});
