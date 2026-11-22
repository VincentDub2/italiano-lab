import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { rm, writeFile } from 'node:fs/promises';

const base = process.env.ITALIANO_TEST_URL || 'http://127.0.0.1:3211';
const clockFile = process.env.ITALIANO_TEST_CLOCK;
const externalFile = process.env.ITALIANO_REMINDERS_PATH;
const title = 'Raconter un imprévu';
const subject = 'Imparfait et passé composé';

async function professor() {
 const client = new Client({name:'proactive-browser-test',version:'1'});
 await client.connect(new StdioClientTransport({
  command:'/bin/sh',args:['scripts/mcp.sh'],
  env:{...process.env,NODE_OPTIONS:`${process.env.NODE_OPTIONS ?? ''} --import=./tests/browser-clock.mjs`.trim()} as Record<string,string>,
  stderr:'pipe',
 }));
 const call = async(name:string,args:Record<string,unknown>)=>{
  const response = await client.callTool({name,arguments:args});
  const payload = (response.content as {text:string}[])[0].text;
  if (response.isError) throw new Error(payload);
  return JSON.parse(payload);
 };
 return {client,call};
}

const submit = (request: APIRequestContext, exerciseId: string, requestId: string, answer: string) =>
 request.post(base+'/api/attempt',{headers:{origin:base},data:{exerciseId,requestId,answer}});

test('du signal MCP au jalon réellement effectué dans Next.js',async({page,request})=>{
 if (!process.env.ITALIANO_DB_PATH || !clockFile || !externalFile) throw new Error('Utilisez test:browser:isolated.');
 const connection = await professor(), concurrent = await professor();
 const {call} = connection;
 const lessonDate = '2026-03-28';
 const setTime = async(value:string)=>{
  await writeFile(clockFile,value);
  await page.clock.setFixedTime(new Date(value));
 };
 const bankItem = async(requestId:string,content:string,closed=false)=>{
  const exercise = closed
   ? {type:'cloze',instruction:'Complétez avec le temps adapté.',items:[{content,answer:{accepted:['sono andato']}}]}
   : {type:'sentence',instruction:'Répondez en italien.',items:[{content,sentence:{format:'question',rubric:{criteria:'Employer les deux temps dans une situation compréhensible.',example:'Ce modèle privé ne doit pas apparaître.'}}}]};
  return (await call('create_bank_exercise',{requestId,exercise,notions:[subject]})).itemIds[0];
 };
 try {
  await setTime('2026-03-28T22:57:00Z');
  const {id:notionId}=await call('resolve_learning_notion',{requestId:'notion-des-temps',name:subject});
  const observations=[{notionId,kind:'error',explanation:'L’événement ponctuel demande le passé composé.'}];
  const evidenceAttemptIds=[];
  for (const [key,prompt] of [['bus','Racontez un retard de bus.'],['marché','Racontez un imprévu au marché.']]) {
   const item = await bankItem('preuve-'+key,prompt);
   const {id} = await call('compose_session',{requestId:'séance-'+key,title:'Situation '+key,objective:'Raconter',scheduledDate:lessonDate,itemIds:[item]});
   await call('publish_session',{sessionId:id});
   const exercise=(await call('get_session',{sessionId:id})).exercises[0];
   const written = await submit(request,exercise.id,'tentative-'+key,'Andavo al mercato, poi andavo a casa.');
   expect(written.ok()).toBe(true);
   const {id:attemptId}=await written.json();
   evidenceAttemptIds.push(attemptId);
   const correction={requestId:'correction-'+key,attemptId,result:'incorrect',correction:'Andavo al mercato, poi sono tornato a casa.',explanation:'La deuxième action est terminée.',observations};
   await call('submit_feedback',correction);
   await call('submit_feedback',correction);
   expect((await call('get_attempt',{attemptId})).observations).toEqual(observations);
  }
  const signals=await call('list_learning_signals',{notionId});
  expect(signals.candidates[0].evidence.map((e:{attemptId:string})=>e.attemptId)).toEqual(expect.arrayContaining(evidenceAttemptIds));
  const restitution=await bankItem('restitution-temps','Ieri ___ a una mostra.',true);
  const application=await bankItem('application-temps','Racontez un changement de train sous la pluie.');
  const lessonInput={
   notionId,evidenceAttemptIds,title,objective:'Situer une action dans le passé',reason:'Les deux récits mélangent les temps.',
   itemIds:[restitution,application],reminders:[{
    title:subject,explanation:'Décrivez le contexte à l’imparfait et l’événement au passé composé.',
    examples:[{italian:'Pioveva quando sono uscito.',french:'Il pleuvait quand je suis sorti.'}],
   }],
  };
  const [draft,duplicate] = await Promise.all([
   call('create_proactive_lesson',{...lessonInput,requestId:'draft-v1'}),
   concurrent.call('create_proactive_lesson',{...lessonInput,requestId:'draft-v1-concurrent'}),
  ]);
  expect((await call('get_session',{sessionId:draft.sessionId})).status).toBe('draft');
  expect((await (await request.get(base+'/api/lessons')).json())).toHaveLength(0);
  const publication = await Promise.allSettled([
   call('publish_proactive_lesson',{lessonId:draft.id,requestId:'publish-v1'}),
   concurrent.call('publish_proactive_lesson',{lessonId:duplicate.id,requestId:'publish-v1-concurrent'}),
  ]);
  expect(publication.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const advised = publication[0].status==='fulfilled' ? draft : duplicate;
  const blocked = advised.id===draft.id ? duplicate : draft;
  expect((await call('get_session',{sessionId:blocked.sessionId})).status).toBe('draft');
  const sessionUrl = base+'/api/session?id='+advised.sessionId;
  const preview=await (await request.get(sessionUrl)).json();
  expect(JSON.stringify(preview)).not.toMatch(/modèle privé|rubric|answer_json|sono andato/);
  expect((await submit(request,preview.exercises[0].id,'premature','sono andato')).status()).toBe(400);

  await page.setViewportSize({width:390,height:844});
  await page.goto(base);
  const advice=page.getByRole('region',{name:'Leçons du professeur'});
  await expect(advice.getByRole('heading',{name:title})).toBeVisible();
  await expect(page.getByRole('region',{name:'Votre pratique'}).getByText(title,{exact:true})).toHaveCount(0);
  await advice.getByRole('link',{name:'Voir la leçon'}).click();
  await expect(page.getByText('Pioveva quando sono uscito.')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect((await call('get_proactive_lesson',{lessonId:advised.id})).milestones).toEqual([]);
  const start=page.getByRole('button',{name:'Commencer',exact:true});
  await start.focus();
  await page.keyboard.press('Enter');
  const work = page.getByRole('region',{name:'Contenu de la leçon'});
  await work.getByRole('textbox',{name:'Votre réponse'}).fill('sono andato');
  await work.getByRole('button',{name:'Envoyer'}).click();
  await expect(work.getByText('Correct.',{exact:true})).toBeVisible();
  await page.reload();
  await expect(work.getByText('Racontez un changement de train sous la pluie.')).toBeVisible();
  await work.getByRole('textbox',{name:'Votre phrase'}).fill('Pioveva e ho cambiato treno.');
  await work.getByRole('button',{name:'Envoyer au professeur'}).click();
  await expect(page.getByText('En attente de correction',{exact:true})).toBeVisible();
  const finalId=preview.exercises[1].id;
  const pending=(await call('get_pending_answers',{})).find((a:{exercise_id:string})=>a.exercise_id===finalId);
  expect((await call('get_proactive_lesson',{lessonId:advised.id})).milestones).toEqual([]);
  await setTime('2026-03-28T23:03:00Z');
  const j0Feedback={requestId:'corriger-j0',attemptId:pending.id,result:'correct',correction:'Pioveva e ho cambiato treno.',explanation:'Les deux temps conviennent.'};
  await call('submit_feedback',j0Feedback);
  await call('submit_feedback',j0Feedback);
  await work.getByRole('button',{name:'Actualiser'}).click();
  await expect(page.getByText('J0 terminé',{exact:true})).toBeVisible();
  const dates=page.getByRole('region',{name:'Révisions de la leçon'});
  await expect(dates.getByRole('listitem')).toHaveCount(5);
  const completed=await call('get_proactive_lesson',{lessonId:advised.id});
  expect(completed.j0Date).toBe('2026-03-29');
  const milestone=completed.milestones[0];
  expect(milestone.date).toBe('2026-03-30');

  await setTime('2026-03-29T22:03:00Z');
  await writeFile(externalFile,JSON.stringify({themes:[{titre:title,dates:{J1:milestone.date}}]}));
  const legacy=await (await request.get(base+'/api/reminders')).json();
  expect(legacy).toEqual({state:'available',reminders:[{theme:title,date:milestone.date,step:'J1',due:true}]});
  const combined=await (await request.get(base+'/api/revision-calendar')).json();
  const sameTitle=combined.reminders.filter((r:{theme:string;date:string})=>r.theme===title && r.date===milestone.date);
  expect(sameTitle).toHaveLength(2);
  expect(new Set(sameTitle.map((r:{id:string})=>r.id)).size).toBe(2);
  expect(sameTitle.map((r:{source:string})=>r.source).sort()).toEqual(['external','lesson']);
  await writeFile(externalFile,'{');
  await page.goto(base);
  await expect(page.getByRole('region',{name:'Rappels thématiques'}).getByRole('alert')).toContainText('Calendrier externe indisponible');
  await expect(page.getByRole('list',{name:'Rappels du jour'})).toContainText(title);
  await rm(externalFile);
  const missing=await (await request.get(base+'/api/revision-calendar')).json();
  expect(missing.state).toBe('missing');
  expect(missing.reminders).toHaveLength(5);

  const plan=await call('get_daily_plan',{});
  expect(plan.revisionMilestones[0]).toMatchObject({id:milestone.id,timing:'today'});
  const extra=await bankItem('item-sans-lien','Ieri ___ in piscina.',true);
  const target=await bankItem('item-avec-lien','Una volta ___ a teatro in bici.',true);
  const final=await bankItem('champ-final-quotidien','Racontez une panne pendant un appel.');
  const daily=await call('compose_session',{requestId:'italiano-daily-'+milestone.date,title:'Une panne pendant un appel',
   objective:'Employer les deux temps',scheduledDate:milestone.date,itemIds:[extra,target,final],
   revisionLinks:[{milestoneId:milestone.id,positions:[1]}],
  });
  const dailySession=await call('get_session',{sessionId:daily.id});
  expect(dailySession.revision_links[0].occurrenceIds).toEqual([dailySession.exercises[1].id]);
  await call('publish_session',{sessionId:daily.id,requestId:'publish-daily'});
  const readMilestone=async()=>(await call('get_proactive_lesson',{lessonId:advised.id})).milestones[0];
  expect((await readMilestone()).completedAt).toBeNull();
  const dailyCard=page.getByRole('button',{name:/Une panne pendant un appel/});
  await page.reload();
  await dailyCard.click();
  const dailyWork=page.getByRole('region',{name:'Votre pratique'});
  await dailyWork.getByRole('textbox',{name:'Votre réponse'}).fill('sono andato');
  await dailyWork.getByRole('button',{name:'Envoyer'}).click();
  await expect(dailyWork.getByText('Correct.',{exact:true})).toBeVisible();
  expect((await readMilestone()).completedAt).toBeNull();
  await dailyWork.getByRole('button',{name:'Continuer',exact:true}).click();
  await dailyWork.getByRole('textbox',{name:'Votre réponse'}).fill('andavo');
  await dailyWork.getByRole('button',{name:'Envoyer'}).click();
  await expect(dailyWork.getByText('À revoir.',{exact:true})).toBeVisible();
  expect(await readMilestone()).toMatchObject({id:milestone.id,result:'needs_work'});
  await page.goto(base+'/lecons');
  await expect(page.getByRole('heading',{name:'Mes leçons',exact:true})).toBeVisible();
  await expect(page.getByText(/Prochaine révision · J3/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

  const extraProofIds = [];
  const newNotion = await call('resolve_learning_notion',{requestId:'notion-politesse',name:'Politesse'});
  for (const [i,prompt] of ['Demandez un horaire à la gare.','Demandez un rendez-vous à un collègue.'].entries()) {
   const s=await call('create_session',{requestId:'politesse-'+i,title:'Politesse '+i,objective:'Demander',scheduledDate:milestone.date,
    exercises:[{type:'free_text',instruction:'Écrivez une phrase.',content:prompt,answer:{}}]});
   await call('publish_session',{sessionId:s.id});
   const sExercise=(await call('get_session',{sessionId:s.id})).exercises[0];
   const response=await submit(request,sExercise.id,'politesse-essai-'+i,'Voglio partire.');
   expect(response.ok()).toBe(true);
   const {id:attemptId}=await response.json();
   extraProofIds.push(attemptId);
   await call('submit_feedback',{attemptId,result:'partial',correction:'Vorrei partire.',explanation:'Adoucissez la demande.',
    observations:[{notionId:newNotion.id,kind:'error',explanation:'La formulation est trop directe pour la consigne.'}]});
  }
  const exercise2=await call('create_bank_exercise',{requestId:'nouveaux-items-politesse',notions:['Politesse'],exercise:{
   type:'cloze',instruction:'Complétez.',items:[{content:'___ un caffè.',answer:{accepted:['Vorrei']}}],
  }});
  const written2=await call('create_bank_exercise',{requestId:'ouvert-politesse',notions:['Politesse'],exercise:{
   type:'free_text',instruction:'Faites une demande.',content:'Demandez une table au restaurant.',answer:{},
  }});
  const optional=await call('create_proactive_lesson',{...lessonInput,requestId:'politesse-leçon',notionId:newNotion.id,
   evidenceAttemptIds:extraProofIds,itemIds:[exercise2.itemIds[0],written2.itemIds[0]],title:'Demander poliment',
   reason:'Deux demandes directes dans un contexte formel.',reminders:[{title:'Politesse',explanation:'Utilisez le conditionnel.',
    examples:[{italian:'Vorrei prenotare.',french:'Je voudrais réserver.'}]}],
  });
  await call('publish_proactive_lesson',{lessonId:optional.id,requestId:'politesse-conseillée'});
  await page.goto(base);
  await advice.getByRole('button',{name:'Pas maintenant'}).click();
  await expect(advice.getByRole('heading',{name:'Demander poliment'})).toHaveCount(0);
  expect(await call('get_proactive_lesson',{lessonId:optional.id})).toMatchObject({status:'dismissed',milestones:[]});
 } finally {
  await connection.client.close();
  await concurrent.client.close();
  await rm(clockFile,{force:true});
  await rm(externalFile,{force:true});
 }
});
