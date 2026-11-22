import { openDatabase } from './database.mjs';
import type { SessionTakeaway } from './schemas';
export type Database = ReturnType<typeof openDatabase>;
export function transaction<T>(d: Database, fn: () => T): T {
 d.exec('BEGIN IMMEDIATE');
 try { const result = fn(); d.exec('COMMIT'); return result; }
 catch (error) { d.exec('ROLLBACK'); throw error; }
}
export function write<T>(fn: (d: Database) => T): T {
 const d = openDatabase();
 try { return transaction(d, () => fn(d)); } finally { d.close(); }
}
export function saveSessionTakeaways(d: Database, sessionId: string, takeaways?: SessionTakeaway[]) {
 if (takeaways === undefined) return;
 d.prepare('INSERT INTO session_takeaways (session_id,cards_json) VALUES (?,?) ON CONFLICT(session_id) DO UPDATE SET cards_json=excluded.cards_json').run(sessionId,JSON.stringify(takeaways));
}
export function mutation<T>(d: Database, requestId: string, kind: string, input: unknown, apply: () => T): T {
 const payload = JSON.stringify(input);
 const old = d.prepare('SELECT * FROM learning_mutations WHERE request_id=?').get(requestId);
 if (old) {
  if (old.kind !== kind || old.payload_json !== payload) throw new Error('Identifiant déjà utilisé pour une autre demande.');
  return JSON.parse(old.result_json) as T;
 }
 const result = apply();
 d.prepare('INSERT INTO learning_mutations VALUES (?,?,?,?)').run(requestId, kind, payload, JSON.stringify(result));
 return result;
}
