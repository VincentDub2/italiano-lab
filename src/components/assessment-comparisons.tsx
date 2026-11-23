'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AssessmentComparisons } from '@/server/assessment-comparisons';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

type Comparison = AssessmentComparisons['comparisons'][number];
type Criterion = Comparison['criteria'][number];
const outcomes = {
 observed_in_both: 'Observé dans les deux contextes',
 fragile: 'À consolider',
 insufficient: 'Preuve insuffisante',
};
const statuses = {
 observed_without_help: 'Observé sans aide',
 needs_work: 'À consolider',
 not_observed: 'Non observé',
};
const reasons = {
 no_answer: 'Réponse manquante',
 not_tested: 'Critère non testé',
};
const dateLabel = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Rome' });

function Source({ side, heading }: { side: Comparison['first']; heading: string }) {
 return <div className="min-w-0 rounded-md border border-border p-3">
  <dt className="text-xs font-medium text-muted-foreground">{heading} · <time dateTime={side.submittedAt}>{dateLabel.format(new Date(side.submittedAt))}</time></dt>
  <dd className="m-0 grid gap-1 pt-1">
   <Link href={'/mon-niveau/bilans/' + encodeURIComponent(side.assessmentId)}
    className="w-fit rounded-sm font-medium text-primary underline-offset-4 wrap-anywhere hover:underline focus-visible:underline">{side.title}</Link>
   <p className="m-0 text-sm wrap-anywhere">{side.context}</p>
  </dd>
 </div>;
}

function Observation({ side, heading }: { side: Criterion['first']; heading: string }) {
 return <div className="min-w-0">
  <dt className="text-xs font-medium text-muted-foreground">{heading}</dt>
  <dd className="m-0 grid gap-1 pt-1">
   <p className="m-0 text-sm font-medium">{statuses[side.status]}</p>
   <p className="m-0 text-xs text-muted-foreground">{side.reason ? reasons[side.reason] :
    side.evidence?.type === 'free_text' ? 'Production écrite' : side.evidence ? `Tâche ${side.evidence.position + 1}` : null}</p>
   <p className="m-0 text-sm whitespace-pre-wrap wrap-anywhere">{side.explanation}</p>
  </dd>
 </div>;
}

function ComparisonCard({ comparison }: { comparison: Comparison }) {
 return <Card className="min-w-0 gap-4 p-4 shadow-none sm:p-6">
  <h3 className="m-0 text-lg font-semibold wrap-anywhere">{comparison.notion.label}</h3>
  <dl className="m-0 grid gap-2 sm:grid-cols-2">
   <Source side={comparison.first} heading="Premier bilan"/>
   <Source side={comparison.second} heading="Second bilan"/>
  </dl>
  <p className="m-0 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere text-muted-foreground">{comparison.rationale}</p>
  <ul className="m-0 grid list-none gap-4 p-0" role="list">
   {comparison.criteria.map(({ firstPosition, outcome, first, second }) => <li key={firstPosition} className="grid gap-2 border-t border-border pt-3">
    <h4 className="m-0 text-base font-medium wrap-anywhere">{first.label}</h4>
    {second.label !== first.label && <p className="m-0 text-sm wrap-anywhere text-muted-foreground">Dans le second bilan · {second.label}</p>}
    <Badge variant="outline" className="h-auto max-w-full whitespace-normal">{outcomes[outcome]}</Badge>
    <dl className="m-0 grid gap-3 sm:grid-cols-2">
     <Observation side={first} heading="Premier bilan"/>
     <Observation side={second} heading="Second bilan"/>
    </dl>
   </li>)}
  </ul>
 </Card>;
}

export function AssessmentComparisonsPanel({ showEmpty = false }: { showEmpty?: boolean }) {
 const [query, setQuery] = useState({ offset: 0 });
 const [comparisons, setComparisons] = useState<Comparison[]>([]);
 const [nextOffset, setNextOffset] = useState<number | null>(null);
 const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');

 useEffect(() => {
  const controller = new AbortController();
  void fetch('/api/assessment-comparisons?offset=' + query.offset, { cache: 'no-store', signal: controller.signal })
   .then(async response => {
    if (!response.ok) throw new Error();
    const page: AssessmentComparisons = await response.json();
    if (controller.signal.aborted) return;
    setComparisons(previous => query.offset === 0 ? page.comparisons :
     [...previous, ...page.comparisons.filter(comparison => !previous.some(old => old.id === comparison.id))]);
    setNextOffset(page.nextOffset);
    setState('loaded');
   }).catch(() => {
    if (!controller.signal.aborted) setState('error');
   });
  return () => controller.abort();
 }, [query]);

 const load = (offset: number) => {
  setState('loading');
  setQuery({ offset });
 };
 if (!showEmpty && !comparisons.length && state !== 'error') return null;

 return <section aria-labelledby="assessment-comparisons-title" className="mt-6 grid gap-3">
  <h2 id="assessment-comparisons-title" className="m-0 text-xl">Comparaisons de bilans</h2>
  {comparisons.length > 0 && <ul role="list" className="m-0 grid list-none gap-4 p-0">
   {comparisons.map(comparison => <li className="min-w-0" key={comparison.id}><ComparisonCard comparison={comparison}/></li>)}
  </ul>}
  {showEmpty && !comparisons.length && state === 'loaded' && <p className="m-0 text-sm text-muted-foreground">
   Une comparaison apparaît quand le prof a relu deux bilans comparables sur la même notion.
  </p>}
  {state === 'loading' && <p role="status" className="m-0 text-sm text-muted-foreground">Chargement des comparaisons…</p>}
  {state === 'error' && <div className="flex flex-wrap items-center gap-2">
   <p role="alert" className="m-0 text-sm text-destructive">Les comparaisons sont momentanément indisponibles.</p>
   <Button variant="outline" onClick={() => load(query.offset)}>Réessayer</Button>
  </div>}
  {nextOffset !== null && state === 'loaded' && <Button className="w-fit" variant="outline" onClick={() => load(nextOffset)}>
   Afficher d’autres comparaisons
  </Button>}
 </section>;
}
