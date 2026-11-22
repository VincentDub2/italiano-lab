import { ItalianoApp } from '@/components/italiano-app';

export default async function LessonPage({params}: {params:Promise<{id:string}>}) {
 const {id} = await params;
 return <ItalianoApp initialPage="lessons" lessonId={id}/>;
}
