import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSession, getSession, publishSession, submitAttempt } from '../src/server/domain';
import { answerPractice, startPractice } from '../src/server/practice';

test('accents sur o facultatifs dans les séances, traductions et entraînements', () => {
  const dir = mkdtempSync(join(tmpdir(), 'italiano-accents-'));
  process.env.ITALIANO_DB_PATH = join(dir, 'test.sqlite');
  try {
    const cases: [string, string[], string, boolean][] = [
      ['Mi piace Milano, ___ vivo lontano dalla famiglia.', ['ma', 'però'], 'pero', true],
      ['Accent grave', ['però'], ' PERÒ ', true],
      ['Accent aigu', ['però'], 'peró', true],
      ['Unicode décomposé', ['però'], 'pero\u0300', true],
      ['Autre réponse acceptée', ['ma', 'però'], 'ma', true],
      ['Erreur de mot', ['però'], 'pera', false],
      ['Accent distinctif sur e', ['è'], 'e', false],
    ];
    const session = createSession({requestId:'accents',title:'Accents',objective:'Connecteurs',scheduledDate:'2026-01-01',exercises:[
      {type:'cloze',instruction:'Complétez.',items:cases.map(([content,accepted])=>({content,answer:{accepted}}))},
      {type:'flashcard',instruction:'Traduisez.',content:'Cependant',answer:{italian:'però',example:'Mi piace, però è caro.'}},
    ]});
    publishSession(String(session.id));
    const items = getSession(String(session.id)).exercises;
    const series = startPractice({requestId:'accents-series',count:100, voluntary:true});
    cases.forEach(([content,accepted,answer,correct],index) => {
      const attempt = submitAttempt({exerciseId:items[index].id,requestId:`session-${index}`,answer});
      assert.equal(attempt.is_correct,Number(correct),content);
      assert.deepEqual(attempt.feedback?.accepted,accepted);
      const question = series.questions.find(q=>q.content===content)!;
      const result = answerPractice({seriesId:series.id,questionId:question.id,requestId:`practice-${index}`,answer});
      assert.equal(result.correct,correct,content);
      assert.deepEqual(result.accepted,accepted);
    });
    assert.equal(submitAttempt({exerciseId:items[cases.length].id,requestId:'translation',answer:'pero',mode:'translation'}).is_correct,1);
  } finally {
    delete process.env.ITALIANO_DB_PATH;
    rmSync(dir,{recursive:true,force:true});
  }
});
