import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { rm, writeFile } from 'node:fs/promises';

const base=process.env.ITALIANO_TEST_URL || 'http://127.0.0.1:3211';
const clockFile=process.env.ITALIANO_TEST_CLOCK;

test('bilan et leçon de progression avec Next.js, SQLite et le vrai lanceur MCP',async({page,request})=>{
 if (!process.env.ITALIANO_DB_PATH || !clockFile) throw new Error('Utilisez test:browser:isolated.');
 const client=new Client({name:'notion-browser-test',version:'1'});
 await client.connect(new StdioClientTransport({
  command:'/bin/sh',args:['scripts/mcp.sh'],
  env:{...process.env,NODE_OPTIONS:`${process.env.NODE_OPTIONS ?? ''} --import=./tests/browser-clock.mjs`.trim()} as Record<string,string>,
  stderr:'pipe',
 }));
 const call=async(name:string,args:Record<string,unknown>={})=>{
  const result=await client.callTool({name,arguments:args});
  const body=(result.content as {text:string}[])[0].text;
  if (result.isError) throw new Error(body);
  return JSON.parse(body);
 };
 const post=(action:string,data:object)=>request.post(base+'/api/'+action,{headers:{origin:base},data});
 const bank=async(key:string,label:string,content:string,closed=false)=>{
  const exercise=closed ? {type:'cloze',instruction:'Complétez en italien.',content,answer:{accepted:['vorrei']}} :
   {type:'sentence',instruction:'Écrivez votre réponse.',items:[{content,sentence:{
    format:'question',rubric:{criteria:'Écrire une demande polie et compréhensible.',example:'MODÈLE PRIVÉ V2B'},
   }}]};
  return (await call('create_bank_exercise',{requestId:'v2b-bank-'+key,exercise,notions:[label]})).itemIds[0];
 };
 const prerequisite='Formuler une demande à un inconnu';
 const target='Expliquer un problème à la billetterie';
 const writtenPrompt='Demandez au guichet quand part le dernier ferry.';
 const automaticPrompt='Buonasera, ___ un’informazione.';
 const lessonTitle='Expliquer un problème de billet';
 try {
  const instant='2026-05-01T22:12:00Z';
  await writeFile(clockFile,instant);
  await page.clock.setFixedTime(new Date(instant));
  const {id:prerequisiteId}=await call('resolve_learning_notion',{requestId:'v2b-notion',name:prerequisite});
  const {id:targetId}=await call('resolve_learning_notion',{requestId:'v2b-target',name:target});
  await call('resolve_learning_notion',{requestId:'v2b-dormant',name:'Notion sans activité V2B'});
  const open=await bank('preuve',prerequisite,writtenPrompt);
  const {id:originalId}=await call('compose_session',{requestId:'v2b-proof-session',title:'Le dernier ferry',objective:'Demander un horaire',
   scheduledDate:'2026-05-02',itemIds:[open]});
  await call('publish_session',{sessionId:originalId});
  const original=(await call('get_session',{sessionId:originalId})).exercises[0];
  const answerResponse=await post('attempt',{exerciseId:original.id,requestId:'v2b-written',answer:'Mi scusi, vorrei sapere quando parte l’ultimo traghetto.'});
  expect(answerResponse.ok()).toBe(true);
  const {id:attemptId}=await answerResponse.json();
  await call('submit_feedback',{attemptId,result:'correct',correction:'Mi scusi, vorrei sapere quando parte l’ultimo traghetto.',
   explanation:'Votre demande est claire et polie.',observations:[{notionId:prerequisiteId,kind:'strength',explanation:'OBSERVATION INTERNE V2B'}]});
  expect((await call('list_notion_progress',{notionId:prerequisiteId,limit:1})).notions[0].status).toBe('assessing');

  const cloze=await bank('cible-unique',prerequisite,automaticPrompt,true);
  const seriesResponse=await post('practice-start',{requestId:'v2b-série',count:1,itemIds:[cloze],voluntary:true});
  expect(seriesResponse.ok()).toBe(true);
  const series=await seriesResponse.json();
  const autoResponse=await post('practice-answer',{seriesId:series.id,questionId:cloze,requestId:'v2b-auto',answer:'vorrei'});
  expect(autoResponse.ok()).toBe(true);
  const auto=(await autoResponse.json()).attempt;
  const teacher=(await call('list_notion_progress',{notionId:prerequisiteId,limit:1})).notions[0];
  expect(teacher.status).toBe('recent_success');
  expect(new Set(teacher.prerequisiteEvidenceIds)).toEqual(new Set([attemptId,auto.id]));
  const student=await (await request.get(base+'/api/notion-progress?notionId='+encodeURIComponent(prerequisiteId))).json();
  expect(student.notions[0].lastEvidenceDate).toBe('2026-05-02');
  expect(JSON.stringify(student)).not.toMatch(/INTERNE|MODÈLE|prerequisiteEvidenceIds|answerJson/);

  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/mon-niveau');
  const board=page.getByRole('region',{name:'Notions travaillées'});
  const heading=board.getByRole('heading',{name:prerequisite,exact:true});
  await expect(heading).toBeVisible();
  const card=board.locator('[data-slot="card"]').filter({has:page.getByRole('heading',{name:prerequisite,exact:true})});
  await expect(card.getByText('Réussi sans aide récemment',{exact:true})).toBeVisible();
  await expect(card.getByText(/Dernière preuve/)).toContainText('2 mai 2026');
  await expect(board.getByRole('heading',{name:'Notion sans activité V2B'})).toHaveCount(0);
  const resultLink=card.getByRole('link',{name:automaticPrompt,exact:true});
  await resultLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Tentative',exact:true})).toBeVisible();
  await expect(page.getByText('Réponse correcte',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText(automaticPrompt,{exact:true})).toBeVisible();
  await page.goBack();
  await card.getByRole('link',{name:writtenPrompt,exact:true}).click();
  await expect(page.getByText('Votre demande est claire et polie.',{exact:true})).toBeVisible();
  await expect(page.getByText('OBSERVATION INTERNE V2B',{exact:true})).toHaveCount(0);

  const targetClosed=await bank('fragments',target,'Per favore, ___ cambiare il biglietto.',true);
  const targetOpen=await bank('situation',target,'Votre billet a une date erronée. Expliquez le problème au guichet.');
  const proposal={notionId:targetId,kind:'next_step',prerequisiteNotionId:prerequisiteId,evidenceAttemptIds:teacher.prerequisiteEvidenceIds,
   title:lessonTitle,objective:'Faire comprendre une erreur de réservation',
   reason:'Vous savez demander une information poliment. Essayez maintenant d’ajouter le problème et la solution souhaitée.',
   itemIds:[targetClosed,targetOpen],reminders:[{title:'Expliquer le problème',explanation:'Indiquez l’erreur, puis demandez la modification.',
    examples:[{italian:'La data è sbagliata. Vorrei cambiarla.',french:'La date est incorrecte. Je voudrais la modifier.'}]}]};
  await expect(call('create_proactive_lesson',{...proposal,requestId:'v2b-rejet',evidenceAttemptIds:[attemptId]})).rejects.toThrow();
  const draft=await call('create_proactive_lesson',{...proposal,requestId:'v2b-draft'});
  expect(await call('get_proactive_lesson',{lessonId:draft.id})).toMatchObject({kind:'next_step',prerequisiteNotionId:prerequisiteId,status:'draft'});
  expect((await call('get_session',{sessionId:draft.sessionId})).exercises).toHaveLength(2);
  await call('publish_proactive_lesson',{lessonId:draft.id,requestId:'v2b-publish'});
  const competing=await call('create_proactive_lesson',{...proposal,requestId:'v2b-competition'});
  await expect(call('publish_proactive_lesson',{lessonId:competing.id,requestId:'v2b-slot'})).rejects.toThrow(/occupe déjà/);
  await page.goto(base+'/lecons');
  await page.getByRole('link',{name:lessonTitle,exact:true}).click();
  await expect(page.getByText('Pour aller plus loin',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Commencer',exact:true}).click();
  const work=page.getByRole('region',{name:'Contenu de la leçon'});
  await expect(work.getByRole('textbox',{name:'Votre réponse'})).toBeVisible();
  await call('rectify_feedback',{requestId:'v2b-rectifier',attemptId,correction:'Retour rectifié.',explanation:'Cette preuve doit être écartée.'});
  expect((await call('list_notion_progress',{notionId:prerequisiteId})).notions[0].status).toBe('assessing');
  expect(await call('get_proactive_lesson',{lessonId:draft.id})).toMatchObject({status:'in_progress',milestones:[]});
  await work.getByRole('textbox',{name:'Votre réponse'}).fill('vorrei');
  await work.getByRole('button',{name:'Envoyer',exact:true}).click();
  await work.getByRole('button',{name:'Continuer',exact:true}).click();
  await work.getByRole('textbox',{name:'Votre phrase'}).fill('La data è sbagliata. Vorrei cambiare il biglietto.');
  await work.getByRole('button',{name:'Envoyer au professeur'}).click();
  await expect(page.getByText('En attente de correction',{exact:true})).toBeVisible();
  expect((await call('get_proactive_lesson',{lessonId:draft.id})).milestones).toEqual([]);
  const finalOccurrence=(await call('get_session',{sessionId:draft.sessionId})).exercises[1].id;
  const pending=(await call('get_pending_answers')).find((a:{exercise_id:string})=>a.exercise_id===finalOccurrence);
  await call('submit_feedback',{attemptId:pending.id,result:'correct',correction:'La data è sbagliata. Vorrei cambiare il biglietto.',explanation:'Le problème et la demande sont clairs.'});
  await work.getByRole('button',{name:'Actualiser'}).click();
  await expect(page.getByText('J0 terminé',{exact:true})).toBeVisible();
  expect((await call('get_proactive_lesson',{lessonId:draft.id})).milestones).toHaveLength(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 } finally {
  try {await client.close();} finally {await rm(clockFile,{force:true});}
 }
});
