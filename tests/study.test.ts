import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueCards, emptyData, intervals, mergeImported, normalize, parseMarkdown, rate, readData } from '../src/lib/study.ts';
const markdown = '## Caffè\n- Français: Café\n- Exemple: Un caffè.\n- Traduction: Un café.\n- Thème: Quotidien';
test('intervalles et comptage des quatre notes', () => { for (const rating of ['again','hard','good','easy'] as const) { const r = rate(undefined,rating,0); assert.equal(Date.parse(r.dueAt),intervals[rating]); assert.equal(r.reviewCount,1); assert.equal(r.lapses,rating==='again'?1:0); } });
test('cartes dues et recherche normalisée', () => { const cards = parseMarkdown(markdown,'test.md'); assert.equal(dueCards(cards,{},0).length,1); assert.equal(dueCards(cards,{[cards[0].id]:rate(undefined,'good',0)},1).length,0); assert.equal(normalize('  CAFÉ '),'cafe'); });
test('import valide, invalide et dédoublonné sans toucher aux résultats', () => { const cards = parseMarkdown('---\ntitre: test\n---\n'+markdown,'test.md'); assert.equal(cards[0].french,'Café'); assert.throws(() => parseMarkdown('## Mot\n- Français: mot','test.md'),/manquants/); const reviews = {[cards[0].id]:rate(undefined,'hard',0)}; assert.equal(mergeImported(cards,parseMarkdown(markdown.replace('Caffè','CAFFE'),'autre.md')).length,0); assert.equal(reviews[cards[0].id].rating,'hard'); });
test('stockage corrompu ou invalide', () => { assert.deepEqual(readData('{'),emptyData()); assert.deepEqual(readData('{"imported":[],"reviews":{"x":{}}}'),emptyData()); });
