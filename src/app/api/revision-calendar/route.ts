import { NextResponse } from 'next/server';
import { combinedRevisionCalendar } from '@/server/revision-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
 try { return NextResponse.json(await combinedRevisionCalendar(),{headers:{'Cache-Control':'no-store'}}); }
 catch { return NextResponse.json({error:'Calendrier des rappels indisponible.'},{status:500}); }
}
