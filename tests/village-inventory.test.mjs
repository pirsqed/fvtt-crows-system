import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrowsLoot } from '../module/loot.mjs';
globalThis.ActorSheet=class { async getData(){return {};} };
globalThis.TextEditor={enrichHTML:async text=>text,getDragEventData:()=>({type:'Item'})};
const {CrowsVillageSheet}=await import('../module/sheets/village-sheet.mjs');

test('shared stores display equipment and preserve quantities',async()=>{
 const sheet=new CrowsVillageSheet();sheet.isEditable=true;
 const item={id:'loot',type:'equipment',toObject:()=>({name:'Recovered sword',system:{quantity:2}})};
 sheet.actor={items:[item],toObject:()=>({system:{prosperity:0}})};
 const data=await sheet.getData();
 assert.equal(data.inventory.length,1);assert.equal(data.inventory[0].system.quantity,2);
 assert.equal(data.people.length,0);
});

test('drops copy directory equipment, transfer carried gear, and reject unsupported or read-only drops',async()=>{
 const sheet=new CrowsVillageSheet();sheet.isEditable=true;sheet.submit=async()=>{};
 const writes=[],transfers=[],warnings=[];
 sheet.actor={uuid:'Actor.village',isOwner:true,createEmbeddedDocuments:async(type,data)=>writes.push(data)};
 const item={type:'equipment',toObject:()=>({_id:'old',name:'Loot',type:'equipment',system:{quantity:3,location:'hand1'}})};
 globalThis.Item={implementation:{fromDropData:async()=>item}};
 globalThis.ui={notifications:{warn:message=>warnings.push(message),error:message=>assert.fail(message)}};
 const oldTransfer=CrowsLoot.transfer;
 CrowsLoot.transfer=async(...args)=>transfers.push(args);
 const drop=()=>sheet._onDrop({preventDefault(){}});
 try {
  await drop();assert.equal(writes[0][0]._id,undefined);assert.equal(writes[0][0].system.location,'stash');
  assert.equal(writes[0][0].system.quantity,3);
  item.parent={uuid:'Actor.crow'};await drop();
  assert.deepEqual(transfers[0],[item,sheet.actor,{location:'stash'}]);
  item.parent=sheet.actor;await drop();assert.equal(transfers.length,1);assert.equal(writes.length,1);
  item.type='trait';await drop();assert.equal(warnings.length,1);
  sheet.isEditable=false;item.type='equipment';item.parent=null;await drop();assert.equal(writes.length,1);
 } finally {CrowsLoot.transfer=oldTransfer;}
});

test('inventory drag exports an item reference only for village owners',()=>{
 const sheet=new CrowsVillageSheet();sheet.isEditable=true;
 sheet.actor={isOwner:true,items:{get:()=>({type:'equipment',toDragData:()=>({type:'Item',uuid:'Actor.village.Item.loot'})})}};
 const payloads=[],event={currentTarget:{dataset:{itemId:'loot'}},dataTransfer:{setData:(type,data)=>payloads.push(JSON.parse(data))}};
 sheet._onDragStart(event);assert.deepEqual(payloads,[{type:'Item',uuid:'Actor.village.Item.loot'}]);
 sheet.actor.isOwner=false;sheet._onDragStart(event);assert.equal(payloads.length,1);
});

test('village storage has no slot limit and transfers require both actor ownerships',()=>{
 const player={isGM:false};
 const village={uuid:'Actor.village',type:'village',testUserPermission:()=>true};
 const crow={uuid:'Actor.crow',type:'crow',testUserPermission:()=>true};
 assert.equal(CrowsLoot.fits(village,'stash',100),true);
 assert.equal(CrowsLoot.canTransfer(crow,village,player),true);
 assert.equal(CrowsLoot.canTransfer(village,crow,player),true);
 village.testUserPermission=()=>false;
 assert.equal(CrowsLoot.canTransfer(crow,village,player),false);
 assert.equal(CrowsLoot.canTransfer(village,crow,player),false);
});
