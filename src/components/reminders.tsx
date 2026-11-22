'use client';
import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { TZDate } from 'react-day-picker';
import { fr } from 'react-day-picker/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import type { CombinedCalendar } from '@/server/revision-calendar';
import { Card } from '@/components/ui/card';

type Reminder = CombinedCalendar['reminders'][number];
const timeZone = 'Europe/Rome';
const dateKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const displayDate = (date: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
const reminderDate = (date: string) => new TZDate(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 12, 0, 0, timeZone);

function ReminderDayButton({ children, modifiers, ...props }: ComponentProps<typeof CalendarDayButton>) {
  return <CalendarDayButton {...props} modifiers={modifiers} className="relative">
    {children}
    {modifiers.reminder && <span aria-hidden="true" className={`absolute bottom-1 size-1 rounded-full ${modifiers.selected ? 'bg-primary-foreground' : 'bg-primary'}`}/>}
  </CalendarDayButton>;
}

function ReminderCalendar({ reminders }: { reminders: Reminder[] }) {
  const [selected, setSelected] = useState<Date>(() => new TZDate(new Date(), timeZone));
  const [month, setMonth] = useState(selected);
  const selectedKey = dateKey(selected);
  const today = dateKey(new Date());
  const byDate = new Map<string, Reminder[]>();
  for (const reminder of reminders) {
    const items = byDate.get(reminder.date) ?? [];
    items.push(reminder);
    byDate.set(reminder.date, items);
  }
  const dailyReminders = byDate.get(selectedKey) ?? [];
  const next = reminders.find(reminder => reminder.date > selectedKey && (reminder.source !== 'lesson' || !reminder.completedAt));
  const monthCount = reminders.filter(reminder => reminder.date.startsWith(dateKey(month).slice(0, 7))).length;

  return <Card className="grid gap-0 overflow-hidden border-border py-0 shadow-none xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
    <div className="min-w-0 border-b border-border p-3 sm:p-6 xl:border-r xl:border-b-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-xs text-muted-foreground">{monthCount} rappel{monthCount > 1 ? 's' : ''} ce mois-ci</span>
        <Button variant="outline" size="sm" className="border-border" onClick={() => {
          const now = new TZDate(new Date(), timeZone);
          setSelected(now);
          setMonth(now);
        }}>Aujourd’hui</Button>
      </div>
      <Calendar
        mode="single"
        required
        locale={fr}
        timeZone={timeZone}
        selected={selected}
        onSelect={date => { setSelected(date); setMonth(date); }}
        month={month}
        onMonthChange={setMonth}
        fixedWeeks
        className="w-full bg-transparent p-0 [--cell-size:2rem] sm:[--cell-size:2.5rem]"
        classNames={{ caption_label: 'text-base font-semibold capitalize', day: 'group/day relative w-full p-0 text-center' }}
        modifiers={{ reminder: date => byDate.has(dateKey(date)) }}
        components={{ DayButton: ReminderDayButton }}
        labels={{
          labelNext: () => 'Mois suivant',
          labelPrevious: () => 'Mois précédent',
          labelDayButton: date => {
            const count = byDate.get(dateKey(date))?.length ?? 0;
            return `${displayDate(date)}${count ? `, ${count} rappel${count > 1 ? 's' : ''}` : ''}`;
          },
        }}
      />
      <div className="mt-5 flex items-center gap-2 px-1 text-xs text-muted-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-primary"/>Jour avec un rappel</div>
    </div>
    <div className="flex min-w-0 flex-col p-5 sm:p-6">
      <div aria-live="polite" aria-atomic="true">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays aria-hidden="true" className="size-4"/>{selectedKey === today ? 'AUJOURD’HUI' : 'AU PROGRAMME'}</div>
        <h3 className="mb-5 font-serif text-2xl leading-tight text-foreground"><time dateTime={selectedKey}>{displayDate(selected)}</time></h3>
        {dailyReminders.length ? <ul aria-label="Rappels du jour" className="m-0 grid list-none gap-3 p-0">
          {dailyReminders.map(reminder => <li key={`${reminder.source}-${reminder.id}`} className="rounded-lg bg-accent p-4">
            <div className="flex items-start justify-between gap-3"><strong className="min-w-0 text-sm break-words text-foreground">{reminder.theme}</strong><Badge variant="outline" className="shrink-0">{reminder.step}</Badge></div>
            <span className="mt-2 block text-xs text-muted-foreground">{reminder.source === 'lesson' ? 'Leçon Italiano Lab' : 'Calendrier externe'} · {reminder.source === 'lesson' && reminder.completedAt ? 'Effectué' : reminder.date === today ? 'Prévu aujourd’hui' : reminder.due ? reminder.source === 'lesson' ? 'En retard' : 'Date passée' : 'À venir'}</span>
          </li>)}
        </ul> : <div className="rounded-lg border border-dashed border-border px-4 py-8">
          <p className="mb-1 text-sm font-medium text-foreground">{reminders.length ? 'Aucun rappel ce jour-là.' : 'Aucun rappel dans le calendrier.'}</p>
          <p className="m-0 text-sm text-muted-foreground">{reminders.length ? 'Les jours marqués d’un point ont un thème à retrouver.' : 'Vos prochains rappels apparaîtront ici.'}</p>
        </div>}
      </div>
      {next && <div className="mt-6 border-t border-border pt-5">
        <span className="text-xs text-muted-foreground">PROCHAIN RAPPEL</span>
        <Button variant="ghost" className="mt-2 h-auto w-full justify-between gap-3 px-0 py-2 text-left whitespace-normal hover:bg-transparent hover:text-primary" onClick={() => {
          const date = reminderDate(next.date);
          setSelected(date);
          setMonth(date);
        }}>
          <span className="min-w-0"><span className="block text-sm break-words">{next.theme} · {next.step}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{displayDate(reminderDate(next.date))}</span></span><ArrowRight aria-hidden="true" className="size-4 shrink-0"/>
        </Button>
      </div>}
    </div>
  </Card>;
}

export function Reminders() {
  const [result, setResult] = useState<CombinedCalendar | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { fetch('/api/revision-calendar', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setResult).catch(() => setError(true)); }, []);
  return <section className="mt-10" aria-labelledby="reminders-title">
    <div className="mb-6 border-t border-border pt-9"><div className="mb-3 text-[10px] font-bold tracking-[.18em] text-ring">VOTRE CALENDRIER</div><h2 id="reminders-title" className="mb-3">Rappels thématiques</h2><p className="m-0 max-w-xl text-sm text-muted-foreground">Retrouvez vos révisions par thème. Sélectionnez une date pour voir les rappels du jour.</p></div>
    {error ? <p role="alert" className="rounded-lg border border-border bg-card p-6 text-sm">Calendrier des rappels indisponible ou données invalides.</p> : !result ? <div role="status" className="min-h-80 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Chargement des rappels…</div> : <>
      {result.state === 'missing' && <p className="rounded-lg border border-dashed border-border p-6 text-sm">Aucune donnée de rappels disponible : fichier introuvable.</p>}
      {result.state === 'unreadable' && <p role="alert" className="rounded-lg border border-dashed border-border p-6 text-sm">Calendrier externe indisponible. Les révisions de vos leçons restent visibles.</p>}
      <ReminderCalendar reminders={result.reminders}/>
    </>}
    <div className="mt-4 text-xs leading-relaxed text-muted-foreground">Dates en heure de Rome. Les rappels externes signalent les cours prévus. Les révisions des leçons indiquent aussi le travail effectué.</div>
  </section>;
}
