import { openDatabase as openV5 } from './fixtures/database-v5.mjs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/server/database.mjs';
import { createSession, exerciseSchema, getAttempt, getSession, listSessions, pending, publishSession, reveal, sessionSchema, submitAttempt, submitFeedback, vocabulary } from '../src/server/domain.ts';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');

test('exercices à plusieurs items : création, corrigés privés et progression indépendante', () => {
  const dir=mkdtempSync(join(tmpdir(),'data-test-'));
  process.env.ITALIANO_DB_PATH=join(dir,'test.sqlite');
  try {
    const exercises=[
      {type:'cloze',instruction:'Complétez avec piacere.',items:[{content:'Mi ___ il cane.',answer:{accepted:['piace']},explanation:'Singulier.'},{content:'Mi ___ i gatti.',answer:{accepted:['piacciono']},explanation:'Pluriel.'}]},
      {type:'flashcard',instruction:'Traduisez.',items:[{content:'Bonjour',answer:{italian:'Buongiorno',example:'Buongiorno!'}},{content:'Bonsoir',answer:{italian:'Buonasera',example:'Buonasera!'}}]},
      {type:'free_text',instruction:'Répondez en italien.',items:[{content:'Présentez-vous.',answer:{}},{content:'Parlez de votre ville.',answer:{}}]},
    ];
    const input={requestId:'grouped',title:'Plusieurs items',objective:'Pratiquer',scheduledDate:'2026-01-01',exercises};
    const created=createSession(input);
    assert.equal(createSession(input).id,created.id);
    const sessionId=String(created.id);
    assert.throws(()=>getSession(sessionId,true));
    const teacher=getSession(sessionId);
    assert.equal(teacher.exercises.length,6);
    assert.equal(teacher.exercises[0].group_id,teacher.exercises[1].group_id);
    assert.notEqual(teacher.exercises[0].group_id,teacher.exercises[2].group_id);
    assert.equal(new Set(teacher.exercises.map((e:Record<string,unknown>)=>e.group_id)).size,3);
    const ids=teacher.exercises.map((e:Record<string,unknown>)=>String(e.id));
    assert.throws(()=>submitAttempt({exerciseId:ids[0],requestId:'draft-item',answer:'piace'}));
    publishSession(sessionId);
    const student=getSession(sessionId,true);
    const payload=JSON.stringify(student);
    assert.ok(!payload.includes('accepted'));
    assert.ok(!payload.includes('Pluriel.'));
    assert.ok(!payload.includes('Buongiorno'));
    const first=submitAttempt({exerciseId:ids[0],requestId:'item-1',answer:'piace'});
    assert.equal(first.is_correct,1);
    assert.equal(submitAttempt({exerciseId:ids[0],requestId:'item-1',answer:'piace'}).id,first.id);
    assert.equal(getSession(sessionId,true).exercises[1].latestAttempt,null);
    const progress=listSessions(true).find((s:Record<string,unknown>)=>s.id===sessionId)!;
    assert.equal(progress.total,6);
    assert.equal(progress.completed,1);
    const second=submitAttempt({exerciseId:ids[1],requestId:'item-2',answer:'piace'});
    assert.equal(second.is_correct,0);
    assert.equal(submitAttempt({exerciseId:ids[1],requestId:'item-2-retry',answer:'piacciono'}).is_correct,1);
    assert.equal(getSession(sessionId,true).exercises[0].latestAttempt.id,first.id);
    assert.equal(reveal(ids[2]).italian,'Buongiorno');
    submitAttempt({exerciseId:ids[2],requestId:'flash-1',answer:'good'});
    assert.equal(vocabulary().reviews['session:'+ids[2]].reviewCount,1);
    assert.equal(vocabulary().reviews['session:'+ids[3]],undefined);
    const free=submitAttempt({exerciseId:ids[4],requestId:'free-1',answer:'Sono una guida.'});
    assert.equal(pending()[0].exercise_id,ids[4]);
    submitFeedback({attemptId:free.id,result:'correct',correction:'Sono una guida.',explanation:'Bravo.'});
    assert.equal(getSession(sessionId,true).exercises[4].latestAttempt.feedback.correction,'Sono una guida.');
    assert.equal(getSession(sessionId,true).exercises[5].latestAttempt,null);
    assert.equal(exerciseSchema.safeParse({...exercises[0],items:[]}).success,false);
    assert.equal(exerciseSchema.safeParse({...exercises[0],items:[{content:'Mi ___ il cane.',answer:{italian:'piace'}}]}).success,false);
    assert.equal(sessionSchema.safeParse({...input,exercises:Array(51).fill(exercises[0])}).success,false);
  } finally { delete process.env.ITALIANO_DB_PATH; rmSync(dir,{recursive:true,force:true}); }
});

test('migration des anciens exercices sans perte de réponses et retour au schéma précédent', () => {
  const dir=mkdtempSync(join(tmpdir(),'data-test-'));
  process.env.ITALIANO_DB_PATH=join(dir,'test.sqlite');
  try {
    const sessionId='old-session', exerciseId='old-item';
    const attempt={id:'old-answer'};
    let db=openV5(process.env.ITALIANO_DB_PATH);
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?)').run(sessionId,'legacy','Ancienne séance','Test','2026-01-01','published','prof','2026-01-01T12:00:00Z','2026-01-01T12:00:00Z');
    db.prepare('INSERT INTO exercises (id,session_id,position,type,instruction,content,answer_json) VALUES (?,?,?,?,?,?,?)').run(exerciseId,sessionId,0,'cloze','Complétez','Io ___ italiano.',JSON.stringify({accepted:['parlo']}));
    db.prepare('INSERT INTO attempts VALUES (?,?,?,?,?,?,?,?,?)').run(attempt.id,exerciseId,'legacy-answer','parlo','2026-01-01T12:00:00Z','auto_corrected',1,JSON.stringify({accepted:['parlo']}),null);
    // Reconstitue le schéma V1, puis vérifie la migration dans les deux sens.
    db.exec('DROP TABLE practice_attempts; DROP TABLE practice_questions; DROP TABLE practice_series; ALTER TABLE exercises DROP COLUMN choices_json; ALTER TABLE exercises DROP COLUMN group_id; DELETE FROM schema_migrations WHERE version>=2;');
    db.close();
    copyFileSync(join(dir,'test.sqlite'),join(dir,'backup.sqlite'));
    db=openDatabase();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n,15);
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys,1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    db.close();
    const restored=getSession(sessionId,true).exercises[0];
    assert.equal(restored.id,exerciseId);
    assert.equal(restored.group_id,null);
    assert.equal(restored.latestAttempt.id,attempt.id);
    assert.equal(restored.latestAttempt.is_correct,1);
    assert.equal(restored.latestAttempt.answer,'parlo');
    copyFileSync(join(dir,'backup.sqlite'),join(dir,'test.sqlite'));
    const rolledBack=new DatabaseSync(join(dir,'test.sqlite'));
    assert.equal(rolledBack.prepare('SELECT id FROM attempts WHERE id=?').get(attempt.id)?.id,attempt.id);
    assert.equal(rolledBack.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n,1);
    assert.deepEqual(rolledBack.prepare('PRAGMA foreign_key_check').all(),[]);
    rolledBack.close();
  } finally { delete process.env.ITALIANO_DB_PATH; rmSync(dir,{recursive:true,force:true}); }
});

test('traduction des cartes : correction serveur, accents, idempotence et distinction avec l’auto-évaluation', () => {
  const dir=mkdtempSync(join(tmpdir(),'data-test-'));
  process.env.ITALIANO_DB_PATH=join(dir,'test.sqlite');
  try {
    const created=createSession({requestId:'translations',title:'Traduire',objective:'Vocabulaire',scheduledDate:'2026-01-01',exercises:[{type:'flashcard',instruction:'Mémorisez puis traduisez.',items:[{content:'Il est',answer:{italian:'è',example:'Lui è qui.'}},{content:'Bonjour',answer:{italian:'buongiorno',example:'Buongiorno!'}}]},{type:'cloze',instruction:'Complétez',content:'Io ___',answer:{accepted:['parlo']}}]});
    const sessionId=String(created.id);
    const ids=getSession(sessionId).exercises.map((e:Record<string,unknown>)=>String(e.id));
    assert.throws(()=>submitAttempt({exerciseId:ids[0],requestId:'draft-translation',answer:'è',mode:'translation'}));
    publishSession(sessionId);
    assert.ok(!JSON.stringify(getSession(sessionId,true)).includes('Lui è qui.'));
    const wrong=submitAttempt({exerciseId:ids[0],requestId:'translate-wrong',answer:'e',mode:'translation'});
    assert.equal(wrong.status,'auto_corrected');
    assert.equal(wrong.is_correct,0);
    assert.deepEqual(wrong.feedback?.accepted,['è']);
    assert.equal(wrong.feedback?.example,'Lui è qui.');
    assert.equal(wrong.interval,undefined);
    assert.equal(submitAttempt({exerciseId:ids[0],requestId:'translate-wrong',answer:'e',mode:'translation'}).id,wrong.id);
    assert.throws(()=>submitAttempt({exerciseId:ids[0],requestId:'translate-wrong',answer:'è',mode:'translation'}));
    assert.equal(submitAttempt({exerciseId:ids[0],requestId:'translate-correct',answer:' È ',mode:'translation'}).is_correct,1);
    assert.equal(vocabulary().reviews['session:'+ids[0]],undefined);
    assert.equal(getSession(sessionId,true).exercises[1].latestAttempt,null);
    const grade=submitAttempt({exerciseId:ids[1],requestId:'memorize',answer:'good'});
    assert.equal(grade.status,'self_assessed');
    assert.equal(grade.interval,259200000);
    assert.throws(()=>submitAttempt({exerciseId:ids[1],requestId:'memorize',answer:'good',mode:'translation'}));
    assert.equal(vocabulary().reviews['session:'+ids[1]].reviewCount,1);
    assert.throws(()=>submitAttempt({exerciseId:ids[2],requestId:'bad-mode',answer:'parlo',mode:'translation'}));
  } finally { delete process.env.ITALIANO_DB_PATH; rmSync(dir,{recursive:true,force:true}); }
});

test('traduction : article omis et ponctuation finale tolérés, grammaire et phrases préservées', () => {
  const dir=mkdtempSync(join(tmpdir(),'data-test-'));
  process.env.ITALIANO_DB_PATH=join(dir,'test.sqlite');
  try {
    const cases: [string,string,boolean,boolean?][]=[
      ["l'ingegnere",'ingegnere',true,true],
      ['l’ingegnere',' INGEGNERE! ',true,true],
      ['il libro','libro',true,true],
      ['lo studente','studente',true,true],
      ['la casa','casa',true,true],
      ['i libri','libri',true,true],
      ['gli studenti','studenti',true,true],
      ['le case','case',true,true],
      ['un libro','libro',true,true],
      ['uno studente','studente',true,true],
      ['una casa','casa',true,true],
      ['un’amica','amica',true,true],
      ["l'ingegnere","L’INGEGNERE",true],
      ["l'ingegnere",'il ingegnere',false],
      ['il libro','la libro',false],
      ['il libro','libri',false],
      ['il ragazzo','ragazza',false],
      ['il caffè','caffe',false],
      ['il caffè','caffe\u0300',true,true],
      ['buongiorno','buongiorno!',true],
      ['buongiorno!','buongiorno',true],
      ['buongiorno','buongiorno…',true],
      ['buongiorno','buon giorno',false],
      ['è','e',false],
      ['il cane dorme','cane dorme',false],
      ['l’amico arriva','amico arriva',false],
      ["dov’è","dovè",false],
    ];
    const session=createSession({requestId:'tolerant-translations',title:'Traduire',objective:'Vocabulaire',scheduledDate:'2026-01-01',exercises:[
      {type:'flashcard',instruction:'Traduisez.',items:cases.map(([italian])=>({content:'Mot à traduire',answer:{italian,example:'Exemple.'}}))},
      {type:'cloze',instruction:'Complétez.',items:[{content:'Article et nom',answer:{accepted:['il libro']}},{content:'Salutation',answer:{accepted:['buongiorno']}}]},
    ]});
    publishSession(String(session.id));
    const items=getSession(String(session.id)).exercises;
    cases.forEach(([expected,answer,correct,articleOmitted],index)=>{
      const input={exerciseId:String(items[index].id),requestId:'tolerance-'+index,answer,mode:'translation'};
      const result=submitAttempt(input);
      assert.equal(result.is_correct,Number(correct),`${answer} → ${expected}`);
      assert.equal(result.feedback?.articleOmitted,articleOmitted);
      assert.deepEqual(result.feedback?.accepted,[expected]);
      assert.deepEqual(getAttempt(String(result.id)).feedback,result.feedback);
      assert.equal(submitAttempt(input).id,result.id);
    });
    assert.equal(submitAttempt({exerciseId:String(items[cases.length].id),requestId:'strict-article',answer:'libro'}).is_correct,0);
    assert.equal(submitAttempt({exerciseId:String(items[cases.length+1].id),requestId:'strict-punctuation',answer:'buongiorno!'}).is_correct,0);
  } finally { delete process.env.ITALIANO_DB_PATH; rmSync(dir,{recursive:true,force:true}); }
});
