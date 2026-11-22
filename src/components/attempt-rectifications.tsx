import type { Attempt } from '@/lib/exercises';
export function AttemptRectifications({attempt}:{attempt:Attempt}) {
 if (!attempt.rectifications?.length) return null;
 return <div className="mt-3 rounded-lg border border-border bg-accent p-3 text-sm"><strong>Verdict neutralisé</strong>{attempt.rectifications.map((r,i) => <div key={i}><p lang="it">{r.correction}</p><p>{r.explanation}</p></div>)}</div>;
}
