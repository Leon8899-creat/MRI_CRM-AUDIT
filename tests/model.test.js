import test from 'node:test';
import assert from 'node:assert/strict';
import {loadState,saveState,seed,storageKey,normalizeState,mayAccessSection,remainingToSchedule,addSampleBdtTransactions,paidFor,clientCurrencyTotals,editPaymentAmount,approveRefund} from '../dist/model.js';

const memoryStorage=(initial={})=>{const m=new Map(Object.entries(initial));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v))};};

test('stored data missing newer collections is normalized instead of crashing the app',()=>{
 const storage=memoryStorage({[storageKey]:JSON.stringify({matters:[],payments:[]})});
 const s=loadState(storage);
 for(const k of ['inquiries','leads','clients','tasks','installments','refunds','invoices','invoiceChanges','messages','documentRequests','paymentEvents','visaRecords'])assert.deepEqual(s[k],[],k);
 assert.ok(s.team.length>0,'team falls back to the seeded owner');
 assert.equal(loadState(memoryStorage({[storageKey]:'{not json'})).matters.length,seed().matters.length,'corrupt data falls back to seed');
 const round=memoryStorage();saveState(round,s);assert.deepEqual(loadState(round),s);
});

test('section access follows Team & access permissions; admin sees everything',()=>{
 const [admin,caseManager,accounts]=seed().team;
 assert.equal(mayAccessSection(admin,'billing'),true);
 assert.equal(mayAccessSection(admin,'team'),true);
 assert.equal(mayAccessSection(caseManager,'billing'),false,'case manager has no Billing grant');
 assert.equal(mayAccessSection(caseManager,'matters'),true);
 assert.equal(mayAccessSection(caseManager,'inquiries'),true,'Leads grant covers website inquiries');
 assert.equal(mayAccessSection(accounts,'billing'),true);
 assert.equal(mayAccessSection(accounts,'leads'),false);
 assert.equal(mayAccessSection(accounts,'team'),false);
 assert.equal(mayAccessSection(accounts,'dashboard'),true);
 assert.equal(mayAccessSection({...accounts,status:'Disabled'},'billing'),false);
});

test('installments cannot be scheduled beyond the agreed professional + government fee',()=>{
 const s=normalizeState(seed());
 assert.equal(remainingToSchedule(s,'m1'),100000,'3,500 fee minus 2,500 scheduled');
 s.matters.push({id:'nofee',currency:'USD',fee:0,governmentFee:0});
 assert.equal(remainingToSchedule(s,'nofee'),null,'no agreed fee recorded means no cap');
 assert.throws(()=>remainingToSchedule(s,'missing'),/not found/);
});

test('sample BDT transactions link every payment to an installment so all balances agree',()=>{
 const s=normalizeState(seed());
 addSampleBdtTransactions(s,'2026-11-21');addSampleBdtTransactions(s,'2026-11-21');
 const sample=s.payments.filter(p=>p.id.startsWith('sample-bdt-payment'));
 assert.equal(sample.length,12,'idempotent');
 assert.ok(sample.every(p=>s.installments.some(i=>i.id===p.installmentId&&i.matterId===p.matterId)));
 assert.equal(paidFor(s,'sample-bdt-installment-1'),400000);
 assert.deepEqual(clientCurrencyTotals(s,'sample-bdt-client-1').BDT,{agreed:1000000,paid:400000,scheduledBalance:0,feeBalance:600000});
 const admin=s.team[0];
 assert.throws(()=>editPaymentAmount(s,'sample-bdt-payment-1-1',100001,admin),/exceeds/,'edits are bounded by the linked installment');
 // Payments saved by the old version without an installment are repaired on the next run.
 delete s.payments.find(p=>p.id==='sample-bdt-payment-2-1').installmentId;
 addSampleBdtTransactions(s,'2026-11-21');
 assert.equal(s.payments.find(p=>p.id==='sample-bdt-payment-2-1').installmentId,'sample-bdt-installment-2');
});

test('refund approval rejects refunds against unapproved payments',()=>{
 const s=normalizeState(seed());
 s.refunds.push({id:'r',paymentId:'p2',matterId:'m3',amount:100,status:'Pending'});
 assert.throws(()=>approveRefund(s,'r'),/Original approved payment/);
});
