import { ItalianoApp } from '@/components/italiano-app';

export default async function AttemptPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 return <ItalianoApp initialPage="attempt" attemptId={id}/>;
}
