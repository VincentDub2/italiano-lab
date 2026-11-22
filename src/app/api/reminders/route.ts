import { NextResponse } from 'next/server';
import { readReminders } from '@/server/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try { return NextResponse.json(await readReminders(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Calendrier des rappels indisponible.' }, { status: 500 }); }
}
