import { ItalianoApp } from '@/components/italiano-app';

export default async function CorrectionPage({params}:{params:Promise<{id:string}>}) {
 const {id} = await params;
 return <ItalianoApp initialPage="correction" attemptId={id}/>;
}
