import { ItalianoApp } from '@/components/italiano-app';

export default async function PracticePage({searchParams}:{searchParams:Promise<{mode?:string}>}) {
 const {mode} = await searchParams;
 return <ItalianoApp initialPage="practice" suggestedPractice={mode==='cible'}/>;
}
