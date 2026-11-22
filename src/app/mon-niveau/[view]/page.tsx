import { notFound } from 'next/navigation';
import { ItalianoApp } from '@/components/italiano-app';

export default async function LevelView({params}:{params:Promise<{view:string}>}) {
 const {view} = await params;
 if (view==='corrections') return <ItalianoApp initialPage="corrections"/>;
 if (view==='carnet') return <ItalianoApp initialPage="errors"/>;
 notFound();
}
