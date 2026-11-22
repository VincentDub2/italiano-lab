import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir=mkdtempSync(join(tmpdir(),'data-test-')); process.env.ITALIANO_DB_PATH=join(dir,'test.sqlite');
async function main() {
 const transport=new StdioClientTransport({command:'/bin/sh',args:['scripts/mcp.sh'],env:{...process.env,ITALIANO_DB_PATH:process.env.ITALIANO_DB_PATH!} as Record<string,string>,stderr:'pipe'});
 const client=new Client({name:'integration-test',version:'1'}); await client.connect(transport);
 try {const tools=await client.listTools(); const call=async(name:string,args:Record<string,unknown>)=>{const r=await client.callTool({name,arguments:args}); if(r.isError) throw new Error(JSON.stringify(r)); return JSON.parse((r.content as {text:string}[])[0].text);};
 for (const [name,property] of [
  ['submit_feedback','observations'],['submit_feedback','requestId'],['compose_session','revisionLinks'],
  ['update_draft','revisionLinks'],['publish_session','requestId'],
  ['create_proactive_lesson','kind'],['create_proactive_lesson','prerequisiteNotionId'],
 ]) {
  const schema=tools.tools.find(tool=>tool.name===name)?.inputSchema;
  assert.ok(schema?.properties?.[property]);
  assert.ok(!schema.required?.includes(property));
 }
 for (const name of ['list_learning_signals','list_notion_progress','resolve_learning_notion','create_proactive_lesson','get_proactive_lesson','list_proactive_lessons','publish_proactive_lesson']) {
  assert.ok(tools.tools.some(tool=>tool.name===name));
 }
 const notion=await call('resolve_learning_notion',{requestId:'notion-contract',name:'Temps du récit'});
 assert.deepEqual(await call('resolve_learning_notion',{requestId:'notion-contract',name:'Temps du récit'}),notion);
 assert.equal((await call('list_learning_signals',{notionId:notion.id})).state,'no_data');
 assert.deepEqual((await call('list_notion_progress',{notionId:notion.id,limit:1})).notions,[]);
 for (const name of ['create_session','compose_session','update_draft']) {
  const schema=tools.tools.find(tool=>tool.name===name)?.inputSchema;
  assert.ok(schema?.properties?.takeaways);
  assert.ok(!schema.required?.includes('takeaways'));
  assert.ok(schema?.properties?.reminders);
  assert.ok(!schema.required?.includes('reminders'));
 }
 const takeaways=[{title:'Essere',explanation:'Utilisez sono pour parler de vous.',examples:[{italian:'Sono di Roma.',french:'Je suis de Rome.'}]}];
 const creation={requestId:'integration',title:'Test',objective:'Écrire',scheduledDate:'2026-01-01',exercises:[{type:'free_text',instruction:'Présentez-vous',items:[{content:'Écrivez.',answer:{}},{content:'Décrivez votre ville.',answer:{}}]}]};
 const canonical=await call('create_session',{...creation,requestId:'canonical-reminders',reminders:takeaways});
 assert.deepEqual((await call('get_session',{sessionId:canonical.id})).reminders,takeaways);
 const s=await call('create_session',{...creation,takeaways});
 assert.deepEqual(await call('create_session',{...creation,takeaways}),s);
 await assert.rejects(call('create_session',creation),/Identifiant déjà utilisé/);
 assert.deepEqual((await call('get_session',{sessionId:s.id})).takeaways,takeaways);
 const withoutCards=await call('create_session',{...creation,requestId:'no-cards'});
 await call('publish_session',{sessionId:withoutCards.id});
 assert.deepEqual((await call('get_session',{sessionId:withoutCards.id})).takeaways,[]);
 for (const invalid of [Array(4).fill(takeaways[0]), [{...takeaways[0],examples:[]}], [{...takeaways[0],examples:[{italian:'Ciao',french:'  '}]}]]) {
  await assert.rejects(call('create_session',{...creation,requestId:'invalid-cards',takeaways:invalid}),/takeaways/);
 }
 const domain=await import('../src/server/domain'); assert.throws(()=>domain.getSession(s.id,true)); await call('publish_session',{sessionId:s.id}); await call('publish_session',{sessionId:s.id}); const items=domain.getSession(s.id,true).exercises; assert.equal(items.length,2); assert.equal(items[0].group_id,items[1].group_id); const exercise=items[0]; assert.ok(!('answer_json' in exercise)); const a=domain.submitAttempt({exerciseId:exercise.id,requestId:'attempt',answer:'Sono una guida'}); assert.equal(a.is_correct,null); assert.equal(a.status,'pending_teacher'); assert.equal((await call('get_pending_answers',{}))[0].id,a.id); await call('submit_feedback',{attemptId:a.id,result:'correct',correction:'Sono una guida.',explanation:'Phrase correcte.'}); const read=await call('get_attempt',{attemptId:a.id}); assert.equal(read.feedback.correction,'Sono una guida.'); assert.equal(domain.feedbackList()[0].feedback.explanation,'Phrase correcte.'); assert.equal(domain.getSession(s.id,true).exercises[1].latestAttempt,null); const group=await call('create_bank_exercise',{requestId:'bank-integration',notions:['Articles'],exercise:{type:'cloze',instruction:'Complétez',items:[{content:'Il ___',answer:{accepted:['gatto']}}]}});
 const found=await call('search_bank',{notion:'Articles'});assert.equal(found[0].item_id,group.itemIds[0]);
 const composed=await call('compose_session',{requestId:'compose-integration',title:'Banque',objective:'Articles',scheduledDate:'2026-01-01',itemIds:group.itemIds,takeaways});
 const preview=()=>call('get_session',{sessionId:composed.id});
 assert.deepEqual((await preview()).takeaways,takeaways);
 const edit={sessionId:composed.id,title:'Banque modifiée',objective:'Articles',scheduledDate:'2026-01-02',itemIds:group.itemIds};
 await call('update_draft',{...edit,requestId:'update-integration'});
 assert.equal((await preview()).title,'Banque modifiée');
 assert.deepEqual((await preview()).takeaways,takeaways);
 await call('update_draft',{...edit,requestId:'clear-cards',takeaways:[]});
 assert.deepEqual((await preview()).takeaways,[]);
 const finalCards=[{title:'Il ou la',explanation:'L’article change selon le genre.',examples:[{italian:'Il gatto.',french:'Le chat.'},{italian:'La strada.',french:'La rue.'}]}];
 await call('update_draft',{...edit,requestId:'replace-cards',reminders:finalCards});
 assert.deepEqual((await preview()).takeaways,finalCards);
 await call('publish_session',{sessionId:composed.id});
 const published=await preview();
 await assert.rejects(call('update_draft',{...edit,requestId:'late-edit',takeaways:[]}),/Seul un brouillon/);
 assert.deepEqual(await preview(),published);
 const occurrence=domain.getSession(composed.id).exercises[0];const wrong=domain.submitAttempt({exerciseId:occurrence.id,requestId:'bank-wrong',answer:'cane'});
 assert.equal((await call('get_error_journal',{})).items[0].history[0].answer,'cane');
 await call('rectify_feedback',{requestId:'rectification',attemptId:wrong.id,correction:'Verdict neutralisé',explanation:'Test du contrat'});
 assert.equal((await call('get_attempt',{attemptId:wrong.id})).neutralized,true);
 const plan=await call('get_daily_plan',{});assert.equal(plan.outcome,'session_needed');
 console.log('MCP create/compose/update/publish et relecture des cartes, réponses et corrections : OK');
 } finally {await client.close();}
}
main().finally(()=>rmSync(dir,{recursive:true,force:true})).catch(e=>{console.error(e);process.exitCode=1;});
