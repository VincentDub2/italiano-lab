import { NextRequest, NextResponse } from 'next/server';
import { feedbackList, getSession, importProgress, listSessions, reveal, reviewCard, seedDemo, submitAttempt, submitSessionDifficulty, vocabulary, revealVocabulary, revealSessionHint } from '@/server/domain';
import { answerPractice, bank, getPracticeSeries, practiceSummary, startPractice, revealPractice, revealPracticeHint } from '@/server/practice';
import { journal, learningOverview } from '@/server/learning';
import { actOnLesson, getStudentLesson, listStudentLessons } from '@/server/proactive-lessons';
import { getToday } from '@/server/today';
import { getStudentAttempt, getStudentCorrection, markCorrectionRead } from '@/server/student-corrections';
import { listStudentNotionProgress } from '@/server/notion-progress';
import { actOnAssessment, getStudentAssessment, listStudentAssessments, StudentAssessmentError } from '@/server/assessments';
import { listAssessmentComparisons } from '@/server/assessment-comparisons';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore = {headers:{'Cache-Control':'no-store'}};
function assessmentError(cause: unknown) {
 return cause instanceof StudentAssessmentError
  ? NextResponse.json({error:cause.message},{...noStore,status:cause.status})
  : error();
}
function error() { return NextResponse.json({error:'Requête invalide ou ressource inconnue.'},{status:400}); }
export async function GET(request: NextRequest, context: {params: Promise<{action:string}>}) { try {const {action}=await context.params; const url=request.nextUrl;
 if(action==='assessment-comparisons') return NextResponse.json(listAssessmentComparisons({
  notionId:url.searchParams.get('notionId') ?? undefined,
  comparisonId:url.searchParams.get('comparisonId') ?? undefined,
  offset:url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : undefined,
 }),noStore);
 if(action==='assessments') return NextResponse.json(listStudentAssessments(),noStore);
 if(action==='assessment') return NextResponse.json(getStudentAssessment(url.searchParams.get('id') ?? ''),noStore);
 if(action==='today') return NextResponse.json(await getToday(),{headers:{'Cache-Control':'no-store'}}); if(action==='attempt-detail') return NextResponse.json(getStudentAttempt(url.searchParams.get('id') ?? ''),{headers:{'Cache-Control':'no-store'}}); if(action==='notion-progress') return NextResponse.json(listStudentNotionProgress({notionId:url.searchParams.get('notionId') ?? undefined,offset:url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : undefined}),{headers:{'Cache-Control':'no-store'}}); if(action==='correction') return NextResponse.json(getStudentCorrection(url.searchParams.get('id') ?? ''),{headers:{'Cache-Control':'no-store'}}); if(action==='practice-bank') return NextResponse.json({questions:bank(), ...practiceSummary(), overview:learningOverview()}); if(action==='practice-series') return NextResponse.json(getPracticeSeries(url.searchParams.get('id') ?? '')); if(action==='learning-overview') return NextResponse.json(learningOverview()); if(action==='errors') return NextResponse.json(journal(Object.fromEntries(url.searchParams)));  if(action==='lessons') return NextResponse.json(listStudentLessons()); if(action==='lesson') return NextResponse.json(getStudentLesson(url.searchParams.get('id') ?? '')); if(action==='sessions') {seedDemo(); return NextResponse.json(listSessions(true));} if(action==='session') return NextResponse.json(getSession(url.searchParams.get('id') ?? '',true)); if(action==='feedback') return NextResponse.json(feedbackList()); if(action==='vocabulary') return NextResponse.json(vocabulary()); return NextResponse.json({error:'Introuvable'},{status:404});} catch (cause) {return assessmentError(cause);} }
export async function POST(request: NextRequest, context: {params: Promise<{action:string}>}) { try {const host=request.headers.get('host') ?? request.nextUrl.host; const localHost=/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host); if(!localHost || request.headers.get('origin')!==`http://${host}` || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json') || Number(request.headers.get('content-length') ?? 0)>1000000) return NextResponse.json({error:'Origine ou contenu refusé.'},{status:403}); const raw=await request.text(); if(raw.length>1000000) return error(); const body=JSON.parse(raw); const {action}=await context.params;
 if(action==='assessment-action') return NextResponse.json(actOnAssessment(body),noStore);
 if(action==='vocabulary-reveal') return NextResponse.json(revealVocabulary(body.cardId)); if(action==='practice-reveal') return NextResponse.json(revealPractice(body)); if(action==='practice-start') return NextResponse.json(startPractice(body)); if(action==='practice-answer') return NextResponse.json(answerPractice(body)); if(action==='practice-hint') return NextResponse.json(revealPracticeHint(body)); if(action==='correction-read') return NextResponse.json(markCorrectionRead(body)); if(action==='lesson-action') return NextResponse.json(actOnLesson(body)); if(action==='attempt') return NextResponse.json(submitAttempt(body)); if(action==='session-difficulty') return NextResponse.json(submitSessionDifficulty(body)); if(action==='sentence-hint') return NextResponse.json(revealSessionHint(body)); if(action==='reveal') return NextResponse.json(reveal(body.exerciseId)); if(action==='migration' || action==='import') return NextResponse.json(importProgress(body)); if(action==='review') return NextResponse.json(reviewCard(body.cardId,body.rating)); return NextResponse.json({error:'Introuvable'},{status:404});} catch (cause) {return assessmentError(cause);} }
