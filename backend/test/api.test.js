// Route-level tests for the API starter using the in-memory Firestore/Auth fake.
// These verify authorization and money rules in app.js; they do NOT replace Firebase Emulator tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../app.js';
import {FakeFirestore,FakeAuth,FieldValue} from './fake-firestore.js';

async function setup(){
 const db=new FakeFirestore(),auth=new FakeAuth(),errors=[];
 const app=createApp({db,auth,FieldValue,ownerEmail:'Owner@Example.test',logger:{error:(...a)=>errors.push(a)}});
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const base=`http://127.0.0.1:${server.address().port}`;
 auth.issue('owner',{uid:'o',email:'owner@example.test',email_verified:true});
 auth.issue('staff',{uid:'s',email:'staff@example.test',email_verified:true});
 auth.issue('other',{uid:'x',email:'other@example.test',email_verified:true});
 auth.issue('unverified',{uid:'u',email:'unverified@example.test',email_verified:false});
 const call=async(method,path,token,body,raw)=>{
  const headers={};if(token)headers.authorization=`Bearer ${token}`;if(body!==undefined||raw!==undefined)headers['content-type']='application/json';
  const res=await fetch(base+path,{method,headers,body:raw??(body===undefined?undefined:JSON.stringify(body))});
  return {status:res.status,body:await res.json().catch(()=>null)};
 };
 return {db,auth,call,errors,close:()=>new Promise(r=>server.close(r))};
}

test('authentication is required and only verified, granted, active users get access',async t=>{
 const {call,close}=await setup();t.after(close);
 assert.equal((await call('GET','/api/me')).status,401);
 assert.equal((await call('GET','/api/me','not-a-token')).status,401);
 assert.equal((await call('GET','/api/me','unverified')).status,401);
 const me=await call('GET','/api/me','owner');
 assert.equal(me.status,200);assert.equal(me.body.role,'Admin');
 const staff=await call('GET','/api/me','staff');
 assert.equal(staff.status,403);assert.match(staff.body.error,/not been granted/);
});

test('only the owner manages team access, with validated permissions',async t=>{
 const {call,close}=await setup();t.after(close);
 assert.equal((await call('PUT','/api/team/staff@example.test','owner',{role:'Staff',status:'Active',permissions:['Root']})).status,400);
 assert.equal((await call('PUT','/api/team/owner@example.test','owner',{role:'Staff',status:'Active',permissions:[]})).status,400);
 assert.equal((await call('PUT','/api/team/staff@example.test','owner',{role:'Staff',status:'Active',permissions:['Clients','Clients']})).status,200);
 assert.equal((await call('GET','/api/team','staff')).status,403);
 const team=await call('GET','/api/team','owner');
 assert.deepEqual(team.body.find(u=>u.email==='staff@example.test').permissions,['Clients']);
 assert.equal((await call('PUT','/api/team/staff@example.test','owner',{role:'Staff',status:'Disabled',permissions:['Clients']})).status,200);
 const disabled=await call('GET','/api/me','staff');
 assert.equal(disabled.status,403);assert.match(disabled.body.error,/not active/);
});

test('full billing flow: currency limits, fee caps, approvals, refunds, corrections and audit',async t=>{
 const {db,call,close}=await setup();t.after(close);
 await call('PUT','/api/team/staff@example.test','owner',{role:'Staff',status:'Active',permissions:['Clients','Matters','Billing','BDT accounts']});
 await call('PUT','/api/team/other@example.test','owner',{role:'Staff',status:'Active',permissions:['Clients','Matters','Billing','BDT accounts']});

 const client=await call('POST','/api/clients','staff',{name:'Sample Client',segment:'Bangladesh',country:'Bangladesh'});
 assert.equal(client.status,201,'client email is optional');
 assert.equal((await call('POST','/api/matters','staff',{clientId:client.body.id,title:'Case',category:'Bangladesh Law',country:'Bangladesh',currency:'USD',professionalFeeCents:100,governmentFeeCents:0})).status,403);
 assert.equal((await call('POST','/api/matters','other',{clientId:client.body.id,title:'Case',category:'Bangladesh Law',country:'Bangladesh',currency:'BDT',professionalFeeCents:100,governmentFeeCents:0})).status,403,'client not assigned');
 const matter=await call('POST','/api/matters','staff',{clientId:client.body.id,title:'Civil case',category:'Bangladesh Law',country:'Bangladesh',currency:'BDT',professionalFeeCents:500000,governmentFeeCents:0});
 assert.equal(matter.status,201);const mid=matter.body.id;

 const first=await call('POST','/api/installments','staff',{matterId:mid,amountCents:300000,dueDate:'2026-12-01',label:'1st installment'});
 assert.equal(first.status,201);
 const tooMuch=await call('POST','/api/installments','staff',{matterId:mid,amountCents:300000,dueDate:'2027-01-01',label:'2nd installment'});
 assert.equal(tooMuch.status,400);assert.match(tooMuch.body.error,/exceed the agreed fees/);
 assert.equal((await call('POST','/api/installments','staff',{matterId:mid,amountCents:200000,dueDate:'2026-02-30',label:'2nd installment'})).status,400,'invalid date');
 assert.equal((await call('POST','/api/installments','staff',{matterId:mid,amountCents:200000,dueDate:'2027-01-01',label:'2nd installment'})).status,201);
 assert.equal((await call('GET',`/api/matters/${mid}/installments`,'staff')).body.length,2);
 assert.equal((await call('GET',`/api/matters/${mid}/installments`,'other')).status,403,'unassigned staff cannot read');

 const pay={installmentId:first.body.id,requestId:'req-pay-1',amountCents:300000,date:'2026-11-01',coverage:'Full',method:'Cash'};
 assert.equal((await call('POST','/api/payments','staff',pay)).status,201);
 assert.equal((await call('POST','/api/payments','staff',pay)).status,409,'idempotency key reuse');
 assert.equal((await call('POST','/api/payments','staff',{...pay,requestId:'req-pay-2',amountCents:300001})).status,400);
 assert.equal((await call('POST','/api/payments/req-pay-1/approve','staff')).status,403);
 assert.equal((await call('POST','/api/payments/req-pay-1/approve','owner')).status,200);
 assert.equal((await call('POST','/api/payments/req-pay-1/approve','owner')).status,400,'no double approval');
 assert.equal(db.all('matters')[0].paidApprovedCents,300000);

 const correction=await call('PATCH','/api/payments/req-pay-1','staff',{amountCents:250000});
 assert.equal(correction.status,403);assert.match(correction.body.error,/Only an admin/);
 assert.equal((await call('PATCH','/api/payments/req-pay-1','owner',{amountCents:250000})).status,200);
 assert.equal(db.all('installments').find(i=>i.id===first.body.id).paidApprovedCents,250000);

 const refund={paymentId:'req-pay-1',requestId:'req-refund-1',amountCents:300000,date:'2026-11-05',method:'Cash',reason:'Overpaid'};
 assert.equal((await call('POST','/api/refunds','staff',refund)).status,400,'refund above corrected payment');
 assert.equal((await call('POST','/api/refunds','staff',{...refund,amountCents:50000,date:'2026-10-01'})).status,400,'refund before payment');
 assert.equal((await call('POST','/api/refunds','staff',{...refund,amountCents:50000})).status,201);
 assert.equal((await call('POST','/api/refunds/req-refund-1/approve','staff')).status,403);
 assert.equal((await call('POST','/api/refunds/req-refund-1/approve','owner')).status,200);
 assert.equal(db.all('matters')[0].paidApprovedCents,200000);
 assert.equal((await call('GET',`/api/matters/${mid}/refunds`,'staff')).body[0].status,'Approved');

 const audit=await call('GET',`/api/matters/${mid}/audit`,'owner');
 const actions=audit.body.map(e=>e.action);
 for(const a of ['matter_created','installment_created','payment_recorded','payment_approved','payment_corrected','refund_recorded','refund_approved'])assert.ok(actions.includes(a),`audit has ${a}`);
});

test('malformed requests return JSON client errors instead of 500',async t=>{
 const {call,close,errors}=await setup();t.after(close);
 const bad=await call('POST','/api/clients','owner',undefined,'{"name":');
 assert.equal(bad.status,400);assert.equal(bad.body.error,'Invalid request body.');
 const missing=await call('GET','/api/does-not-exist','owner');
 assert.equal(missing.status,404);assert.equal(missing.body.error,'Not found.');
 assert.equal((await call('GET','/api/matters/..%2Fusers/payments','owner')).status,400,'identifiers are validated');
 assert.equal(errors.length,0);
});
