import { ItalianoApp } from '@/components/italiano-app';

export default async function SessionPage({params,searchParams}:{
 params:Promise<{id:string}>;searchParams:Promise<{item?:string|string[]}>;
}) {
 const [{id},{item}] = await Promise.all([params,searchParams]);
 return <ItalianoApp initialPage="session" sessionId={id} occurrenceId={typeof item==='string'?item:undefined}/>;
}
