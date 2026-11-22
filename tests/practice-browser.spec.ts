import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { randomUUID } from 'node:crypto';
const base=process.env.ITALIANO_TEST_URL || 'http://127.0.0.1:3211';
test('banque → séance → erreur → nouvel essai après trois items → carnet → entraînement libre',async({page})=>{
 if (!process.env.ITALIANO_DB_PATH) throw new Error('Base isolée requise.');
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const client=new Client({name:'learning-browser',version:'1'});await client.connect(new StdioClientTransport({command:'/bin/sh',args:['scripts/mcp.sh'],env:process.env as Record<string,string>,stderr:'pipe'}));
 const call=async(name:string,args:Record<string,unknown>)=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(JSON.stringify(r));return JSON.parse((r.content as {text:string}[])[0].text);};
 try {
  const token=randomUUID(),notion='Notion '+token,title='Séance ciblée '+token;
  const group=await call('create_bank_exercise',{requestId:'bank-'+token,notions:[notion],exercise:{type:'cloze',instruction:'Complétez la salutation.',objective:notion,items:Array.from({length:4},(_,i)=>({content:`${i+1}. ___ Marco!`,answer:{accepted:['ciao']},explanation:'Une salutation.'}))}});
  const session=await call('compose_session',{requestId:'session-'+token,title,objective:notion,scheduledDate:'2020-01-01',itemIds:group.itemIds});await call('publish_session',{sessionId:session.id});
  await page.goto(base);await page.getByRole('button',{name:new RegExp(title)}).click();
  await page.getByRole('textbox',{name:'Votre réponse',exact:true}).fill('salut');
  await page.route('**/api/attempt',route=>route.fulfill({status:500,body:'{}'}),{times:1});
  await page.getByRole('button',{name:'Envoyer',exact:true}).click();await expect(page.getByRole('region',{name:'Votre pratique'}).getByRole('alert')).toContainText('Opération impossible');
  await page.getByRole('button',{name:'Envoyer',exact:true}).click();await expect(page.locator('.exercise-feedback')).toContainText('À revoir.');
  await page.reload();await page.getByRole('button',{name:new RegExp(title)}).click();
  // La reprise choisit le premier item non travaillé, sans effacer la première erreur.
  for(let i=0;i<3;i++) {
   await page.getByRole('textbox',{name:'Votre réponse',exact:true}).fill('ciao');await page.getByRole('button',{name:'Envoyer',exact:true}).click();await expect(page.locator('.exercise-feedback')).toContainText('Correct.');await page.getByRole('button',{name:'Continuer',exact:true}).click();
  }
  await expect(page.getByText('Nouvel essai après correction.',{exact:false})).toBeVisible();
  await page.getByRole('textbox',{name:'Votre réponse',exact:true}).fill('ciao');await page.getByRole('button',{name:'Envoyer',exact:true}).click();await expect(page.getByText('Réponse après aide ou correction : entraînement enregistré, consolidation inchangée.',{exact:true})).toBeVisible();
  const journal=await call('get_error_journal',{});const item=journal.items.find((x:{item_id:string})=>x.item_id===group.itemIds[0]);expect(item.history).toHaveLength(2);expect(item.revision.successes).toBe(0);expect(item.history[0].answer).toBe('salut');
  await page.getByRole('navigation',{name:'Autres espaces'}).getByRole('link',{name:'Carnet d’erreurs',exact:true}).click();await page.getByRole('textbox',{name:'Notion',exact:true}).fill(notion);
  await expect(page.getByRole('heading',{name:'1. ___ Marco!',exact:true})).toBeVisible();await expect(page.getByText('Historique des tentatives (2)',{exact:true})).toBeVisible();
  for(const width of [320,768,1024,1440]) {await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('region',{name:'Carnet d’erreurs',exact:true}).screenshot({path:'artifacts/error-journal-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.getByRole('region',{name:'Carnet d’erreurs',exact:true}).screenshot({path:'artifacts/error-journal-mobile.png'});
  await page.getByRole('button',{name:'Réviser les items affichés',exact:true}).click();await expect(page.getByRole('heading',{name:'Entraînement libre',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Votre réponse',exact:true}).fill('ciao');await page.getByRole('button',{name:'Envoyer',exact:true}).click();await expect(page.locator('.exercise-feedback')).toContainText('Correct.');
  const updated=await call('get_error_journal',{});const history=updated.items.find((x:{item_id:string})=>x.item_id===group.itemIds[0]).history;expect(history).toHaveLength(3);expect(history[2].context).toBe('practice');
  expect(errors).toEqual([]);
 } finally {await client.close();}
});
