import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVyralAssetRestoreConfirmation, parseVyralAssetRestorePendingPlan, validateVyralAssetRestorePendingAction } from '../src/server/vyralAssetRestoreAction.ts';
const now=Date.now();
const plan={id:'33333333-3333-4333-8333-333333333333',operation:'asset.restore',
 target:{vyralId:'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d',assetId:'11111111-1111-4111-8111-111111111111'},
 parameters:{assetName:'Reference image',previousStatus:'archived',expectedUpdatedAt:new Date(now-1000).toISOString(),confirmationCode:'A7K2Q9'},
 summary:'Restore Asset "Reference image"',createdAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+5*60*1000).toISOString()};
test('requires the exact RESTORE ASSET code phrase',()=>{
 assert.equal(parseVyralAssetRestoreConfirmation('RESTORE ASSET A7K2Q9'),'A7K2Q9');
 assert.equal(parseVyralAssetRestoreConfirmation('restore asset a7k2q9'),'A7K2Q9');
 assert.equal(parseVyralAssetRestoreConfirmation('yes'),null);
 assert.equal(parseVyralAssetRestoreConfirmation('RESTORE ASSET A7K2Q9 please'),null);
});
test('accepts a bounded restore preview for one archived Asset',()=>{
 assert.equal(parseVyralAssetRestorePendingPlan(plan)?.operation,'asset.restore');
});
test('rejects invalid targets, statuses, codes and expiry',()=>{
 const bad=structuredClone(plan);bad.target.assetId='bad';assert.equal(parseVyralAssetRestorePendingPlan(bad),null);
 const status=structuredClone(plan);status.parameters.previousStatus='ready';assert.equal(parseVyralAssetRestorePendingPlan(status),null);
 const code=structuredClone(plan);code.parameters.confirmationCode='restore';assert.equal(parseVyralAssetRestorePendingPlan(code),null);
 const expired=structuredClone(plan);expired.expiresAt=new Date(now-1).toISOString();assert.equal(parseVyralAssetRestorePendingPlan(expired),null);
});
test('binds restore to exact owner, session, action, capability and expiry',()=>{
 const row={id:plan.id,user_id:'owner-1',session_id:'session-1',capability_id:'asset.restore',status:'pending',expires_at:plan.expiresAt,plan};
 assert.ok(validateVyralAssetRestorePendingAction(row,{userId:'owner-1',sessionId:'session-1',actionId:plan.id,now}));
 assert.equal(validateVyralAssetRestorePendingAction(row,{userId:'owner-2',sessionId:'session-1',actionId:plan.id,now}),null);
 assert.equal(validateVyralAssetRestorePendingAction(row,{userId:'owner-1',sessionId:'other',actionId:plan.id,now}),null);
 assert.equal(validateVyralAssetRestorePendingAction({...row,expires_at:new Date(now+4*60*1000).toISOString()},{userId:'owner-1',sessionId:'session-1',actionId:plan.id,now}),null);
});
