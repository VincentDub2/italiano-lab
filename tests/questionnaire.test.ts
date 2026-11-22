import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSession, exerciseSchema, getSession, listSessions, pending, publishSession, reveal, submitAttempt } from '../src/server/domain.ts';

const first={content:'Mi ___ il cane.',choices:[{value:'a',label:'piace'},{value:'b',label:'piacciono'}],answer:{value:'a'},explanation:'Le sujet est singulier.'};
const second={content:'Mi ___ i gatti.',choices:[{value:'c',label:'piace'},{value:'d',label:'piacciono'}],answer:{value:'d'},explanation:'Le sujet est pluriel.'};

test('questionnaire : validation, confidentialité, correction et reprise de chaque question',()=>{
  const dir=mkdtempSync(join(tmpdir(),'data-test-'));
  process.env.ITALIANO_DB_PATH=join(dir,'test.sqlite');
  try {
    const exercise={type:'questionnaire',instruction:'Choisissez la bonne réponse.',items:[first,second]};
    assert.ok(exerciseSchema.safeParse(exercise).success);
    for(const invalid of [
      {...first,choices:[first.choices[0]]},
      {...first,choices:[first.choices[0],first.choices[0]]},
      {...first,answer:{value:'absent'}},
      {...first,choices:[...first.choices,{value:'hidden',label:'secret',correct:true}]},
    ]) assert.equal(exerciseSchema.safeParse({...exercise,items:[invalid,second]}).success,false);
    const input={requestId:'qcm',title:'QCM',objective:'Piacere',scheduledDate:'2026-01-01',exercises:[exercise]};
    const sessionId=String(createSession(input).id);
    assert.equal(createSession(input).id,sessionId);
    const teacher=getSession(sessionId);
    const ids=teacher.exercises.map((e:Record<string,unknown>)=>String(e.id));
    assert.equal(teacher.exercises[0].answer.value,'a');
    assert.throws(()=>getSession(sessionId,true));
    assert.throws(()=>submitAttempt({exerciseId:ids[0],requestId:'draft',answer:'a'}));
    publishSession(sessionId);
    const student=getSession(sessionId,true);
    assert.deepEqual(student.exercises[0].choices,first.choices);
    assert.equal(student.exercises[0].type,'questionnaire');
    assert.equal(student.exercises[0].group_id,student.exercises[1].group_id);
    const payload=JSON.stringify(student);
    for(const secret of ['"answer"','answer_json','choices_json','Le sujet est singulier.','Le sujet est pluriel.']) assert.ok(!payload.includes(secret));
    assert.throws(()=>reveal(ids[0]));
    assert.throws(()=>submitAttempt({exerciseId:ids[0],requestId:'invalid-choice',answer:'absent'}));
    assert.throws(()=>submitAttempt({exerciseId:ids[0],requestId:'wrong-question',answer:'d'}));
    const wrong=submitAttempt({exerciseId:ids[0],requestId:'wrong',answer:'b'});
    assert.equal(wrong.status,'auto_corrected');
    assert.equal(wrong.is_correct,0);
    assert.deepEqual(wrong.feedback?.accepted,['piace']);
    assert.equal(wrong.feedback?.explanation,first.explanation);
    assert.equal(submitAttempt({exerciseId:ids[0],requestId:'wrong',answer:'b'}).id,wrong.id);
    assert.throws(()=>submitAttempt({exerciseId:ids[0],requestId:'wrong',answer:'a'}));
    assert.equal(getSession(sessionId,true).exercises[1].latestAttempt,null);
    assert.ok(!JSON.stringify(getSession(sessionId,true).exercises[1]).includes(second.explanation));
    const correct=submitAttempt({exerciseId:ids[0],requestId:'retry',answer:'a'});
    assert.equal(correct.is_correct,1);
    assert.equal(getSession(sessionId,true).exercises[0].latestAttempt.id,correct.id);
    const progress=listSessions(true).find((s:Record<string,unknown>)=>s.id===sessionId)!;
    assert.equal(progress.total,2);
    assert.equal(progress.completed,1);
    assert.deepEqual(pending(),[]);
  } finally {delete process.env.ITALIANO_DB_PATH;rmSync(dir,{recursive:true,force:true});}
});
