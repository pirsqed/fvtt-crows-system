import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.ActorSheet=class { static get defaultOptions(){return {};} async getData(){return {};} };
globalThis.ItemSheet=ActorSheet;
globalThis.foundry={utils:{mergeObject:(a,b)=>({...a,...b})}};
globalThis.TextEditor={enrichHTML:async text=>text};
const {CrowsVillageSheet}=await import('../module/sheets/village-sheet.mjs');
const {CrowsVillageEntrySheet}=await import('../module/sheets/village-entry-sheet.mjs');
const doc=(id,name,system)=>({id,name,type:'villageEntry',system:{npcName:'',...system},toObject(){return {name,type:this.type,system:this.system};}});

test('village sheet combines local NPCs and connections, resolves references, and retains missing actors',async()=>{
 const members=[doc('crow','Old Crow name',{kind:'crow',status:'resident',actorId:'crow',npcName:'Friend',relationship:'Line 1\n<script>'}),
 doc('lost','Missing Crow',{kind:'crow',status:'away',actorId:'deleted',npcName:'Neighbour'}),
 doc('npc','Steward',{kind:'npc',status:'resident'}),
 doc('inn','Inn',{kind:'institution',status:'active',npcId:'npc',pendingLevel:2,readyCycle:3}),
 doc('quest','Quest',{kind:'quest',status:'open',npcId:'crow'})];
 const crow={name:'Current Crow',visible:true,isOwner:true,flags:{'fvtt-crows-system':{homeVillageId:'home'}}};
 globalThis.game={actors:{get:id=>id==='crow'?crow:undefined}};
 const sheet=new CrowsVillageSheet();sheet.isEditable=false;
 sheet.actor={id:'home',items:members,toObject:()=>({system:{prosperity:0,cycle:3}})};
 const data=await sheet.getData();
 assert.equal(data.editable,false);assert.equal(data.people.length,3);
 assert.equal(data.crows[0].displayName,'Current Crow');assert.equal(data.crows[0].isHome,true);
 assert.equal(data.crows[1].missingActor,true);assert.equal(data.crows[1].canOpenActor,false);
 assert.equal(data.institutions[0].stewardName,'Steward');assert.equal(data.institutions[0].ready,true);
 assert.equal(data.quests[0].issuerName,'Friend');assert.equal(data.activeQuests,1);
 assert.match(data.people.find(p=>p.id==='crow').relationshipHTML,/Line 1<br>&lt;script&gt;/);
});

test('observer village sheets reject mutations before submitting or writing',async()=>{
 const sheet=new CrowsVillageSheet();sheet.isEditable=false;sheet.actor={items:{get:()=>null},isOwner:false};
 sheet.submit=()=>assert.fail('must not submit');
 await assert.rejects(sheet._handleAction({villageAction:'add',kind:'npc'}),/permission/);
});

test('record editor retains unavailable NPC and actor links instead of clearing them',async()=>{
 globalThis.game={actors:{filter:()=>[]}};
 const sheet=new CrowsVillageEntrySheet();sheet.isEditable=true;
 sheet.item=doc('record','NPC',{kind:'npc',status:'resident',npcId:'missing-person',actorId:'missing-actor'});
 const data=await sheet.getData();
 assert.deepEqual(data.npcOptions,[{id:'missing-person',name:'Linked NPC unavailable',selected:true}]);
 assert.deepEqual(data.actorOptions,[{id:'missing-actor',name:'Linked actor unavailable',selected:true}]);
});
