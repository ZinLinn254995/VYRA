import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVyralFolderActionPendingPlan, validateVyralFolderActionPendingAction } from '../src/server/vyralFolderAction.ts';

const now=Date.now();
const base={id:'11111111-1111-4111-8111-111111111111',target:{vyralId:'22222222-2222-4222-8222-222222222222',folderId:'33333333-3333-4333-8333-333333333333'},parameters:{name:'Characters',nextParentId:null},summary:'Create Characters folder',createdAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+5*60*1000).toISOString(),operation:'folder.create'};

test('validates folder create, rename, move, empty-folder delete and Asset folder move plans',()=>{
  assert.equal(parseVyralFolderActionPendingPlan(base)?.operation,'folder.create');
  assert.equal(parseVyralFolderActionPendingPlan({...base,operation:'folder.rename',parameters:{name:'Cast',previousName:'Characters',previousParentId:null}})?.operation,'folder.rename');
  assert.equal(parseVyralFolderActionPendingPlan({...base,operation:'folder.move',parameters:{previousParentId:null,nextParentId:'44444444-4444-4444-8444-444444444444'}})?.operation,'folder.move');
  assert.equal(parseVyralFolderActionPendingPlan({...base,operation:'asset.move_folder',target:{vyralId:base.target.vyralId,assetId:'55555555-5555-4555-8555-555555555555'},parameters:{previousFolderId:null,nextParentId:base.target.folderId,expectedUpdatedAt:new Date(now-2000).toISOString()}})?.operation,'asset.move_folder');
  assert.equal(parseVyralFolderActionPendingPlan({...base,operation:'folder.delete',parameters:{previousName:'Characters',previousParentId:null,expectedCreatedAt:new Date(now-2000).toISOString(),confirmationCode:'A1B2C3'}})?.operation,'folder.delete');
});

test('rejects unsafe names, malformed targets, same destination and expired plans',()=>{
  assert.equal(parseVyralFolderActionPendingPlan({...base,parameters:{name:'../bad',nextParentId:null}}),null);
  assert.equal(parseVyralFolderActionPendingPlan({...base,target:{...base.target,folderId:'bad'}}),null);
  assert.equal(parseVyralFolderActionPendingPlan({...base,operation:'folder.rename',parameters:{name:'A',previousName:'A',previousParentId:null}}),null);
  assert.equal(parseVyralFolderActionPendingPlan({...base,operation:'folder.move',parameters:{previousParentId:null,nextParentId:null}}),null);
  assert.equal(parseVyralFolderActionPendingPlan({...base,expiresAt:new Date(now-1).toISOString()}),null);
  assert.equal(parseVyralFolderActionPendingPlan({...base,operation:'folder.delete',parameters:{previousName:'Characters',previousParentId:null,expectedCreatedAt:new Date(now-2000).toISOString(),confirmationCode:'bad'}}),null);
});

test('binds approval to exact owner, session, action and pending state',()=>{
  const row={id:base.id,user_id:'owner-1',session_id:'chat-1',capability_id:'folder.update',status:'pending',expires_at:base.expiresAt,plan:base};
  const expected={userId:'owner-1',sessionId:'chat-1',actionId:base.id,now};
  assert.equal(validateVyralFolderActionPendingAction(row,expected)?.id,base.id);
  assert.equal(validateVyralFolderActionPendingAction(row,{...expected,userId:'owner-2'}),null);
  assert.equal(validateVyralFolderActionPendingAction(row,{...expected,sessionId:'chat-2'}),null);
  assert.equal(validateVyralFolderActionPendingAction({...row,status:'approved'},expected),null);
  const deletePlan={...base,operation:'folder.delete',parameters:{previousName:'Characters',previousParentId:null,expectedCreatedAt:new Date(now-2000).toISOString(),confirmationCode:'A1B2C3'}};
  const deleteRow={...row,capability_id:'folder.delete',plan:deletePlan};
  assert.equal(validateVyralFolderActionPendingAction(deleteRow,expected)?.operation,'folder.delete');
  assert.equal(validateVyralFolderActionPendingAction({...deleteRow,capability_id:'folder.update'},expected),null);
});
