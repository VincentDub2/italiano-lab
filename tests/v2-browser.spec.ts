import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { randomUUID } from 'node:crypto';
const base=process.env.ITALIANO_TEST_URL || 'http://127.0.0.1:3211';
async function professor() {
 if (!process.env.ITALIANO_DB_PATH) throw new Error('Base isolée requise.');
 const client=new Client({name:'browser-professor',version:'1'});
 await client.connect(new StdioClientTransport({command:'/bin/sh',args:['scripts/mcp.sh'],env:process.env as Record<string,string>,stderr:'pipe'}));
 const call=async(name:string,args:Record<string,unknown>)=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(JSON.stringify(r));return JSON.parse((r.content as {text:string}[])[0].text);};
 return {client,call};
}
test('retour de difficulté facultatif au bilan, relu par le prof et conservé au rechargement',async({page})=>{
 const {client,call}=await professor();
 try {
  const title='Niveau '+randomUUID();
  const {id}=await call('create_session',{requestId:title,title,objective:'Saluer',scheduledDate:'2020-01-01',exercises:[{type:'cloze',instruction:'Complétez la salutation.',content:'___ Marco !',answer:{accepted:['ciao']}}]});
  await call('publish_session',{sessionId:id});
  await page.setViewportSize({width:390,height:844});
  await page.goto(base);
  const open=()=>page.getByRole('button',{name:new RegExp(title)}).click();
  const next=()=>page.getByRole('button',{name:'Continuer',exact:true}).click();
  const choices=page.getByRole('region',{name:'Comment avez-vous trouvé cette séance ?'});
  await open();
  await expect(choices).toHaveCount(0);
  await page.getByRole('textbox',{name:'Votre réponse'}).fill('ciao');
  await page.getByRole('button',{name:'Envoyer',exact:true}).click();
  await next();
  await expect(choices.getByRole('button')).toHaveText(['Trop facile','Bon niveau','Trop difficile']);
  const summary=()=>call('get_learning_summary',{});
  expect((await call('get_session',{sessionId:id})).difficulty_feedback).toBeNull();
  const before=await summary();
  const right=choices.getByRole('button',{name:'Bon niveau',exact:true});
  await right.focus();
  await page.keyboard.press('Enter');
  await expect(choices.getByRole('status')).toHaveText('Retour enregistré pour le prof.');
  await expect(right).toHaveAttribute('aria-pressed','true');
  expect((await call('get_session',{sessionId:id})).difficulty_feedback).toBe('just_right');
  const after=await summary();
  expect(after.revisions).toEqual(before.revisions);
  expect(after.sessions).toContainEqual(expect.objectContaining({id,completed:1,difficulty_feedback:'just_right'}));
  await page.reload();
  await page.getByRole('button',{name:'Toutes les séances',exact:true}).click();
  await open();
  await next();
  await expect(right).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 } finally {await client.close();}
});
test('les cartes À retenir précèdent les exercices et persistent sans effet sur le suivi',async({page,request})=>{
 const {client,call}=await professor();
 try {
  const title='Accords '+randomUUID();
  const takeaways=[
   {title:'Accord au singulier',explanation:'Accordez le verbe avec le sujet.',examples:[{italian:'La ragazza canta.',french:'La fille chante.'}]},
   {title:'Accord au pluriel',explanation:'Changez la terminaison quand le sujet est pluriel.',examples:[{italian:'Le ragazze cantano.',french:'Les filles chantent.'}]},
  ];
  const {id}=await call('create_session',{requestId:title,title,objective:'Accorder le verbe',scheduledDate:'2020-01-01',takeaways,exercises:[{type:'cloze',instruction:'Accordez le verbe.',content:'I ragazzi ___.',answer:{accepted:['cantano']}}]});
  const sessionUrl=base+'/api/session?id='+id;
  expect((await request.get(sessionUrl)).status()).toBe(400);
  await call('publish_session',{sessionId:id});
  const readSession=async()=> (await request.get(sessionUrl)).json();
  const readProgress=async()=> (await request.get(base+'/api/learning-overview')).json();
  const before=await readProgress();
  const errors: string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto(base);
  const open=()=>page.getByRole('button',{name:new RegExp(title)}).click();
  await open();
  const cards=page.getByRole('region',{name:'À retenir',exact:true});
  await expect(cards.getByRole('heading')).toHaveText(['À retenir','Accord au singulier','Accord au pluriel']);
  await expect(cards.getByText('La ragazza canta.')).toHaveAttribute('lang','it');
  await expect(cards.getByText('La fille chante.')).toBeVisible();
  await expect(cards.getByRole('button')).toHaveCount(0);
  const question=page.getByRole('heading',{name:'Accordez le verbe.',exact:true});
  await expect(question).toBeVisible();
  const cardBounds=await cards.boundingBox(), questionBounds=await question.boundingBox();
  expect(cardBounds!.y+cardBounds!.height).toBeLessThan(questionBounds!.y);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();
  await open();
  await expect(cards.getByText('Les filles chantent.')).toBeVisible();
  const session=await readSession();
  expect(session.takeaways).toEqual(takeaways);
  expect(session.exercises).toEqual([expect.objectContaining({latestAttempt:null,alreadyReviewed:false})]);
  expect(await readProgress()).toEqual(before);
  const progressbar=page.getByRole('progressbar',{name:'Progression de la séance'});
  await expect(progressbar).toHaveAttribute('value','0');
  await expect(progressbar).toHaveAttribute('max','1');
  await page.getByRole('textbox',{name:'Votre réponse'}).fill('cantano');
  await page.getByRole('button',{name:'Envoyer',exact:true}).click();
  await expect(progressbar).toHaveAttribute('value','1');
  expect((await readSession()).exercises[0].latestAttempt).toMatchObject({answer:'cantano',is_correct:1,assisted:false});
  expect(errors).toEqual([]);
 } finally {await client.close();}
});
test('séance : cartes, trous, correction différée et reprise sans écraser les réponses',async({page,request})=>{
 const {client,call}=await professor();
 try {
  const title='Séance '+randomUUID();
  const s=await call('create_session',{requestId:title,title,objective:'Pratiquer',scheduledDate:'2020-01-01',exercises:[{type:'flashcard',instruction:'Carte test',content:'Salut test',answer:{italian:'Ciao segreto',example:'Ciao esempio'}},{type:'cloze',instruction:'Trou test',content:'Lui ___',answer:{accepted:['è']},explanation:'Accent italien.'},{type:'free_text',instruction:'Texte test',content:'Une phrase test',answer:{}}]});
  expect((await request.get(base+'/api/session?id='+s.id)).status()).toBe(400);await call('publish_session',{sessionId:s.id});
  const payload=await (await request.get(base+'/api/session?id='+s.id)).text();expect(payload).not.toMatch(/Ciao segreto|Accent italien/);
  await page.goto(base);await page.getByRole('button',{name:new RegExp(title)}).click();
  await expect(page.getByRole('region',{name:'À retenir',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Mémoriser',exact:true}).click();
  await page.getByRole('button',{name:'Révéler la réponse',exact:true}).click();await expect(page.getByText('Ciao segreto',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Je savais',exact:true}).click();await expect(page.getByText('Auto-évaluation enregistrée.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Continuer',exact:true}).click();
  await page.getByRole('textbox',{name:'Votre réponse'}).fill('e');await page.getByRole('button',{name:'Envoyer',exact:true}).click();
  await expect(page.locator('.exercise-feedback')).toContainText('À revoir.');await expect(page.getByRole('textbox',{name:'Votre réponse'})).toHaveAttribute('aria-invalid','true');
  await page.getByRole('button',{name:'Continuer',exact:true}).click();
  await page.getByRole('textbox',{name:'Votre réponse'}).fill('Sono pronto');await page.getByRole('button',{name:'Envoyer',exact:true}).click();await expect(page.locator('.exercise-feedback')).toContainText('En attente du professeur');
  const pending=await call('get_pending_answers',{});const a=pending.find((x:{answer:string})=>x.answer==='Sono pronto');
  await call('submit_feedback',{attemptId:a.id,result:'correct',correction:'Sono pronto.',explanation:'Bravo.'});
  await page.getByRole('button',{name:'Actualiser',exact:true}).click();await expect(page.locator('.exercise-feedback')).toContainText('Sono pronto.');
  await page.reload();await page.getByRole('button',{name:'Toutes les séances',exact:true}).click();await page.getByRole('button',{name:new RegExp(title)}).click();
  await expect(page.getByRole('heading',{name:'Carte test',exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'Navigation principale'}).getByRole('button',{name:'Carnet d’erreurs',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Carnet d’erreurs',exact:true})).toBeVisible();
  await expect(page.getByText('Accent italien.',{exact:true})).toBeVisible();
 } finally {await client.close();}
});
test('questionnaire au clavier, progression par item et correction conservée',async({page})=>{
 const {client,call}=await professor();
 try {
  const title='Questionnaire '+randomUUID();
  const s=await call('create_session',{requestId:title,title,objective:'Piacere',scheduledDate:'2020-01-01',exercises:[{type:'questionnaire',instruction:'Choisissez piacere.',items:[{content:'Mi ___ il cane.',choices:[{value:'a',label:'piace'},{value:'b',label:'piacciono'}],answer:{value:'a'},explanation:'Singulier.'},{content:'Mi ___ i gatti.',choices:[{value:'a',label:'piace'},{value:'b',label:'piacciono'}],answer:{value:'b'},explanation:'Pluriel.'}]}]});await call('publish_session',{sessionId:s.id});
  await page.goto(base);await page.getByRole('button',{name:new RegExp(title)}).click();
  await page.getByRole('radio',{name:'piacciono',exact:true}).focus();await page.keyboard.press('Space');await page.keyboard.press('Enter');await expect(page.locator('.exercise-feedback')).toContainText('À revoir.');
  await page.getByRole('button',{name:'Continuer',exact:true}).click();await page.getByRole('radio',{name:'piacciono',exact:true}).check();await page.getByRole('button',{name:'Vérifier ma réponse',exact:true}).click();await expect(page.locator('.exercise-feedback')).toContainText('Correct.');
  await expect(page.getByRole('progressbar',{name:'Progression de la séance'})).toHaveAttribute('value','2');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.session-detail').screenshot({path:'artifacts/revision-questionnaire-mobile.png'});
  const journal=await call('get_error_journal',{});expect(journal.items.some((x:{history:{answer:string}[]})=>x.history.some(a=>a.answer==='b'))).toBe(true);
 } finally {await client.close();}
});

test('phrase guidée : publication, indices, correction professeur et historique après rechargement',async({page,request})=>{
 const {client,call}=await professor();
 try {
  const title='Phrase guidée '+randomUUID();
  const hint='Commencez par une formule polie.';
  const example='Vorrei un chilo di mele, per favore.';
  const {itemIds}=await call('create_bank_exercise',{requestId:title,notions:['Achats au marché'],exercise:{
   type:'sentence',instruction:'Écrivez une phrase complète.',items:[{
    content:'Demandez poliment un kilo de pommes au marché.',
    sentence:{format:'guided',hints:[hint,'Vous pouvez employer vorrei.'],rubric:{criteria:'Demander un kilo de pommes poliment.',example}},
   }],
  }});
  const session=await call('compose_session',{requestId:'session-'+title,title,objective:'Demander poliment',scheduledDate:'2020-01-01',itemIds});
  expect((await request.get(base+'/api/session?id='+session.id)).status()).toBe(400);
  await call('publish_session',{sessionId:session.id});
  expect((await call('get_session',{sessionId:session.id})).status).toBe('published');
  const payload=await (await request.get(base+'/api/session?id='+session.id)).text();
  expect(payload).not.toContain(hint);
  expect(payload).not.toContain(example);

  await page.goto(base);
  await page.getByRole('button',{name:new RegExp(title)}).click();
  await page.getByRole('button',{name:'Afficher un indice'}).click();
  await expect(page.getByText(hint,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Indice suivant'}).click();
  await expect(page.getByText('Vous pouvez employer vorrei.',{exact:true})).toBeVisible();

  const sentence=page.getByRole('textbox',{name:'Votre phrase'});
  const initial='Posso avere un chilo di mela, per favore?';
  await sentence.fill(initial);
  await page.route('**/api/attempt',route=>route.fulfill({status:500,body:'{}'}),{times:1});
  await page.getByRole('button',{name:'Envoyer au professeur'}).click();
  await expect(page.getByRole('region',{name:'Votre pratique'}).getByRole('alert')).toContainText('Opération impossible');
  await expect(sentence).toHaveValue(initial);
  await page.getByRole('button',{name:'Renvoyer'}).click();
  await expect(page.getByRole('status').filter({hasText:'En attente du professeur'})).toBeVisible();
  const [first]=(await call('get_pending_answers',{})).filter((entry:{answer:string})=>entry.answer===initial);
  expect(first).toMatchObject({status:'pending_teacher',is_correct:null,hintCount:2,rubric:{example}});
  expect(await call('get_error_journal',{})).toMatchObject({items:expect.not.arrayContaining([expect.objectContaining({item_id:itemIds[0]})])});
  const corrected='Posso avere un chilo di mele, per favore?';
  const explanation='On emploie le pluriel mele pour un kilo de pommes.';
  await call('submit_feedback',{attemptId:first.id,result:'partial',correction:corrected,explanation});
  expect((await call('get_attempt',{attemptId:first.id})).feedback.explanation).toBe(explanation);
  await page.getByRole('button',{name:'Actualiser',exact:true}).click();
  await expect(page.getByText(corrected,{exact:true})).toBeVisible();
  await expect(page.getByText(explanation,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reformuler',exact:true}).click();
  await expect(sentence).toBeFocused();
  await expect(page.getByText(hint,{exact:true})).toHaveCount(0);
  await sentence.fill(corrected);
  await page.getByRole('button',{name:'Envoyer au professeur'}).click();
  await expect(page.getByText('Tentatives précédentes (1)')).toBeVisible();
  const [retry]=(await call('get_pending_answers',{})).filter((entry:{retryOf:string})=>entry.retryOf===first.id);
  expect(retry).toMatchObject({answer:corrected,hintCount:0,is_correct:null,assisted:1});
  await call('submit_feedback',{attemptId:retry.id,result:'correct',correction:corrected,explanation:'Demande polie et naturelle.'});
  await page.reload();
  await page.getByRole('button',{name:'Toutes les séances',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(title)}).click();
  await expect(page.getByText('Demande polie et naturelle.',{exact:true})).toBeVisible();
  await page.getByText('Tentatives précédentes (1)',{exact:true}).click();
  await expect(page.getByText(initial,{exact:true})).toBeVisible();
  await expect(page.getByText(explanation,{exact:true})).toBeVisible();
 } finally {await client.close();}
});

test('construction de phrases : mots au clavier, transformation et réponse en situation',async({page})=>{
 const {client,call}=await professor();
 try {
  const title='Activités de phrase '+randomUUID();
  const session=await call('create_session',{requestId:title,title,objective:'Construire et transformer',scheduledDate:'2020-01-01',exercises:[{
   type:'sentence',instruction:'Construisez la phrase demandée.',items:[
    {content:'Reconstituez une commande au café.',sentence:{format:'word_order',tokens:['caffè.','un','Prendo'],orders:[[2,1,0]]}},
    {content:'Mettez « Prendo un caffè. » à la forme négative.',sentence:{format:'transformation',rubric:{criteria:'Garder le sujet et ajouter la négation.'}}},
    {content:'Au restaurant, on vous demande « Che cosa bevi? ».',sentence:{format:'question',rubric:{criteria:'Répondre avec une phrase complète.'}}},
   ],
  }]});
  await call('publish_session',{sessionId:session.id});
  await page.goto(base);
  await page.getByRole('button',{name:new RegExp(title)}).click();
  const wordBank=page.getByRole('group',{name:'Mots à placer'});
  await wordBank.getByRole('button',{name:'Prendo',exact:true}).press('Space');
  await wordBank.getByRole('button',{name:'un',exact:true}).press('Space');
  await expect(page.getByRole('button',{name:'Vérifier la phrase'})).toBeDisabled();
  await wordBank.getByRole('button',{name:'caffè.',exact:true}).press('Space');
  await page.getByRole('button',{name:'Vérifier la phrase'}).press('Enter');
  await expect(page.getByRole('status').filter({hasText:'Correct'})).toBeVisible();

  for (const [format,answer] of [['Transformation','Non prendo un caffè.'],['Réponse à une question','Bevo dell’acqua.']]) {
   await page.getByRole('button',{name:'Continuer',exact:true}).click();
   await expect(page.getByText(format,{exact:true})).toBeVisible();
   await page.getByRole('textbox',{name:'Votre phrase'}).fill(answer);
   await page.getByRole('button',{name:'Envoyer au professeur'}).click();
   await expect(page.getByRole('status').filter({hasText:'En attente du professeur'})).toBeVisible();
  }
 } finally {await client.close();}
});

test('mini-dialogue en entraînement libre : répliques, correction et reformulation sur mobile',async({page})=>{
 const {client,call}=await professor();
 try {
  const requestId=randomUUID();
  const {itemIds}=await call('create_bank_exercise',{requestId,exercise:{
   type:'sentence',instruction:'Répondez au libraire.',items:[{content:'À la librairie.',sentence:{
    format:'dialogue',turns:['Che libro cerca?','Lo vuole in italiano?'],rubric:{criteria:'Indiquer un livre et la langue souhaitée.'},
   }}],
  }});
  await page.addInitScript(draft=>sessionStorage.setItem('italiano-practice-active',JSON.stringify(draft)),
   {requestId:'practice-'+requestId,count:1,itemIds,voluntary:true});
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/entrainement');
  await page.getByRole('textbox',{name:'Votre réplique 1'}).fill('Cerco un romanzo di Calvino.');
  await expect(page.getByRole('button',{name:'Envoyer au professeur'})).toBeDisabled();
  await page.getByRole('textbox',{name:'Votre réplique 2'}).fill('Sì, in italiano per favore.');
  await page.getByRole('button',{name:'Envoyer au professeur'}).click();
  await expect(page.getByRole('status').filter({hasText:'En attente du professeur'})).toBeVisible();
  const [entry]=(await call('get_pending_answers',{})).filter((row:{item_id:string})=>row.item_id===itemIds[0]);
  const feedback={
   attemptId:entry.id,result:'correct',correction:'Cerco un romanzo di Calvino. Sì, in italiano, per favore.',explanation:'Le dialogue est complet.',
   turns:[
    {correction:'Cerco un romanzo di Calvino.',explanation:'La demande est précise.'},
    {correction:'Sì, in italiano, per favore.',explanation:'La langue est indiquée poliment.'},
   ],
  };
  await call('submit_feedback',feedback);
  expect((await call('get_attempt',{attemptId:entry.id})).feedback.turns).toEqual(feedback.turns);
  await page.getByRole('button',{name:'Actualiser',exact:true}).click();
  await expect(page.getByText(feedback.turns[1].explanation,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reformuler',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Votre réplique 1'})).toHaveValue('');
  await expect(page.getByRole('textbox',{name:'Votre réplique 2'})).toHaveValue('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 } finally {await client.close();}
});
