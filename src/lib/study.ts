export type Card = { id: string; italian: string; french: string; example: string; translation: string; theme: string; source: string };
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type Review = { reviewCount: number; lapses: number; lastReviewed: string; dueAt: string; rating: Rating };
export type Data = { imported: Card[]; reviews: Record<string, Review> };
export const emptyData = (): Data => ({ imported: [], reviews: {} });
export const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
export const intervals: Record<Rating, number> = { again: 10 * 60_000, hard: 86_400_000, good: 3 * 86_400_000, easy: 7 * 86_400_000 };
export function rate(previous: Review | undefined, rating: Rating, now = Date.now()): Review {
  return { reviewCount: (previous?.reviewCount ?? 0) + 1, lapses: (previous?.lapses ?? 0) + (rating === 'again' ? 1 : 0), lastReviewed: new Date(now).toISOString(), dueAt: new Date(now + intervals[rating]).toISOString(), rating };
}
export const dueCards = (cards: Card[], reviews: Data['reviews'], now = Date.now()) => cards.filter(c => !reviews[c.id] || Date.parse(reviews[c.id].dueAt) <= now);
const validCard = (c: unknown): c is Card => !!c && typeof c === 'object' && ['id','italian','french','example','translation','theme','source'].every(k => typeof (c as Record<string, unknown>)[k] === 'string' && !!(c as Record<string, string>)[k].trim());
const validReview = (r: unknown): r is Review => { if (!r || typeof r !== 'object') return false; const v = r as Review; return Number.isSafeInteger(v.reviewCount) && v.reviewCount > 0 && Number.isSafeInteger(v.lapses) && v.lapses >= 0 && v.lapses <= v.reviewCount && Number.isFinite(Date.parse(v.lastReviewed)) && Number.isFinite(Date.parse(v.dueAt)) && ['again','hard','good','easy'].includes(v.rating); };
export function readData(raw: string | null): Data {
  try { if (!raw) return emptyData(); const d = JSON.parse(raw); if (!d || !Array.isArray(d.imported) || !d.imported.every(validCard) || !d.reviews || typeof d.reviews !== 'object' || Array.isArray(d.reviews) || !Object.values(d.reviews).every(validReview)) return emptyData(); return { imported: d.imported, reviews: d.reviews }; } catch { return emptyData(); }
}
export function parseMarkdown(text: string, source: string): Card[] {
  const clean = text.replace(/^\uFEFF/, '').replace(/^\s*---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '');
  const sections = clean.split(/^\s*##\s+(.+?)\s*$/m); const cards: Card[] = [];
  if (sections.length < 3) throw new Error('Aucune section « ## expression » trouvée.');
  for (let i = 1; i < sections.length; i += 2) {
    const italian = sections[i].trim(); const fields: Record<string, string> = {};
    for (const line of sections[i + 1].split(/\r?\n/)) { const match = line.match(/^\s*-\s*([^:]+)\s*:\s*(.*?)\s*$/); if (match) fields[normalize(match[1])] = match[2]; }
    const missing = ['francais','exemple','traduction','theme'].filter(k => !fields[k]);
    if (missing.length) throw new Error(`« ${italian} » : champs manquants : ${missing.join(', ')}.`);
    cards.push({ id: `import:${encodeURIComponent(normalize(italian))}`, italian, french: fields.francais, example: fields.exemple, translation: fields.traduction, theme: fields.theme, source });
  }
  return cards;
}
export function mergeImported(existing: Card[], incoming: Card[]): Card[] { const seen = new Set(existing.map(c => normalize(c.italian))); return incoming.filter(c => { const key = normalize(c.italian); if (seen.has(key)) return false; seen.add(key); return true; }); }
