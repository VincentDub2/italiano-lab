import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const date = z.iso.date();
const schema = z.object({ themes: z.array(z.object({ titre: z.string().trim().min(1), dates: z.record(z.string().regex(/^J\d+$/), date) })) });

export async function readReminders(path = process.env.ITALIANO_REMINDERS_PATH, now = new Date()) {
  if (!path) return { state: 'missing' as const, reminders: [] };

  let raw: string;
  try { raw = await readFile(path, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'missing' as const, reminders: [] };
    throw error;
  }
  const data = schema.parse(JSON.parse(raw));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const reminders = data.themes.flatMap(theme => Object.entries(theme.dates).map(([step, date]) => ({ theme: theme.titre, step, date, due: date <= today })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.theme.localeCompare(b.theme, 'fr') || a.step.localeCompare(b.step));
  return { state: 'available' as const, reminders };
}
