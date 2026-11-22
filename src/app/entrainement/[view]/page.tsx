import { notFound } from 'next/navigation';
import { ItalianoApp } from '@/components/italiano-app';

export default async function PracticeView({params,searchParams}:{
 params:Promise<{view:string}>;searchParams:Promise<{mode?:string}>;
}) {
 const {view} = await params;
 if (view==='reviser') {
  const {mode} = await searchParams;
  return <ItalianoApp key={mode} initialPage="review" reviewMode={mode==='difficile'?'difficult':mode==='dues'?'due':undefined}/>;
 }
 if (view==='vocabulaire') return <ItalianoApp initialPage="vocabulary"/>;
 if (view==='difficultes') return <ItalianoApp initialPage="difficulties"/>;
 if (view==='sources') return <ItalianoApp initialPage="sources"/>;
 notFound();
}
