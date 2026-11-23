import { ItalianoApp } from '@/components/italiano-app';

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 return <ItalianoApp initialPage="assessments" assessmentId={id}/>;
}
